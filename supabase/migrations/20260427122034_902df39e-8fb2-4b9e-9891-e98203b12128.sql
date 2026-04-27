-- 1. Salva il service role key nel vault (accessibile solo lato DB)
SELECT vault.create_secret(
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlanFmcHpuemNvaHRiZ2drZmhyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODQ4NDkzOSwiZXhwIjoyMDg0MDYwOTM5fQ.placeholder',
  'email_queue_service_role_key',
  'Service role key used by pg_cron to authenticate with process-email-queue Edge Function'
)
WHERE NOT EXISTS (
  SELECT 1 FROM vault.secrets WHERE name = 'email_queue_service_role_key'
);

-- 2. Rimuovi il job esistente con header sbagliati
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'process-email-queue';

-- 3. Ricrea il job con Authorization header letto dal vault, eseguito ogni minuto
SELECT cron.schedule(
  'process-email-queue',
  '* * * * *',
  $$
    SELECT net.http_post(
      url := 'https://vejqfpznzcohtbggkfhr.supabase.co/functions/v1/process-email-queue',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'email_queue_service_role_key')
      ),
      body := jsonb_build_object('source', 'pg_cron'),
      timeout_milliseconds := 25000
    );
  $$
);