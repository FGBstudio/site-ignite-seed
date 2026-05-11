-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing schedule with the same name
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'lock-weekly-reports-sunday';

-- Sunday 22:59 UTC = 23:59 Europe/Rome (CET) / Sunday 21:59 UTC during DST.
-- We schedule both to safely cover CET/CEST.
SELECT cron.schedule(
  'lock-weekly-reports-sunday',
  '59 21,22 * * 0',
  $$
  SELECT net.http_post(
    url := 'https://vejqfpznzcohtbggkfhr.supabase.co/functions/v1/lock-weekly-reports',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlanFmcHpuemNvaHRiZ2drZmhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODQ5MzksImV4cCI6MjA4NDA2MDkzOX0.AUoQvIiaM8AjnYxnvOr1-zonkV8BXUFco62v3G5388c"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);