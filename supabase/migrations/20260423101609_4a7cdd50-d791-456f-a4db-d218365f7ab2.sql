INSERT INTO public.task_alerts (
  certification_id, created_by, alert_type, title, description,
  escalate_to_admin, is_resolved, scheduled_date
) VALUES (
  '4e0e4777-2c77-4ee8-bfab-c786f448f513',
  'fcf274fe-7e71-43ad-8276-52f4fb0f94df',
  'pm_operational',
  '[TEST 3] Escalation con email infra attiva',
  'Test finale dopo deploy di send-transactional-email.',
  true,
  false,
  CURRENT_DATE
);