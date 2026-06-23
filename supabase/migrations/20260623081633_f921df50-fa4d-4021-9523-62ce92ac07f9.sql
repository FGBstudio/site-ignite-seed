
-- =========================================================================
-- HR MODULE: availability, requests, attendance, qr tokens
-- =========================================================================

-- ── ENUMs ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.hr_availability_status AS ENUM ('available','busy','off','travel','remote');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hr_request_type AS ENUM ('holiday','permit','travel');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hr_request_status AS ENUM ('pending','approved','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.hr_attendance_status AS ENUM ('auto_qr','manual_override');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── 1. hr_availability ─────────────────────────────────────────────────────
CREATE TABLE public.hr_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  status public.hr_availability_status NOT NULL DEFAULT 'available',
  note text,
  hours_planned numeric(4,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_availability TO authenticated;
GRANT ALL ON public.hr_availability TO service_role;
ALTER TABLE public.hr_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_availability_select_all_auth"
  ON public.hr_availability FOR SELECT TO authenticated USING (true);

CREATE POLICY "hr_availability_insert_own_or_admin"
  ON public.hr_availability FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "hr_availability_update_own_or_admin"
  ON public.hr_availability FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()))
  WITH CHECK (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "hr_availability_delete_own_or_admin"
  ON public.hr_availability FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

-- ── 2. hr_requests ─────────────────────────────────────────────────────────
CREATE TABLE public.hr_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type public.hr_request_type NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  start_time time,
  end_time time,
  reason text,
  status public.hr_request_status NOT NULL DEFAULT 'pending',
  manager_note text,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_requests TO authenticated;
GRANT ALL ON public.hr_requests TO service_role;
ALTER TABLE public.hr_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_requests_select_own_or_admin"
  ON public.hr_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "hr_requests_insert_own"
  ON public.hr_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "hr_requests_update_own_pending_or_admin"
  ON public.hr_requests FOR UPDATE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending')
    OR public.is_admin(auth.uid())
  )
  WITH CHECK (
    (user_id = auth.uid() AND status = 'pending')
    OR public.is_admin(auth.uid())
  );

CREATE POLICY "hr_requests_delete_own_pending_or_admin"
  ON public.hr_requests FOR DELETE TO authenticated
  USING (
    (user_id = auth.uid() AND status = 'pending')
    OR public.is_admin(auth.uid())
  );

-- ── 3. hr_attendance ───────────────────────────────────────────────────────
CREATE TABLE public.hr_attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  timestamp_in timestamptz NOT NULL DEFAULT now(),
  timestamp_out timestamptz,
  location_lat numeric(9,6),
  location_lng numeric(9,6),
  status public.hr_attendance_status NOT NULL DEFAULT 'auto_qr',
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  device_label text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX hr_attendance_user_in_idx ON public.hr_attendance (user_id, timestamp_in DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_attendance TO authenticated;
GRANT ALL ON public.hr_attendance TO service_role;
ALTER TABLE public.hr_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_attendance_select_own_or_admin"
  ON public.hr_attendance FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "hr_attendance_insert_admin"
  ON public.hr_attendance FOR INSERT TO authenticated
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "hr_attendance_update_admin"
  ON public.hr_attendance FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "hr_attendance_delete_admin"
  ON public.hr_attendance FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()));

-- ── 4. hr_qr_tokens ────────────────────────────────────────────────────────
CREATE TABLE public.hr_qr_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  token text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  rotated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_qr_tokens TO authenticated;
GRANT ALL ON public.hr_qr_tokens TO service_role;
ALTER TABLE public.hr_qr_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hr_qr_tokens_select_own_or_admin"
  ON public.hr_qr_tokens FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "hr_qr_tokens_admin_write"
  ON public.hr_qr_tokens FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ── updated_at triggers ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.hr_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

CREATE TRIGGER hr_availability_set_updated_at BEFORE UPDATE ON public.hr_availability
  FOR EACH ROW EXECUTE FUNCTION public.hr_set_updated_at();
CREATE TRIGGER hr_requests_set_updated_at BEFORE UPDATE ON public.hr_requests
  FOR EACH ROW EXECUTE FUNCTION public.hr_set_updated_at();
CREATE TRIGGER hr_attendance_set_updated_at BEFORE UPDATE ON public.hr_attendance
  FOR EACH ROW EXECUTE FUNCTION public.hr_set_updated_at();
CREATE TRIGGER hr_qr_tokens_set_updated_at BEFORE UPDATE ON public.hr_qr_tokens
  FOR EACH ROW EXECUTE FUNCTION public.hr_set_updated_at();

-- ── Trigger: approved holiday/permit → block availability ──────────────────
CREATE OR REPLACE FUNCTION public.hr_apply_approved_request()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d date;
BEGIN
  IF NEW.status = 'approved'
     AND (OLD.status IS DISTINCT FROM 'approved')
     AND NEW.type IN ('holiday','permit','travel') THEN
    d := NEW.start_date;
    WHILE d <= NEW.end_date LOOP
      INSERT INTO public.hr_availability (user_id, date, status, note)
      VALUES (
        NEW.user_id,
        d,
        CASE WHEN NEW.type = 'travel' THEN 'travel'::public.hr_availability_status
             ELSE 'off'::public.hr_availability_status END,
        COALESCE(NEW.reason, NEW.type::text)
      )
      ON CONFLICT (user_id, date) DO UPDATE
        SET status = EXCLUDED.status,
            note   = EXCLUDED.note,
            updated_at = now();
      d := d + 1;
    END LOOP;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER hr_requests_apply_approval
  AFTER UPDATE ON public.hr_requests
  FOR EACH ROW EXECUTE FUNCTION public.hr_apply_approved_request();
