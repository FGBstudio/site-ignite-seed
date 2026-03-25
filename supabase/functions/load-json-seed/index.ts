import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const body = await req.json();
    const { products, projects, allocations } = body;

    const log: string[] = [];

    // Step 1: Clear existing data (allocations first due to FK)
    await supabase.from("project_allocations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("projects").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("products").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    log.push("Cleared existing data");

    // Step 2: Insert products
    const productRows = products.map((p: any) => ({
      sku: p.sku,
      name: p.name,
      certification: p.certification,
      quantity_in_stock: p.quantityInStock,
      supplier_lead_time_days: p.supplierLeadTimeDays,
    }));
    const { data: insertedProducts, error: prodErr } = await supabase
      .from("products")
      .insert(productRows)
      .select("id, sku");
    if (prodErr) throw new Error(`Products insert error: ${prodErr.message}`);
    const skuToId: Record<string, string> = {};
    (insertedProducts || []).forEach((p: any) => { skuToId[p.sku] = p.id; });
    log.push(`Inserted ${insertedProducts?.length} products`);

    // Step 3: Collect unique PM emails and ensure profiles exist
    const uniqueEmails = [...new Set(projects.map((p: any) => p.pm_email))];
    const { data: existingProfiles } = await supabase.from("profiles").select("id, email");
    const emailToId: Record<string, string> = {};
    (existingProfiles || []).forEach((p: any) => { emailToId[p.email.toLowerCase()] = p.id; });

    // For PM emails not in profiles, we need to create auth users
    for (const email of uniqueEmails) {
      const emailLower = (email as string).toLowerCase();
      if (emailToId[emailLower]) continue;

      // Create auth user (profile auto-created by trigger)
      const { data: userData, error: userErr } = await supabase.auth.admin.createUser({
        email: emailLower,
        password: "pm12345!",
        email_confirm: true,
        user_metadata: { full_name: emailLower.split("@")[0].replace(/\./g, " ") },
      });
      if (userErr) {
        log.push(`Warning: Could not create user ${emailLower}: ${userErr.message}`);
        continue;
      }
      emailToId[emailLower] = userData.user.id;

      // Assign PM role
      await supabase.from("user_roles").upsert(
        { user_id: userData.user.id, role: "PM" },
        { onConflict: "user_id,role" }
      );
    }
    log.push(`Resolved ${uniqueEmails.length} PM emails`);

    // Step 4: Build reference_id to project mapping and insert projects
    const refToProjectId: Record<string, string> = {};
    const projectRows = projects.map((p: any) => ({
      name: p.name,
      client: p.client,
      region: p.region,
      pm_id: emailToId[(p.pm_email as string).toLowerCase()] || null,
      handover_date: p.handoverDate,
      status: p.status,
    }));

    // Insert in batches of 50
    for (let i = 0; i < projectRows.length; i += 50) {
      const batch = projectRows.slice(i, i + 50);
      const batchRefs = projects.slice(i, i + 50);
      const { data: inserted, error: projErr } = await supabase
        .from("projects")
        .insert(batch)
        .select("id, name");
      if (projErr) {
        log.push(`Project batch error at ${i}: ${projErr.message}`);
        continue;
      }
      // Map reference_id to inserted project id using name matching
      (inserted || []).forEach((ins: any) => {
        const orig = batchRefs.find((b: any) => b.name === ins.name);
        if (orig) refToProjectId[orig.reference_id] = ins.id;
      });
    }
    log.push(`Inserted ${Object.keys(refToProjectId).length} projects`);

    // Step 5: Insert allocations
    const allocRows = allocations
      .map((a: any) => {
        const projectId = refToProjectId[a.project_reference];
        const productId = skuToId[a.product_sku];
        if (!projectId || !productId) return null;
        return {
          project_id: projectId,
          product_id: productId,
          quantity: a.quantity,
          status: a.status,
          target_date: a.targetDate,
        };
      })
      .filter(Boolean);

    let allocInserted = 0;
    for (let i = 0; i < allocRows.length; i += 50) {
      const batch = allocRows.slice(i, i + 50);
      const { error: allocErr } = await supabase.from("project_allocations").insert(batch);
      if (allocErr) {
        log.push(`Allocation batch error at ${i}: ${allocErr.message}`);
      } else {
        allocInserted += batch.length;
      }
    }
    log.push(`Inserted ${allocInserted} allocations`);

    return new Response(JSON.stringify({ success: true, log }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
