-- Rimuovi il secret fasullo creato in precedenza
DELETE FROM vault.secrets WHERE name = 'email_queue_service_role_key';

-- Riscrivi il cron job senza Authorization header (ora la function ha verify_jwt=false)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'process-email-queue';

SELECT cron.schedule(
  'process-email-queue',
  '* * * * *',
  $$
    SELECT net.http_post(
      url := 'https://vejqfpznzcohtbggkfhr.supabase.co/functions/v1/process-email-queue',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"source":"pg_cron"}'::jsonb,
      timeout_milliseconds := 25000
    );
  $$
);