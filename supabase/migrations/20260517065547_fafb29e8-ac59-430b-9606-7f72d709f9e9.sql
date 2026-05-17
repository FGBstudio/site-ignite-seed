
-- ============================================
-- Helper: pick created_by for system alerts
-- ============================================
-- Uses certification.pm_id when available, otherwise the first ADMIN user.

-- ============================================
-- 1. Freeze baseline handover on PO sign
-- ============================================
CREATE OR REPLACE FUNCTION public.fn_freeze_baseline_handover()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.po_sign_date IS NOT NULL
     AND OLD.po_sign_date IS NULL
     AND NEW.baseline_handover_date IS NULL THEN
    NEW.baseline_handover_date := COALESCE(NEW.planned_handover_date, NEW.handover_date);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_certifications_freeze_baseline ON public.certifications;
CREATE TRIGGER trg_certifications_freeze_baseline
BEFORE UPDATE ON public.certifications
FOR EACH ROW EXECUTE FUNCTION public.fn_freeze_baseline_handover();

-- ============================================
-- 2. Budget erosion (80% / 100%)
-- ============================================
CREATE OR REPLACE FUNCTION public.fn_check_budget_erosion(p_cert_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allocated numeric;
  v_consumed numeric;
  v_pct numeric;
  v_name text;
  v_pm uuid;
  v_creator uuid;
BEGIN
  SELECT allocated_hours, COALESCE(name, 'Project'), pm_id
    INTO v_allocated, v_name, v_pm
  FROM certifications WHERE id = p_cert_id;

  IF v_allocated IS NULL OR v_allocated <= 0 THEN
    -- no budget set, resolve any open alerts
    UPDATE task_alerts
      SET is_resolved = true, resolved_at = now()
      WHERE certification_id = p_cert_id
        AND alert_type IN ('budget_warning_80','budget_overrun')
        AND is_resolved = false;
    RETURN;
  END IF;

  SELECT COALESCE(SUM(hours), 0) INTO v_consumed
  FROM time_entries WHERE certification_id = p_cert_id;

  v_pct := (v_consumed / v_allocated) * 100.0;

  v_creator := COALESCE(v_pm, (SELECT user_id FROM user_roles WHERE role IN ('ADMIN','admin') LIMIT 1));
  IF v_creator IS NULL THEN RETURN; END IF;

  -- 100% overrun
  IF v_pct >= 100 THEN
    IF NOT EXISTS (
      SELECT 1 FROM task_alerts
      WHERE certification_id = p_cert_id
        AND alert_type = 'budget_overrun'
        AND is_resolved = false
    ) THEN
      INSERT INTO task_alerts (certification_id, created_by, alert_type, title, description, escalate_to_admin, target_route)
      VALUES (
        p_cert_id, v_creator, 'budget_overrun',
        'Budget ore superato — ' || v_name,
        'Consumate ' || round(v_consumed,1) || 'h su ' || round(v_allocated,1) || 'h (' || round(v_pct,0) || '%). Ogni ora aggiuntiva è perdita netta.',
        true, '/dashboard'
      );
    END IF;
    -- supersede the 80% alert
    UPDATE task_alerts SET is_resolved = true, resolved_at = now()
      WHERE certification_id = p_cert_id AND alert_type = 'budget_warning_80' AND is_resolved = false;
  ELSIF v_pct >= 80 THEN
    IF NOT EXISTS (
      SELECT 1 FROM task_alerts
      WHERE certification_id = p_cert_id
        AND alert_type = 'budget_warning_80'
        AND is_resolved = false
    ) THEN
      INSERT INTO task_alerts (certification_id, created_by, alert_type, title, description, escalate_to_admin, target_route)
      VALUES (
        p_cert_id, v_creator, 'budget_warning_80',
        'Budget ore all''80% — ' || v_name,
        'Consumate ' || round(v_consumed,1) || 'h su ' || round(v_allocated,1) || 'h (' || round(v_pct,0) || '%). Valutare se il completamento è vicino.',
        true, '/dashboard'
      );
    END IF;
    UPDATE task_alerts SET is_resolved = true, resolved_at = now()
      WHERE certification_id = p_cert_id AND alert_type = 'budget_overrun' AND is_resolved = false;
  ELSE
    UPDATE task_alerts SET is_resolved = true, resolved_at = now()
      WHERE certification_id = p_cert_id
        AND alert_type IN ('budget_warning_80','budget_overrun')
        AND is_resolved = false;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_time_entries_budget_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fn_check_budget_erosion(OLD.certification_id);
    PERFORM public.fn_check_resource_burnout(OLD.user_id, OLD.certification_id);
    RETURN OLD;
  END IF;
  PERFORM public.fn_check_budget_erosion(NEW.certification_id);
  IF TG_OP = 'UPDATE' AND OLD.certification_id IS DISTINCT FROM NEW.certification_id THEN
    PERFORM public.fn_check_budget_erosion(OLD.certification_id);
  END IF;
  PERFORM public.fn_check_resource_burnout(NEW.user_id, NEW.certification_id);
  RETURN NEW;
END;
$$;

-- ============================================
-- 3. Handover drift (> 3 months past baseline)
-- ============================================
CREATE OR REPLACE FUNCTION public.fn_check_handover_drift(p_cert_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_baseline date;
  v_current date;
  v_name text;
  v_pm uuid;
  v_creator uuid;
  v_drift_days int;
BEGIN
  SELECT baseline_handover_date,
         COALESCE(actual_handover_date, planned_handover_date, handover_date),
         COALESCE(name, 'Project'),
         pm_id
    INTO v_baseline, v_current, v_name, v_pm
  FROM certifications WHERE id = p_cert_id;

  IF v_baseline IS NULL OR v_current IS NULL THEN
    RETURN;
  END IF;

  v_drift_days := v_current - v_baseline;

  v_creator := COALESCE(v_pm, (SELECT user_id FROM user_roles WHERE role IN ('ADMIN','admin') LIMIT 1));
  IF v_creator IS NULL THEN RETURN; END IF;

  IF v_current > v_baseline + INTERVAL '3 months' THEN
    IF NOT EXISTS (
      SELECT 1 FROM task_alerts
      WHERE certification_id = p_cert_id
        AND alert_type = 'extra_canone'
        AND is_resolved = false
    ) THEN
      INSERT INTO task_alerts (certification_id, created_by, alert_type, title, description, escalate_to_admin, target_route, scheduled_date)
      VALUES (
        p_cert_id, v_creator, 'extra_canone',
        'Estensione cronoprogramma oltre tolleranza — ' || v_name,
        'Slittamento di ' || v_drift_days || ' giorni rispetto alla baseline contrattuale (' || to_char(v_baseline,'DD/MM/YYYY') || '). Valutare invio quotazione estensione mandato.',
        true, '/admin-tasks', v_current
      );
    END IF;
  ELSE
    UPDATE task_alerts SET is_resolved = true, resolved_at = now()
      WHERE certification_id = p_cert_id
        AND alert_type = 'extra_canone'
        AND is_resolved = false
        AND title LIKE 'Estensione cronoprogramma oltre tolleranza%';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_certifications_drift_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.planned_handover_date IS DISTINCT FROM OLD.planned_handover_date)
     OR (NEW.actual_handover_date IS DISTINCT FROM OLD.actual_handover_date)
     OR (NEW.handover_date IS DISTINCT FROM OLD.handover_date)
     OR (NEW.baseline_handover_date IS DISTINCT FROM OLD.baseline_handover_date) THEN
    PERFORM public.fn_check_handover_drift(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_certifications_handover_drift ON public.certifications;
CREATE TRIGGER trg_certifications_handover_drift
AFTER UPDATE ON public.certifications
FOR EACH ROW EXECUTE FUNCTION public.fn_certifications_drift_trigger();

-- ============================================
-- 4. Resource burnout (>40h x 2 consecutive weeks, same cert >50%)
-- ============================================
CREATE OR REPLACE FUNCTION public.fn_check_resource_burnout(p_user_id uuid, p_cert_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_this_week_start date := date_trunc('week', CURRENT_DATE)::date;
  v_prev_week_start date := (date_trunc('week', CURRENT_DATE) - INTERVAL '1 week')::date;
  v_two_weeks_ago date := (date_trunc('week', CURRENT_DATE) - INTERVAL '2 weeks')::date;
  v_w1_total numeric; v_w1_cert numeric;
  v_w2_total numeric; v_w2_cert numeric;
  v_name text;
  v_user_label text;
  v_creator uuid;
BEGIN
  IF p_user_id IS NULL OR p_cert_id IS NULL THEN RETURN; END IF;

  -- Last two completed-or-current weeks: previous week and the one before
  SELECT COALESCE(SUM(hours),0),
         COALESCE(SUM(hours) FILTER (WHERE certification_id = p_cert_id),0)
    INTO v_w1_total, v_w1_cert
  FROM time_entries
  WHERE user_id = p_user_id
    AND entry_date >= v_prev_week_start
    AND entry_date <  v_this_week_start;

  SELECT COALESCE(SUM(hours),0),
         COALESCE(SUM(hours) FILTER (WHERE certification_id = p_cert_id),0)
    INTO v_w2_total, v_w2_cert
  FROM time_entries
  WHERE user_id = p_user_id
    AND entry_date >= v_two_weeks_ago
    AND entry_date <  v_prev_week_start;

  IF v_w1_total > 40 AND v_w2_total > 40
     AND v_w1_total > 0 AND v_w2_total > 0
     AND v_w1_cert / NULLIF(v_w1_total,0) > 0.5
     AND v_w2_cert / NULLIF(v_w2_total,0) > 0.5 THEN

    SELECT COALESCE(name, 'Project'), COALESCE(pm_id, (SELECT user_id FROM user_roles WHERE role IN ('ADMIN','admin') LIMIT 1))
      INTO v_name, v_creator
    FROM certifications WHERE id = p_cert_id;

    SELECT COALESCE(full_name, display_name, email, 'Risorsa')
      INTO v_user_label
    FROM profiles WHERE id = p_user_id;

    IF v_creator IS NULL THEN RETURN; END IF;

    -- Avoid duplicates: nothing already open on this (cert, user) created in last 4 weeks
    IF NOT EXISTS (
      SELECT 1 FROM task_alerts
      WHERE certification_id = p_cert_id
        AND alert_type = 'resource_burnout_warning'
        AND is_resolved = false
        AND description LIKE '%' || COALESCE(v_user_label,'') || '%'
        AND created_at > now() - INTERVAL '4 weeks'
    ) THEN
      INSERT INTO task_alerts (certification_id, created_by, alert_type, title, description, escalate_to_admin, target_route)
      VALUES (
        p_cert_id, v_creator, 'resource_burnout_warning',
        'Saturazione anomala — ' || COALESCE(v_user_label,'Risorsa') || ' su ' || v_name,
        COALESCE(v_user_label,'Risorsa') || ' ha registrato ' || round(v_w2_total,1) || 'h e ' || round(v_w1_total,1) || 'h nelle ultime 2 settimane, in prevalenza su questo progetto. Possibile burnout o servizio sotto-quotato.',
        true, '/dashboard'
      );
    END IF;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_time_entries_alerts ON public.time_entries;
CREATE TRIGGER trg_time_entries_alerts
AFTER INSERT OR UPDATE OR DELETE ON public.time_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_time_entries_budget_trigger();
