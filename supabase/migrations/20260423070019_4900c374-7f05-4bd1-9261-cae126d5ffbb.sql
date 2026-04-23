INSERT INTO public.task_alerts (
  certification_id, created_by, alert_type, title, description,
  escalate_to_admin, is_resolved, scheduled_date
) VALUES (
  '4e0e4777-2c77-4ee8-bfab-c786f448f513',
  'fcf274fe-7e71-43ad-8276-52f4fb0f94df',
  'pm_operational',
  '[TEST] Simulazione escalation admin',
  'Questo è un alert di prova generato per verificare il funzionamento del flusso di notifica realtime + email agli admin. Può essere risolto/eliminato.',
  true,
  false,
  CURRENT_DATE
);