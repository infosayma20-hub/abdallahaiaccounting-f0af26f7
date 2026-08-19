CREATE OR REPLACE FUNCTION public.hr_compute_day_departures(_day_ids uuid[], _cap integer DEFAULT 30, _max_gap integer DEFAULT 300, _min_gap integer DEFAULT 2)
 RETURNS TABLE(attendance_day_id uuid, minutes integer, gaps_count integer, exempt boolean, exceeded boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         LAG(e.event_type) OVER (PARTITION BY d.id ORDER BY e.event_time) AS prev_type,
         LAG(e.checkout_kind) OVER (PARTITION BY d.id ORDER BY e.event_time) AS prev_kind
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
  SELECT day_id, prev_time AS gap_out, event_time AS gap_in, prev_kind AS gap_kind,
         FLOOR(EXTRACT(EPOCH FROM (event_time - prev_time)) / 60)::int AS mins
  FROM ev
  WHERE event_type = 'check_in' AND prev_type = 'check_out' AND prev_time IS NOT NULL
),
gaps_f AS (
  SELECT g.* FROM gaps g
  WHERE g.mins >= _min_gap
    -- نية الخروج المصرّحة: "إنهاء دوام" لا تُحتسب مغادرة إلا عند العودة خلال 60 دقيقة
    -- (مضاد تحايل). "مغادرة مؤقتة" أو البصمات القديمة (NULL) تتبع الحد الأقصى العادي.
    AND (
      CASE WHEN g.gap_kind = 'end_of_day' THEN g.mins <= 60 ELSE g.mins <= _max_gap END
    )
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
$function$;