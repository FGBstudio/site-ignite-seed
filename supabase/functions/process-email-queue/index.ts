// Email queue dispatcher.
// Triggered by pg_cron every 5 seconds. Drains `auth_emails` (priority) then
// `transactional_emails`. Sends via Resend's official API directly.
// Handles rate-limit (429), retries (5xx), TTL expiry, and DLQ routing.

import { createClient } from 'npm:@supabase/supabase-js@2'

const RESEND_API_URL = 'https://api.resend.com'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface EmailPayload {
  message_id: string
  to: string
  from: string
  sender_domain?: string
  subject: string
  html: string
  text?: string
  purpose?: string
  label?: string
  idempotency_key?: string
  unsubscribe_token?: string
  queued_at?: string
}

interface QueueMessage {
  msg_id: number
  read_ct: number
  enqueued_at: string
  vt: string
  message: EmailPayload
}

const MAX_ATTEMPTS = 5

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const resendApiKey = Deno.env.get('RESEND_ALERTS_API_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    return json({ error: 'Server misconfigured' }, 500)
  }
  if (!resendApiKey) {
    console.error('Missing RESEND_ALERTS_API_KEY')
    return json({ error: 'Email provider not configured' }, 500)
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  // Load throughput config (singleton row)
  const { data: stateRow } = await supabase
    .from('email_send_state')
    .select('*')
    .eq('id', 1)
    .maybeSingle()

  const batchSize: number = stateRow?.batch_size ?? 10
  const sendDelayMs: number = stateRow?.send_delay_ms ?? 200
  const authTtl: number = stateRow?.auth_email_ttl_minutes ?? 15
  const txTtl: number = stateRow?.transactional_email_ttl_minutes ?? 60
  const rateLimitedUntil: string | null = stateRow?.rate_limited_until ?? null

  if (rateLimitedUntil && new Date(rateLimitedUntil) > new Date()) {
    return json({ skipped: true, reason: 'rate_limited', until: rateLimitedUntil })
  }

  const summary = { auth_sent: 0, tx_sent: 0, failed: 0, dlq: 0, expired: 0 }

  // Drain auth queue first (priority), then transactional
  for (const queue of ['auth_emails', 'transactional_emails'] as const) {
    const ttlMinutes = queue === 'auth_emails' ? authTtl : txTtl
    const remaining = batchSize - (summary.auth_sent + summary.tx_sent)
    if (remaining <= 0) break

    const { data: messages, error: readErr } = await supabase.rpc('read_email_batch', {
      queue_name: queue,
      batch_size: remaining,
      visibility_timeout: 30,
    })

    if (readErr) {
      console.error('read_email_batch failed', { queue, error: readErr })
      continue
    }
    if (!messages || messages.length === 0) continue

    for (const raw of messages as QueueMessage[]) {
      const msg = raw.message
      const msgId = raw.msg_id

      // TTL check
      if (msg.queued_at) {
        const ageMs = Date.now() - new Date(msg.queued_at).getTime()
        if (ageMs > ttlMinutes * 60 * 1000) {
          await supabase.rpc('move_to_dlq', { queue_name: queue, msg_id: msgId })
          await supabase.from('email_send_log').insert({
            message_id: msg.message_id,
            template_name: msg.label ?? queue,
            recipient_email: msg.to,
            status: 'dlq',
            error_message: `TTL expired after ${ttlMinutes} minutes`,
          })
          summary.expired += 1
          continue
        }
      }

      // Build Resend payload
      const resendBody: Record<string, unknown> = {
        from: msg.from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
      }
      if (msg.text) resendBody.text = msg.text
      if (msg.unsubscribe_token) {
        const unsubUrl = `${supabaseUrl}/functions/v1/handle-email-unsubscribe?token=${msg.unsubscribe_token}`
        resendBody.headers = {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        }
      }

      const resp = await fetch(`${RESEND_API_URL}/emails`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify(resendBody),
      })

      // Rate-limited: stop and persist backoff
      if (resp.status === 429) {
        const retryAfterSec = parseInt(resp.headers.get('retry-after') ?? '30', 10)
        const until = new Date(Date.now() + retryAfterSec * 1000).toISOString()
        await supabase.from('email_send_state').update({ rate_limited_until: until }).eq('id', 1)
        console.warn('Resend rate-limited; halting batch', { until })
        return json({ ...summary, rate_limited_until: until })
      }

      let respBody: any = null
      try { respBody = await resp.json() } catch { /* non-JSON */ }

      if (resp.ok && respBody?.id) {
        // Success: delete from queue, log sent
        await supabase.rpc('delete_email', { queue_name: queue, msg_id: msgId })
        await supabase.from('email_send_log').insert({
          message_id: msg.message_id,
          template_name: msg.label ?? queue,
          recipient_email: msg.to,
          status: 'sent',
          provider_message_id: respBody.id,
        })
        if (queue === 'auth_emails') summary.auth_sent += 1
        else summary.tx_sent += 1
      } else {
        // Failure
        const errMsg = respBody?.message || respBody?.error || `HTTP ${resp.status}`
        console.error('Resend send failed', { msgId, status: resp.status, errMsg })

        if (raw.read_ct >= MAX_ATTEMPTS) {
          await supabase.rpc('move_to_dlq', { queue_name: queue, msg_id: msgId })
          await supabase.from('email_send_log').insert({
            message_id: msg.message_id,
            template_name: msg.label ?? queue,
            recipient_email: msg.to,
            status: 'dlq',
            error_message: `Max attempts reached: ${errMsg}`,
          })
          summary.dlq += 1
        } else {
          // Leave in queue: visibility timeout will let it retry
          await supabase.from('email_send_log').insert({
            message_id: msg.message_id,
            template_name: msg.label ?? queue,
            recipient_email: msg.to,
            status: 'failed',
            error_message: `Attempt ${raw.read_ct}: ${errMsg}`,
          })
          summary.failed += 1
        }
      }

      if (sendDelayMs > 0) {
        await new Promise((r) => setTimeout(r, sendDelayMs))
      }
    }
  }

  return json(summary)
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
