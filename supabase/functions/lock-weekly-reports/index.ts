// Auto-locks weekly reports for the just-completed ISO week.
// Scheduled via pg_cron to run every Sunday at 23:59 Europe/Rome.
// For each user with time_entries in the week:
//   - if no weekly_reports row exists, insert one with auto-snapshot content
//   - mark row as 'locked'
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function startOfISOWeekUTC(d: Date): Date {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0=Sun..6=Sat
  const diff = day === 0 ? -6 : 1 - day; // shift to Monday
  date.setUTCDate(date.getUTCDate() + diff);
  return date;
}

function fmt(d: Date): string {
  return d.toISOString().slice(0, 10);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Compute the week that is ending (the current week, since cron fires Sunday 23:59)
  const now = new Date();
  const monday = startOfISOWeekUTC(now);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  const weekStart = fmt(monday);
  const weekEnd = fmt(sunday);

  // 1. Find all user_ids that have time entries in this week
  const { data: entries, error: entriesErr } = await supabase
    .from("time_entries")
    .select("user_id, certification_id, hours, description")
    .gte("entry_date", weekStart)
    .lte("entry_date", weekEnd);

  if (entriesErr) {
    return new Response(JSON.stringify({ error: entriesErr.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Group: user_id -> certification_id -> { hours, descriptions[] }
  const byUser = new Map<string, Map<string, { hours: number; descriptions: string[] }>>();
  for (const e of entries ?? []) {
    if (!byUser.has(e.user_id)) byUser.set(e.user_id, new Map());
    const map = byUser.get(e.user_id)!;
    const cur = map.get(e.certification_id) ?? { hours: 0, descriptions: [] };
    cur.hours += Number(e.hours);
    if (e.description?.trim()) cur.descriptions.push(`- ${e.description.trim()}`);
    map.set(e.certification_id, cur);
  }

  let locked = 0;
  let created = 0;

  for (const [userId, certMap] of byUser.entries()) {
    const autoContent = Array.from(certMap.entries()).map(([certification_id, v]) => ({
      certification_id,
      hours_snapshot: Math.round(v.hours * 100) / 100,
      summary: v.descriptions.join("\n"),
    }));

    // Check if a row already exists
    const { data: existing } = await supabase
      .from("weekly_reports")
      .select("id, content, status")
      .eq("user_id", userId)
      .eq("week_start", weekStart)
      .maybeSingle();

    if (existing) {
      if (existing.status === "locked") continue;
      const { error } = await supabase
        .from("weekly_reports")
        .update({ status: "locked", locked_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (!error) locked++;
    } else {
      const { error } = await supabase
        .from("weekly_reports")
        .insert({
          user_id: userId,
          week_start: weekStart,
          content: autoContent,
          status: "locked",
          locked_at: new Date().toISOString(),
        });
      if (!error) { created++; locked++; }
    }
  }

  return new Response(
    JSON.stringify({ week_start: weekStart, week_end: weekEnd, users: byUser.size, locked, created }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
