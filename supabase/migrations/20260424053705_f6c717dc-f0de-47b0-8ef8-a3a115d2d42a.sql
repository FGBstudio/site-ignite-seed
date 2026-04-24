CREATE OR REPLACE FUNCTION public.notify_admins_on_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_url text;
  v_anon_key text;
  v_payload jsonb;
BEGIN
  IF NEW.escalate_to_admin IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.escalate_to_admin IS TRUE THEN
      RETURN NEW;
    END IF;
  END IF;

  v_project_url := 'https://vejqfpznzcohtbggkfhr.supabase.co/functions/v1/dispatch-admin-escalation';
  v_anon_key := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZlanFmcHpuemNvaHRiZ2drZmhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg0ODQ5MzksImV4cCI6MjA4NDA2MDkzOX0.AUoQvIiaM8AjnYxnvOr1-zonkV8BXUFco62v3G5388c';

  v_payload := jsonb_build_object('alertId', NEW.id);

  PERFORM net.http_post(
    url := v_project_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon_key
    ),
    body := v_payload,
    timeout_milliseconds := 30000
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'notify_admins_on_escalation failed: %', SQLERRM;
    RETURN NEW;
END;
$$;