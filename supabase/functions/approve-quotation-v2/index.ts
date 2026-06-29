import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createRemoteJWKSet, jwtVerify } from "npm:jose@5.9.6";
import { z } from "npm:zod@3.23.8";

const BodySchema = z.object({
  certification_id: z.string().uuid(),
});

type JsonRecord = Record<string, unknown>;

interface JwtPayload {
  iss?: string;
  sub?: string;
}

function jsonResponse(body: JsonRecord, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function decodeJwtPayload(token: string): JwtPayload | null {
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as JwtPayload;
  } catch {
    return null;
  }
}

function getSupabaseUrlFromIssuer(issuer: string | undefined): string | null {
  if (!issuer?.endsWith("/auth/v1")) return null;
  try {
    const url = new URL(issuer.replace(/\/auth\/v1$/, ""));
    if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) return null;
    return url.origin;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!serviceRoleKey) {
      return jsonResponse({ error: "Backend approval channel is not configured" }, 500);
    }

    const token = authHeader.replace("Bearer ", "");
    const jwtPayload = decodeJwtPayload(token);
    const targetSupabaseUrl = getSupabaseUrlFromIssuer(jwtPayload?.iss) ?? Deno.env.get("SUPABASE_URL");
    if (!targetSupabaseUrl) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return jsonResponse({ error: "certification_id must be a valid id" }, 400);
    }

    const adminClient = createClient(targetSupabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let userId: string;
    try {
      const jwks = createRemoteJWKSet(new URL(`${targetSupabaseUrl}/auth/v1/.well-known/jwks.json`));
      const { payload } = await jwtVerify(token, jwks, {
        issuer: `${targetSupabaseUrl}/auth/v1`,
      });
      if (typeof payload.sub !== "string" || !payload.sub) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }
      userId = payload.sub;
    } catch {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { data: roleRow, error: roleError } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["ADMIN", "admin"])
      .maybeSingle();

    if (roleError) {
      return jsonResponse({ error: `Role check failed: ${roleError.message}` }, 500);
    }

    if (!roleRow) {
      return jsonResponse({ error: "Forbidden: only Operations/Admin can approve quotations" }, 403);
    }

    const { data: certification, error: readError } = await adminClient
      .from("certifications")
      .select("id, name, client, status, quotation_approved_at")
      .eq("id", parsed.data.certification_id)
      .maybeSingle();

    if (readError) {
      return jsonResponse({ error: `Certification lookup failed: ${readError.message}` }, 500);
    }

    if (!certification) {
      return jsonResponse({ error: "Certification not found" }, 404);
    }

    if (certification.status === "quotation_approved") {
      return jsonResponse({
        ok: true,
        certification: {
          id: certification.id,
          name: certification.name,
          client: certification.client,
          status: certification.status,
          quotation_approved_at: certification.quotation_approved_at,
        },
      });
    }

    if (certification.status !== "quotation") {
      return jsonResponse({ error: `Cannot approve quotation from status '${certification.status}'` }, 409);
    }

    const approvedAt = new Date().toISOString();
    const { data: updated, error: updateError } = await adminClient
      .from("certifications")
      .update({
        status: "quotation_approved",
        quotation_approved_at: approvedAt,
        quotation_approved_by: userId,
      })
      .eq("id", certification.id)
      .eq("status", "quotation")
      .select("id, name, client, status, quotation_approved_at")
      .maybeSingle();

    if (updateError) {
      return jsonResponse({ error: `Database update failed: ${updateError.message}` }, 500);
    }

    if (!updated || updated.status !== "quotation_approved") {
      return jsonResponse({ error: "Quotation was not updated by the database" }, 500);
    }

    return jsonResponse({ ok: true, certification: updated });
  } catch (error) {
    return jsonResponse({ error: getErrorMessage(error) }, 500);
  }
});