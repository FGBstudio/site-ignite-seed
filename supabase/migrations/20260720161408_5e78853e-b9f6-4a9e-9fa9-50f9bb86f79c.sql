
-- Enums
DO $$ BEGIN
  CREATE TYPE public.cert_collab_scope AS ENUM ('certification','phase','tasks');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.cert_collab_status AS ENUM ('pending','approved','rejected','changes_requested','revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Table
CREATE TABLE IF NOT EXISTS public.cert_collaborations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certification_id uuid NOT NULL REFERENCES public.certifications(id) ON DELETE CASCADE,
  owner_pm_id uuid NOT NULL,
  guest_pm_id uuid NOT NULL,
  scope public.cert_collab_scope NOT NULL DEFAULT 'certification',
  phase_ids uuid[] NOT NULL DEFAULT '{}',
  task_ids  uuid[] NOT NULL DEFAULT '{}',
  estimated_hours numeric,
  message text,
  status public.cert_collab_status NOT NULL DEFAULT 'pending',
  admin_id uuid,
  admin_note text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (owner_pm_id <> guest_pm_id)
);

CREATE INDEX IF NOT EXISTS idx_cert_collab_cert   ON public.cert_collaborations(certification_id);
CREATE INDEX IF NOT EXISTS idx_cert_collab_guest  ON public.cert_collaborations(guest_pm_id);
CREATE INDEX IF NOT EXISTS idx_cert_collab_owner  ON public.cert_collaborations(owner_pm_id);
CREATE INDEX IF NOT EXISTS idx_cert_collab_status ON public.cert_collaborations(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cert_collaborations TO authenticated;
GRANT ALL ON public.cert_collaborations TO service_role;

ALTER TABLE public.cert_collaborations ENABLE ROW LEVEL SECURITY;

-- Helper: is user an approved collaborator on a certification?
CREATE OR REPLACE FUNCTION public.is_cert_collaborator(_cert_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cert_collaborations
    WHERE certification_id = _cert_id
      AND guest_pm_id = _uid
      AND status = 'approved'
  );
$$;

-- Policies on cert_collaborations
DROP POLICY IF EXISTS "collab_select" ON public.cert_collaborations;
CREATE POLICY "collab_select" ON public.cert_collaborations
  FOR SELECT TO authenticated
  USING (
    owner_pm_id = auth.uid()
    OR guest_pm_id = auth.uid()
    OR public.is_admin(auth.uid())
  );

DROP POLICY IF EXISTS "collab_insert_owner" ON public.cert_collaborations;
CREATE POLICY "collab_insert_owner" ON public.cert_collaborations
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_pm_id = auth.uid()
    AND (
      public.is_admin(auth.uid())
      OR public.is_cert_pm(certification_id, auth.uid())
    )
  );

DROP POLICY IF EXISTS "collab_update_owner_pending" ON public.cert_collaborations;
CREATE POLICY "collab_update_owner_pending" ON public.cert_collaborations
  FOR UPDATE TO authenticated
  USING (owner_pm_id = auth.uid() AND status IN ('pending','changes_requested'))
  WITH CHECK (owner_pm_id = auth.uid());

DROP POLICY IF EXISTS "collab_update_admin" ON public.cert_collaborations;
CREATE POLICY "collab_update_admin" ON public.cert_collaborations
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "collab_delete_admin" ON public.cert_collaborations;
CREATE POLICY "collab_delete_admin" ON public.cert_collaborations
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_cert_collab_updated_at ON public.cert_collaborations;
CREATE TRIGGER trg_cert_collab_updated_at
  BEFORE UPDATE ON public.cert_collaborations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Audit log trigger (best-effort; assumes audit_logs has entity_type/entity_id/action/actor_id/details columns)
CREATE OR REPLACE FUNCTION public.audit_cert_collaboration()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, details)
      VALUES ('cert_collaboration', NEW.id, 'created', NEW.owner_pm_id,
              jsonb_build_object('certification_id', NEW.certification_id,
                                 'guest_pm_id', NEW.guest_pm_id,
                                 'scope', NEW.scope));
    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.audit_logs(entity_type, entity_id, action, actor_id, details)
      VALUES ('cert_collaboration', NEW.id, 'status_' || NEW.status::text, COALESCE(NEW.admin_id, auth.uid()),
              jsonb_build_object('from', OLD.status, 'to', NEW.status,
                                 'admin_note', NEW.admin_note));
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Do not block on audit schema mismatches
    NULL;
  END;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_cert_collab_audit ON public.cert_collaborations;
CREATE TRIGGER trg_cert_collab_audit
  AFTER INSERT OR UPDATE ON public.cert_collaborations
  FOR EACH ROW EXECUTE FUNCTION public.audit_cert_collaboration();

-- Additive RLS: guest read access
DROP POLICY IF EXISTS "cert_select_collaborator" ON public.certifications;
CREATE POLICY "cert_select_collaborator" ON public.certifications
  FOR SELECT TO authenticated
  USING (public.is_cert_collaborator(id, auth.uid()));

DROP POLICY IF EXISTS "phases_select_collaborator" ON public.cert_wbs_phases;
CREATE POLICY "phases_select_collaborator" ON public.cert_wbs_phases
  FOR SELECT TO authenticated
  USING (public.is_cert_collaborator(certification_id, auth.uid()));

DROP POLICY IF EXISTS "tasks_select_collaborator" ON public.cert_tasks;
CREATE POLICY "tasks_select_collaborator" ON public.cert_tasks
  FOR SELECT TO authenticated
  USING (public.is_cert_collaborator(certification_id, auth.uid()));

-- Guest can update ONLY tasks assigned to them on collaborated certs
DROP POLICY IF EXISTS "tasks_update_collaborator_assignee" ON public.cert_tasks;
CREATE POLICY "tasks_update_collaborator_assignee" ON public.cert_tasks
  FOR UPDATE TO authenticated
  USING (assignee_id = auth.uid() AND public.is_cert_collaborator(certification_id, auth.uid()))
  WITH CHECK (assignee_id = auth.uid() AND public.is_cert_collaborator(certification_id, auth.uid()));

-- Checklists read for collaborators
DROP POLICY IF EXISTS "checklists_select_collaborator" ON public.cert_task_checklists;
CREATE POLICY "checklists_select_collaborator" ON public.cert_task_checklists
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cert_tasks t
    WHERE t.id = cert_task_checklists.task_id
      AND public.is_cert_collaborator(t.certification_id, auth.uid())
  ));
