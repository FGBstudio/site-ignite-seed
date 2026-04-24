import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  timeline_to_configure: 'Timeline to Configure',
  milestone_deadline: 'Milestone Deadline',
  project_on_hold: 'Project On Hold',
  pm_operational: 'PM Operational',
  other_critical: 'Critical Issue',
  extra_canone: 'Extra-Canone',
  billing_due: 'Billing Due',
}

const APP_BASE_URL = 'https://site-ignite-seed.lovable.app'

interface AlertRow {
  id: string
  alert_type: string
  title: string
  description: string | null
  scheduled_date: string | null
  certification_id: string
  created_by: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  let alertId: string
  try {
    const body = await req.json()
    alertId = body.alertId
    if (!alertId || typeof alertId !== 'string') {
      throw new Error('alertId required')
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Invalid request body' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Load the alert
  const { data: alert, error: alertErr } = await supabase
    .from('task_alerts')
    .select('id, alert_type, title, description, scheduled_date, certification_id, created_by')
    .eq('id', alertId)
    .maybeSingle<AlertRow>()

  if (alertErr || !alert) {
    console.error('Alert lookup failed', { alertErr, alertId })
    return new Response(JSON.stringify({ error: 'Alert not found' }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Load certification (project + client)
  const { data: cert } = await supabase
    .from('certifications')
    .select('name, client')
    .eq('id', alert.certification_id)
    .maybeSingle()

  // Load PM profile
  const { data: pmProfile } = await supabase
    .from('profiles')
    .select('full_name, display_name, email')
    .eq('id', alert.created_by)
    .maybeSingle()

  const pmName =
    pmProfile?.full_name || pmProfile?.display_name || pmProfile?.email || '—'

  // Resolve admin recipients
  const { data: adminRoles, error: rolesErr } = await supabase
    .from('user_roles')
    .select('user_id')
    .in('role', ['ADMIN', 'admin'] as any)

  if (rolesErr) {
    console.error('Failed to load admin roles', rolesErr)
    return new Response(JSON.stringify({ error: 'Role lookup failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const adminIds = [...new Set((adminRoles ?? []).map((r: any) => r.user_id))]
  if (adminIds.length === 0) {
    return new Response(JSON.stringify({ ok: true, sent: 0 }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Load admin profiles, honour notify_escalations_email opt-out
  const { data: adminProfiles } = await supabase
    .from('profiles')
    .select('id, email, notify_escalations_email')
    .in('id', adminIds)

  const recipients = (adminProfiles ?? []).filter(
    (p: any) => p.email && p.notify_escalations_email !== false,
  )

  const alertTypeLabel = ALERT_TYPE_LABELS[alert.alert_type] ?? 'Escalation'
  const projectName = cert?.name ?? '—'
  const clientName = cert?.client ?? ''
  const ctaUrl = `${APP_BASE_URL}/admin-tasks?alertId=${alert.id}`

  const templateData = {
    alertTypeLabel,
    alertTitle: alert.title,
    description: alert.description ?? undefined,
    projectName,
    clientName,
    pmName,
    scheduledDate: alert.scheduled_date ?? undefined,
    ctaUrl,
  }

  // Fire all sends in parallel and return fast.
  // The actual email sending is async (queued by send-transactional-email),
  // so we don't need to await delivery — only the enqueue.
  const results = await Promise.allSettled(
    recipients.map((admin: any) =>
      supabase.functions.invoke('send-transactional-email', {
        body: {
          templateName: 'escalation-alert',
          recipientEmail: admin.email,
          idempotencyKey: `escalation-${alert.id}-${admin.id}`,
          templateData,
        },
      }),
    ),
  )

  let sent = 0
  const failures: Array<{ adminId: string; error: string }> = []
  results.forEach((r, idx) => {
    const admin = recipients[idx] as any
    if (r.status === 'fulfilled' && !r.value.error) {
      sent++
    } else {
      const errMsg =
        r.status === 'rejected'
          ? r.reason instanceof Error
            ? r.reason.message
            : String(r.reason)
          : r.value.error?.message ?? 'unknown error'
      failures.push({ adminId: admin.id, error: errMsg })
    }
  })

  if (failures.length > 0) {
    console.warn('Some escalation emails failed', { alertId, failures })
  }

  return new Response(
    JSON.stringify({ ok: true, sent, failed: failures.length }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  )
})
