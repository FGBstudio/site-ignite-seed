-- ============================================================
-- Part B: Contacts table (Client & Supplier directory)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('client', 'supplier')),
  company_name text NOT NULL,
  vat_number text,
  tax_code text,
  address text,
  city text,
  country text,
  postal_code text,
  website text,
  email text,
  phone text,
  pec text,
  iban text,
  bank_name text,
  primary_contact_name text,
  primary_contact_role text,
  primary_contact_email text,
  primary_contact_phone text,
  notes text,
  brand_id uuid REFERENCES public.brands(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contacts_kind ON public.contacts(kind);
CREATE INDEX IF NOT EXISTS idx_contacts_company_name ON public.contacts(company_name);
CREATE INDEX IF NOT EXISTS idx_contacts_brand_id ON public.contacts(brand_id);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins have full access to contacts"
ON public.contacts
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Authenticated users can view contacts"
ON public.contacts
FOR SELECT
TO authenticated
USING (true);

CREATE TRIGGER trg_contacts_updated_at
BEFORE UPDATE ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Part C.3: Per-user opt-out for escalation emails
-- ============================================================

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS notify_escalations_email boolean NOT NULL DEFAULT true;

-- ============================================================
-- Part C.1: Enable Realtime on task_alerts
-- ============================================================

ALTER TABLE public.task_alerts REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'task_alerts'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.task_alerts';
  END IF;
END $$;

-- ============================================================
-- Part C.2: Trigger to dispatch escalation emails to admins
-- ============================================================

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
    body := v_payload
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'notify_admins_on_escalation failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_task_alerts_notify_admins_insert ON public.task_alerts;
CREATE TRIGGER trg_task_alerts_notify_admins_insert
AFTER INSERT ON public.task_alerts
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_escalation();

DROP TRIGGER IF EXISTS trg_task_alerts_notify_admins_update ON public.task_alerts;
CREATE TRIGGER trg_task_alerts_notify_admins_update
AFTER UPDATE OF escalate_to_admin ON public.task_alerts
FOR EACH ROW
WHEN (NEW.escalate_to_admin IS TRUE AND (OLD.escalate_to_admin IS DISTINCT FROM NEW.escalate_to_admin))
EXECUTE FUNCTION public.notify_admins_on_escalation();