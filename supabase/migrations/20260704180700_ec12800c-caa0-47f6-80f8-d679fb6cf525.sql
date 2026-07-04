
-- 1) Add structured session type to attendance_breaks (keeps existing `reason` for free text)
ALTER TABLE public.attendance_breaks
  ADD COLUMN IF NOT EXISTS break_type text NOT NULL DEFAULT 'other';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'attendance_breaks_break_type_check'
  ) THEN
    ALTER TABLE public.attendance_breaks
      ADD CONSTRAINT attendance_breaks_break_type_check
      CHECK (break_type IN ('prayer','personal','meal','external_task','other'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_attendance_breaks_day
  ON public.attendance_breaks(attendance_day_id);

-- 2) Grants — Data API access for authenticated (RLS still enforces row scope)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance_breaks TO authenticated;
GRANT ALL ON public.attendance_breaks TO service_role;

-- 3) HR / Admin RLS policies on attendance_breaks (mirror attendance_days pattern)
DROP POLICY IF EXISTS "HR can view organization breaks" ON public.attendance_breaks;
CREATE POLICY "HR can view organization breaks"
  ON public.attendance_breaks FOR SELECT
  USING (
    (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = attendance_breaks.employee_id
        AND is_team_member(auth.uid(), e.user_id)
    )
  );

DROP POLICY IF EXISTS "HR can insert organization breaks" ON public.attendance_breaks;
CREATE POLICY "HR can insert organization breaks"
  ON public.attendance_breaks FOR INSERT
  WITH CHECK (
    (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = attendance_breaks.employee_id
        AND is_team_member(auth.uid(), e.user_id)
    )
  );

DROP POLICY IF EXISTS "HR can update organization breaks" ON public.attendance_breaks;
CREATE POLICY "HR can update organization breaks"
  ON public.attendance_breaks FOR UPDATE
  USING (
    (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = attendance_breaks.employee_id
        AND is_team_member(auth.uid(), e.user_id)
    )
  );

DROP POLICY IF EXISTS "HR can delete organization breaks" ON public.attendance_breaks;
CREATE POLICY "HR can delete organization breaks"
  ON public.attendance_breaks FOR DELETE
  USING (
    (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = attendance_breaks.employee_id
        AND is_team_member(auth.uid(), e.user_id)
    )
  );

-- 4) Helper: recompute a day's totals from its check-in/out + breaks.
--    total_hours = (last_check_out - first_check_in) - sum(break durations)
--    This matches the user's choice: "إجمالي = مجموع فترات العمل فقط".
CREATE OR REPLACE FUNCTION public.recompute_attendance_day_totals(p_day_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ci timestamptz;
  v_co timestamptz;
  v_gross_minutes integer := 0;
  v_break_minutes integer := 0;
  v_net_minutes integer := 0;
  v_daily_hours numeric := 8;
  v_emp_id uuid;
BEGIN
  SELECT first_check_in, last_check_out, employee_id
    INTO v_ci, v_co, v_emp_id
    FROM public.attendance_days
   WHERE id = p_day_id;

  IF v_ci IS NOT NULL AND v_co IS NOT NULL AND v_co > v_ci THEN
    v_gross_minutes := GREATEST(0, EXTRACT(EPOCH FROM (v_co - v_ci))::int / 60);
  END IF;

  -- Sum of finished break windows only (open break has no in-time yet).
  SELECT COALESCE(SUM(
           CASE
             WHEN break_in IS NOT NULL AND break_in > break_out
               THEN GREATEST(0, EXTRACT(EPOCH FROM (break_in - break_out))::int / 60)
             WHEN duration_minutes IS NOT NULL
               THEN GREATEST(0, duration_minutes)
             ELSE 0
           END
         ), 0)::int
    INTO v_break_minutes
    FROM public.attendance_breaks
   WHERE attendance_day_id = p_day_id;

  v_net_minutes := GREATEST(0, v_gross_minutes - v_break_minutes);

  BEGIN
    SELECT COALESCE(work_hours_per_day, 8) INTO v_daily_hours
      FROM public.employees WHERE id = v_emp_id;
  EXCEPTION WHEN OTHERS THEN
    v_daily_hours := 8;
  END;

  UPDATE public.attendance_days
     SET total_break_minutes = v_break_minutes,
         net_work_minutes    = v_net_minutes,
         total_hours         = ROUND((v_net_minutes::numeric) / 60.0, 2),
         overtime_hours      = GREATEST(0, ROUND((v_net_minutes::numeric)/60.0 - v_daily_hours, 2)),
         updated_at          = now()
   WHERE id = p_day_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.recompute_attendance_day_totals(uuid) TO authenticated, service_role;

-- 5) Auto-fill duration_minutes on breaks and keep day totals in sync
CREATE OR REPLACE FUNCTION public.trg_attendance_break_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_day uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_day := OLD.attendance_day_id;
  ELSE
    IF NEW.break_in IS NOT NULL AND NEW.break_out IS NOT NULL AND NEW.break_in > NEW.break_out THEN
      NEW.duration_minutes := GREATEST(0, EXTRACT(EPOCH FROM (NEW.break_in - NEW.break_out))::int / 60);
    END IF;
    v_day := NEW.attendance_day_id;
  END IF;

  IF v_day IS NOT NULL THEN
    PERFORM public.recompute_attendance_day_totals(v_day);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_attendance_break_sync_biu ON public.attendance_breaks;
CREATE TRIGGER trg_attendance_break_sync_biu
  BEFORE INSERT OR UPDATE ON public.attendance_breaks
  FOR EACH ROW EXECUTE FUNCTION public.trg_attendance_break_sync();

DROP TRIGGER IF EXISTS trg_attendance_break_sync_ad ON public.attendance_breaks;
CREATE TRIGGER trg_attendance_break_sync_ad
  AFTER DELETE ON public.attendance_breaks
  FOR EACH ROW EXECUTE FUNCTION public.trg_attendance_break_sync();
