-- Enable required extensions for durable queues and scheduled HTTP dispatch.
create extension if not exists pgmq;
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Create durable email queues. pgmq.create is idempotent-safe when guarded.
do $$
begin
  if not exists (
    select 1
    from pgmq.meta
    where queue_name = 'transactional_emails'
  ) then
    perform pgmq.create('transactional_emails');
  end if;

  if not exists (
    select 1
    from pgmq.meta
    where queue_name = 'auth_emails'
  ) then
    perform pgmq.create('auth_emails');
  end if;

  if not exists (
    select 1
    from pgmq.meta
    where queue_name = 'transactional_emails_dlq'
  ) then
    perform pgmq.create('transactional_emails_dlq');
  end if;

  if not exists (
    select 1
    from pgmq.meta
    where queue_name = 'auth_emails_dlq'
  ) then
    perform pgmq.create('auth_emails_dlq');
  end if;
end $$;

-- Email send history. Append-only: each state transition can create a new row.
create table if not exists public.email_send_log (
  id uuid primary key default gen_random_uuid(),
  message_id text not null,
  template_name text not null,
  recipient_email text not null,
  status text not null default 'pending',
  error_message text,
  provider_message_id text,
  queue_name text,
  attempts integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

alter table public.email_send_log
  add column if not exists message_id text,
  add column if not exists template_name text,
  add column if not exists recipient_email text,
  add column if not exists status text default 'pending',
  add column if not exists error_message text,
  add column if not exists provider_message_id text,
  add column if not exists queue_name text,
  add column if not exists attempts integer default 0,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamp with time zone default now();

alter table public.email_send_log alter column message_id set not null;
alter table public.email_send_log alter column template_name set not null;
alter table public.email_send_log alter column recipient_email set not null;
alter table public.email_send_log alter column status set not null;
alter table public.email_send_log alter column attempts set not null;
alter table public.email_send_log alter column metadata set not null;
alter table public.email_send_log alter column created_at set not null;

create index if not exists idx_email_send_log_message_id on public.email_send_log (message_id);
create index if not exists idx_email_send_log_recipient_email on public.email_send_log (lower(recipient_email));
create index if not exists idx_email_send_log_status_created_at on public.email_send_log (status, created_at desc);

-- Single-row runtime state/config for the queue processor.
create table if not exists public.email_send_state (
  id integer primary key default 1,
  rate_limited_until timestamp with time zone,
  batch_size integer not null default 10,
  send_delay_ms integer not null default 200,
  auth_email_ttl_minutes integer not null default 15,
  transactional_email_ttl_minutes integer not null default 60,
  max_attempts integer not null default 5,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint email_send_state_singleton check (id = 1),
  constraint email_send_state_positive_batch check (batch_size > 0),
  constraint email_send_state_non_negative_delay check (send_delay_ms >= 0),
  constraint email_send_state_positive_auth_ttl check (auth_email_ttl_minutes > 0),
  constraint email_send_state_positive_transactional_ttl check (transactional_email_ttl_minutes > 0),
  constraint email_send_state_positive_max_attempts check (max_attempts > 0)
);

alter table public.email_send_state
  add column if not exists rate_limited_until timestamp with time zone,
  add column if not exists batch_size integer default 10,
  add column if not exists send_delay_ms integer default 200,
  add column if not exists auth_email_ttl_minutes integer default 15,
  add column if not exists transactional_email_ttl_minutes integer default 60,
  add column if not exists max_attempts integer default 5,
  add column if not exists created_at timestamp with time zone default now(),
  add column if not exists updated_at timestamp with time zone default now();

insert into public.email_send_state (id)
values (1)
on conflict (id) do nothing;

-- Suppression list for bounces, complaints and unsubscribes.
create table if not exists public.suppressed_emails (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  reason text not null default 'manual',
  provider text,
  provider_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  unique (email)
);

alter table public.suppressed_emails
  add column if not exists email text,
  add column if not exists reason text default 'manual',
  add column if not exists provider text,
  add column if not exists provider_event_id text,
  add column if not exists metadata jsonb default '{}'::jsonb,
  add column if not exists created_at timestamp with time zone default now();

alter table public.suppressed_emails alter column email set not null;
alter table public.suppressed_emails alter column reason set not null;
alter table public.suppressed_emails alter column metadata set not null;
alter table public.suppressed_emails alter column created_at set not null;

create unique index if not exists idx_suppressed_emails_email_lower on public.suppressed_emails (lower(email));

-- One-click unsubscribe tokens for transactional templates.
create table if not exists public.email_unsubscribe_tokens (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token text not null unique,
  used_at timestamp with time zone,
  expires_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  unique (email)
);

alter table public.email_unsubscribe_tokens
  add column if not exists email text,
  add column if not exists token text,
  add column if not exists used_at timestamp with time zone,
  add column if not exists expires_at timestamp with time zone,
  add column if not exists created_at timestamp with time zone default now();

alter table public.email_unsubscribe_tokens alter column email set not null;
alter table public.email_unsubscribe_tokens alter column token set not null;
alter table public.email_unsubscribe_tokens alter column created_at set not null;

create unique index if not exists idx_email_unsubscribe_tokens_email_lower on public.email_unsubscribe_tokens (lower(email));
create unique index if not exists idx_email_unsubscribe_tokens_token on public.email_unsubscribe_tokens (token);

-- Enable RLS and lock direct client access down to service role.
alter table public.email_send_log enable row level security;
alter table public.email_send_state enable row level security;
alter table public.suppressed_emails enable row level security;
alter table public.email_unsubscribe_tokens enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'email_send_log' and policyname = 'Service role can manage email send log') then
    create policy "Service role can manage email send log"
      on public.email_send_log
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'email_send_state' and policyname = 'Service role can manage email send state') then
    create policy "Service role can manage email send state"
      on public.email_send_state
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'suppressed_emails' and policyname = 'Service role can manage suppressed emails') then
    create policy "Service role can manage suppressed emails"
      on public.suppressed_emails
      for all
      to service_role
      using (true)
      with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'email_unsubscribe_tokens' and policyname = 'Service role can manage unsubscribe tokens') then
    create policy "Service role can manage unsubscribe tokens"
      on public.email_unsubscribe_tokens
      for all
      to service_role
      using (true)
      with check (true);
  end if;
end $$;

-- Public RPC used by Edge Functions to enqueue rendered email payloads.
create or replace function public.enqueue_email(queue_name text, payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = public, pgmq
as $$
declare
  msg_id bigint;
begin
  if queue_name not in ('transactional_emails', 'auth_emails') then
    raise exception 'Invalid email queue: %', queue_name;
  end if;

  if payload is null or jsonb_typeof(payload) <> 'object' then
    raise exception 'Email queue payload must be a JSON object';
  end if;

  execute format('select pgmq.send(%L, $1)', queue_name)
    using payload
    into msg_id;

  return msg_id;
end;
$$;

revoke all on function public.enqueue_email(text, jsonb) from public;
grant execute on function public.enqueue_email(text, jsonb) to service_role;

-- Compatibility overload for clients that pass queue_name as a named text argument and payload as json/jsonb variants.
create or replace function public.enqueue_email(queue_name text, payload json)
returns bigint
language sql
security definer
set search_path = public
as $$
  select public.enqueue_email(queue_name, payload::jsonb);
$$;

revoke all on function public.enqueue_email(text, json) from public;
grant execute on function public.enqueue_email(text, json) to service_role;

-- Schedule queue processing. This calls the deployed Edge Function; the function has JWT verification disabled in config.
do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'process-email-queue'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;

  perform cron.schedule(
    'process-email-queue',
    '*/5 * * * * *',
    $cron$
    select net.http_post(
      url := 'https://vejqfpznzcohtbggkfhr.supabase.co/functions/v1/process-email-queue',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"source":"pg_cron"}'::jsonb,
      timeout_milliseconds := 25000
    );
    $cron$
  );
end $$;