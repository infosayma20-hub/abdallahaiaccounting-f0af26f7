
-- 1) Extend termination_records with hours-based breakdown
ALTER TABLE public.termination_records
  ADD COLUMN IF NOT EXISTS hourly_rate_used numeric,
  ADD COLUMN IF NOT EXISTS regular_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_normal_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_holiday_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS regular_hours_pay numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_normal_pay numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_holiday_pay numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hours_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS meals_deduction numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS audit_items jsonb;

-- 2) Function: calculate settlement hours between two dates
CREATE OR REPLACE FUNCTION public.calculate_settlement_hours(
  p_employee_id uuid,
  p_from date,
  p_to date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hourly_rate numeric;
  v_owner uuid;
  v_regular numeric := 0;
  v_ot_normal numeric := 0;
  v_ot_holiday numeric := 0;
  v_days_detail jsonb := '[]'::jsonb;
  r record;
  v_iso_week text;
  v_day_count int;
  v_is_holiday boolean;
  v_is_7th boolean;
  v_reg numeric;
  v_ot numeric;
BEGIN
  SELECT hourly_rate, user_id INTO v_hourly_rate, v_owner
  FROM public.employees WHERE id = p_employee_id;

  IF v_hourly_rate IS NULL OR v_hourly_rate = 0 THEN
    v_hourly_rate := 9.6;
  END IF;

  FOR r IN
    SELECT attendance_date,
           COALESCE(total_hours,0) AS total_hours,
           COALESCE(overtime_hours,0) AS overtime_hours
    FROM public.attendance_days
    WHERE employee_id = p_employee_id
      AND attendance_date BETWEEN p_from AND p_to
      AND COALESCE(total_hours,0) > 0
    ORDER BY attendance_date
  LOOP
    -- holiday check
    SELECT EXISTS(
      SELECT 1 FROM public.official_holidays h
      WHERE h.is_active = true
        AND ((h.holiday_date = r.attendance_date)
             OR (h.is_recurring = true
                 AND h.recurring_month = EXTRACT(MONTH FROM r.attendance_date)::int
                 AND h.recurring_day   = EXTRACT(DAY   FROM r.attendance_date)::int))
    ) INTO v_is_holiday;

    -- 7th day of the ISO week (Mon-Sun)
    v_iso_week := to_char(r.attendance_date, 'IYYY-IW');
    SELECT COUNT(*) INTO v_day_count
    FROM public.attendance_days
    WHERE employee_id = p_employee_id
      AND to_char(attendance_date,'IYYY-IW') = v_iso_week
      AND attendance_date <= r.attendance_date
      AND COALESCE(total_hours,0) > 0;
    v_is_7th := (v_day_count >= 7);

    v_reg := GREATEST(r.total_hours - r.overtime_hours, 0);
    v_ot  := r.overtime_hours;

    IF v_is_holiday THEN
      -- all hours on holiday count as 250%
      v_ot_holiday := v_ot_holiday + r.total_hours;
      v_reg := 0; v_ot := 0;
    ELSIF v_is_7th THEN
      -- entire 7th day counts as 150% overtime
      v_ot_normal := v_ot_normal + r.total_hours;
      v_reg := 0; v_ot := 0;
    ELSE
      v_regular   := v_regular + v_reg;
      v_ot_normal := v_ot_normal + v_ot;
    END IF;

    v_days_detail := v_days_detail || jsonb_build_object(
      'date', r.attendance_date,
      'total_hours', r.total_hours,
      'overtime_hours', r.overtime_hours,
      'is_holiday', v_is_holiday,
      'is_seventh_day', v_is_7th,
      'iso_week', v_iso_week
    );
  END LOOP;

  RETURN jsonb_build_object(
    'hourly_rate', v_hourly_rate,
    'regular_hours', v_regular,
    'overtime_normal_hours', v_ot_normal,
    'overtime_holiday_hours', v_ot_holiday,
    'regular_pay', ROUND(v_regular * v_hourly_rate, 2),
    'overtime_normal_pay', ROUND(v_ot_normal * v_hourly_rate * 1.5, 2),
    'overtime_holiday_pay', ROUND(v_ot_holiday * v_hourly_rate * 2.5, 2),
    'total_hours_pay', ROUND(
        v_regular * v_hourly_rate
      + v_ot_normal * v_hourly_rate * 1.5
      + v_ot_holiday * v_hourly_rate * 2.5, 2),
    'days_detail', v_days_detail
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_settlement_hours(uuid,date,date) TO authenticated, service_role;
