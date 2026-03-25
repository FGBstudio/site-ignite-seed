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

    const users = [
      { email: "admin@retailops.com", password: "admin123", fullName: "Admin Centrale", role: "ADMIN" },
      { email: "marco.rossi@retailops.com", password: "pm123", fullName: "Marco Rossi", role: "PM" },
      { email: "laura.bianchi@retailops.com", password: "pm123", fullName: "Laura Bianchi", role: "PM" },
    ];

    const results = [];

    for (const u of users) {
      // Check if user exists
      const { data: existing } = await supabase.auth.admin.listUsers();
      const found = existing?.users?.find((x: any) => x.email === u.email);

      let userId: string;
      if (found) {
        userId = found.id;
        results.push({ email: u.email, status: "exists", id: userId });
      } else {
        const { data, error } = await supabase.auth.admin.createUser({
          email: u.email,
          password: u.password,
          email_confirm: true,
          user_metadata: { full_name: u.fullName },
        });
        if (error) {
          results.push({ email: u.email, status: "error", error: error.message });
          continue;
        }
        userId = data.user.id;
        results.push({ email: u.email, status: "created", id: userId });
      }

      // Assign role (upsert)
      await supabase.from("user_roles").upsert(
        { user_id: userId, role: u.role },
        { onConflict: "user_id,role" }
      );
    }

    // Seed products
    const { data: existingProducts } = await supabase.from("products").select("id");
    if (!existingProducts || existingProducts.length === 0) {
      await supabase.from("products").insert([
        { sku: "MON-LEED-V2", name: "Monitor LEED v2", certification: "LEED", quantity_in_stock: 18, supplier_lead_time_days: 45 },
        { sku: "SENS-CO2-PRO", name: "Sensore CO2 Pro", certification: "CO2", quantity_in_stock: 35, supplier_lead_time_days: 30 },
      ]);
    }

    // Get PM user IDs for project seeding
    const { data: allUsers } = await supabase.auth.admin.listUsers();
    const marcoId = allUsers?.users?.find((x: any) => x.email === "marco.rossi@retailops.com")?.id;
    const lauraId = allUsers?.users?.find((x: any) => x.email === "laura.bianchi@retailops.com")?.id;

    // Seed projects if empty
    const { data: existingProjects } = await supabase.from("projects").select("id");
    if (!existingProjects || existingProjects.length === 0) {
      const futureDate = (days: number) => {
        const d = new Date();
        d.setDate(d.getDate() + days);
        return d.toISOString().split("T")[0];
      };

      await supabase.from("projects").insert([
        { name: "Miu Miu Dubai Mall", client: "Miu Miu", region: "ME", pm_id: marcoId, handover_date: futureDate(20), status: "Construction" },
        { name: "Prada San Diego", client: "Prada", region: "America", pm_id: lauraId, handover_date: futureDate(25), status: "Construction" },
        { name: "Prada Champs-Élysées", client: "Prada", region: "Europe", pm_id: marcoId, handover_date: futureDate(60), status: "Design" },
        { name: "Miu Miu Tokyo Ginza", client: "Miu Miu", region: "APAC", pm_id: lauraId, handover_date: futureDate(90), status: "Design" },
        { name: "Prada Milano Montenapoleone", client: "Prada", region: "Europe", pm_id: marcoId, handover_date: futureDate(120), status: "Design" },
        { name: "Miu Miu New York SoHo", client: "Miu Miu", region: "America", pm_id: lauraId, handover_date: futureDate(150), status: "Design" },
        { name: "Prada Singapore MBS", client: "Prada", region: "APAC", pm_id: lauraId, handover_date: futureDate(45), status: "Construction" },
        { name: "Miu Miu London Bond St", client: "Miu Miu", region: "Europe", pm_id: marcoId, handover_date: futureDate(35), status: "Construction" },
      ]);
    }

    return new Response(JSON.stringify({ success: true, users: results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
