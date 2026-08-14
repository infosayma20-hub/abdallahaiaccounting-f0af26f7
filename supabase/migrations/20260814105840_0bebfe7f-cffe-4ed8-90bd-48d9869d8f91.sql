ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS hr_departure_max_gap_minutes integer NOT NULL DEFAULT 300;

CREATE OR REPLACE FUNCTION public.hr_compute_day_departures(
  _day_ids uuid[],
  _cap integer DEFAULT 30,
  _max_gap integer DEFAULT 300,
  _min_gap integer DEFAULT 2
)
RETURNS TABLE(attendance_day_id uuid, minutes integer, gaps_count integer, exempt boolean, exceeded boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
WITH days AS (
  SELECT d.id, d.employee_id, d.status, d.first_check_in, d.last_check_out
  FROM public.attendance_days d
  WHERE d.id = ANY(_day_ids)
),
brk AS (
  SELECT b.attendance_day_id, b.break_out, b.break_in,
         GREATEST(0, COALESCE(b.duration_minutes,
           CASE WHEN b.break_in IS NOT NULL AND b.break_out IS NOT NULL
                THEN FLOOR(EXTRACT(EPOCH FROM (b.break_in - b.break_out)) / 60)::int
                ELSE 0 END))::int AS mins
  FROM public.attendance_breaks b
  WHERE b.attendance_day_id = ANY(_day_ids)
),
brk_agg AS (
  SELECT attendance_day_id, SUM(mins)::int AS mins, COUNT(*)::int AS cnt FROM brk GROUP BY 1
),
ev AS (
  SELECT d.id AS day_id,
         e.event_type,
         e.event_time,
         LAG(e.event_time) OVER (PARTITION BY d.id ORDER BY e.event_time) AS prev_time,
         LAG(e.event_type) OVER (PARTITION BY d.id ORDER BY e.event_time) AS prev_type
  FROM days d
  JOIN public.attendance_events e
    ON e.employee_id = d.employee_id
   AND d.first_check_in IS NOT NULL
   AND d.last_check_out IS NOT NULL
   AND e.event_time >= d.first_check_in
   AND e.event_time <= d.last_check_out
   AND (e.status IS NULL OR e.status IN ('valid','manual'))
),
gaps AS (
  SELECT day_id, prev_time AS gap_out, event_time AS gap_in,
         FLOOR(EXTRACT(EPOCH FROM (event_time - prev_time)) / 60)::int AS mins
  FROM ev
  WHERE event_type = 'check_in' AND prev_type = 'check_out' AND prev_time IS NOT NULL
),
gaps_f AS (
  SELECT g.* FROM gaps g
  WHERE g.mins >= _min_gap AND g.mins <= _max_gap
    AND NOT EXISTS (
      SELECT 1 FROM brk b
      WHERE b.attendance_day_id = g.day_id
        AND b.break_out IS NOT NULL
        AND b.break_out < g.gap_in
        AND COALESCE(b.break_in, b.break_out) > g.gap_out
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.attendance_derived_gap_dismissals x
      WHERE x.attendance_day_id = g.day_id
        AND ABS(EXTRACT(EPOCH FROM (x.gap_out - g.gap_out))) <= 90
        AND ABS(EXTRACT(EPOCH FROM (x.gap_in - g.gap_in))) <= 90
    )
),
gap_agg AS (
  SELECT day_id, SUM(mins)::int AS mins, COUNT(*)::int AS cnt FROM gaps_f GROUP BY 1
)
SELECT d.id,
       (COALESCE(b.mins,0) + COALESCE(g.mins,0))::int,
       (COALESCE(b.cnt,0) + COALESCE(g.cnt,0))::int,
       (LOWER(COALESCE(d.status,'')) IN ('leave','holiday','weekend','off','absent','no_record','no_data')),
       (LOWER(COALESCE(d.status,'')) NOT IN ('leave','holiday','weekend','off','absent','no_record','no_data')
        AND (COALESCE(b.mins,0) + COALESCE(g.mins,0)) > _cap)
FROM days d
LEFT JOIN brk_agg b ON b.attendance_day_id = d.id
LEFT JOIN gap_agg g ON g.day_id = d.id;
$$;

GRANT EXECUTE ON FUNCTION public.hr_compute_day_departures(uuid[], integer, integer, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.hr_departure_violations(_from date, _to date)
RETURNS TABLE(
  employee_id uuid,
  full_name text,
  branch_id uuid,
  attendance_date date,
  minutes integer,
  gaps_count integer,
  over_minutes integer,
  cap_minutes integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_cap integer;
  v_max_gap integer;
  v_enabled boolean;
BEGIN
  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL THEN RETURN; END IF;

  SELECT COALESCE(cs.hr_departure_cap_enabled,false),
         COALESCE(NULLIF(cs.hr_departure_cap_minutes,0),30),
         COALESCE(NULLIF(cs.hr_departure_max_gap_minutes,0),300)
    INTO v_enabled, v_cap, v_max_gap
  FROM public.company_settings cs WHERE cs.user_id = v_owner LIMIT 1;

  IF NOT COALESCE(v_enabled,false) THEN RETURN; END IF;

  RETURN QUERY
  WITH d AS (
    SELECT ad.id, ad.employee_id, ad.attendance_date, e.full_name, e.branch_id
    FROM public.attendance_days ad
    JOIN public.employees e ON e.id = ad.employee_id
    WHERE e.user_id = v_owner
      AND ad.attendance_date BETWEEN _from AND _to
  ),
  calc AS (
    SELECT * FROM public.hr_compute_day_departures(
      (SELECT COALESCE(ARRAY_AGG(d.id), '{}'::uuid[]) FROM d), v_cap, v_max_gap, 2
    )
  )
  SELECT d.employee_id, d.full_name, d.branch_id, d.attendance_date,
         c.minutes, c.gaps_count, GREATEST(0, c.minutes - v_cap)::int, v_cap
  FROM d JOIN calc c ON c.attendance_day_id = d.id
  WHERE c.exceeded
  ORDER BY d.attendance_date DESC, d.full_name;
END;
$$;

GRANT EXECUTE ON FUNCTION public.hr_departure_violations(date, date) TO authenticated, service_role;