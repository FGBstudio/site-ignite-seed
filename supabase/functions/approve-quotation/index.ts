// Edge function: approve-quotation
// Marks a certification's quotation as approved and emits two handover task_alerts.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  certification_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = claimsData.claims.sub as string;

    const body = (await req.json()) as Body;
    if (!body?.certification_id || typeof body.certification_id !== "string") {
      return new Response(JSON.stringify({ error: "certification_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Authorize: caller must be ADMIN.
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "ADMIN")
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load cert minimally
    const { data: cert, error: certErr } = await admin
      .from("certifications")
      .select("id, name, client, status")
      .eq("id", body.certification_id)
      .maybeSingle();
    if (certErr || !cert) {
      return new Response(JSON.stringify({ error: "Certification not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nowIso = new Date().toISOString();

    // Transition from "quotation" to "quotation_approved" (awaiting PM assignment in Operations)
    const { error: updErr } = await admin
      .from("certifications")
      .update({
        status: "quotation_approved",
        quotation_approved_at: nowIso,
        quotation_approved_by: userId,
      })
      .eq("id", cert.id);
    if (updErr) throw updErr;

    // Emit handover alerts (idempotency: skip if already present).
    const { data: existing } = await admin
      .from("task_alerts")
      .select("alert_type")
      .eq("certification_id", cert.id)
      .in("alert_type", ["quotation_to_operations", "quotation_to_payments"]);

    const present = new Set((existing || []).map((r: any) => r.alert_type));
    const inserts: any[] = [];
    if (!present.has("quotation_to_operations")) {
      inserts.push({
        certification_id: cert.id,
        created_by: userId,
        alert_type: "quotation_to_operations",
        title: `Assign PM — ${cert.name}`,
        description: `Quotation approved for ${cert.client}. Assign a Project Manager and configure the project timeline.`,
        is_resolved: false,
        escalate_to_admin: true,
        target_route: `/projects/${cert.id}`,
      });
    }
    if (!present.has("quotation_to_payments")) {
      inserts.push({
        certification_id: cert.id,
        created_by: userId,
        alert_type: "quotation_to_payments",
        title: `Set payment milestones — ${cert.name}`,
        description: `Quotation approved for ${cert.client}. Configure payment milestones and prepare first invoice.`,
        is_resolved: false,
        escalate_to_admin: true,
        target_route: `/invoice`,
      });
    }
    if (inserts.length) {
      const { error: alertErr } = await admin.from("task_alerts").insert(inserts);
      if (alertErr) throw alertErr;
    }

    return new Response(JSON.stringify({ ok: true, certification_id: cert.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
