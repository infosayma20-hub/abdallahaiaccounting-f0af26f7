CREATE OR REPLACE FUNCTION public.get_branch_hours_sales_report(
  p_owner_id uuid,
  p_date_from date,
  p_date_to date,
  p_branch_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
BEGIN
  WITH emps AS (
    SELECT e.id, e.full_name, e.department, e.position, e.branch_id,
           e.shift_id, e.shift_start, e.shift_end
    FROM public.employees e WHERE e.user_id = p_owner_id
  ),
  branch_list AS (
    SELECT b.id, b.name FROM public.branches b WHERE b.user_id = p_owner_id
  ),
  shift_list AS (
    SELECT ws.id, ws.name, ws.start_time, ws.end_time
    FROM public.work_shifts ws WHERE ws.user_id = p_owner_id
  ),
  corrections AS (
    SELECT cr.employee_id, cr.attendance_date, count(*)::int AS adjustments_count
    FROM public.correction_requests cr
    JOIN emps e ON e.id = cr.employee_id
    WHERE cr.status = 'approved'
      AND cr.attendance_date BETWEEN p_date_from AND p_date_to
    GROUP BY cr.employee_id, cr.attendance_date
  ),
  day_source AS (
    SELECT
      d.id, d.employee_id,
      COALESCE(d.branch_id, e.branch_id) AS branch_id,
      COALESCE(bl.name, '—') AS branch_name,
      d.attendance_date, d.first_check_in, d.last_check_out,
      d.total_hours, d.overtime_hours, d.status, d.is_manually_adjusted,
      d.total_break_minutes, d.net_work_minutes,
      e.full_name, e.department, e.position, e.shift_id, e.shift_start, e.shift_end,
      sl.name AS shift_name, sl.start_time AS ws_start_time, sl.end_time AS ws_end_time,
      COALESCE(c.adjustments_count, 0) AS adjustments_count,
      CASE
        WHEN d.net_work_minutes IS NOT NULL THEN d.net_work_minutes::numeric / 60.0
        ELSE COALESCE(d.total_hours, 0)::numeric
      END AS net_hours,
      (d.first_check_in AT TIME ZONE 'Asia/Hebron') AS local_in,
      (d.last_check_out AT TIME ZONE 'Asia/Hebron') AS local_out,
      d.attendance_date::timestamp AS day_start
    FROM public.attendance_days d
    JOIN emps e ON e.id = d.employee_id
    LEFT JOIN branch_list bl ON bl.id = COALESCE(d.branch_id, e.branch_id)
    LEFT JOIN shift_list sl ON sl.id = e.shift_id
    LEFT JOIN corrections c ON c.employee_id = d.employee_id AND c.attendance_date = d.attendance_date
    WHERE d.attendance_date BETWEEN p_date_from AND p_date_to
      AND (p_branch_id IS NULL OR COALESCE(d.branch_id, e.branch_id) = p_branch_id)
  ),
  classified AS (
    SELECT ds.*,
      -- start hour: work_shifts, else employee.shift_start, else clock-in
      COALESCE(
        EXTRACT(HOUR FROM ds.ws_start_time)::int,
        EXTRACT(HOUR FROM ds.shift_start::time)::int,
        EXTRACT(HOUR FROM ds.local_in)::int
      ) AS start_hour,
      -- pivot-based raw split (17:00) used for mid + unknown fallback
      CASE WHEN ds.local_in IS NOT NULL AND ds.local_out IS NOT NULL AND ds.local_out > ds.local_in THEN
        GREATEST(0, EXTRACT(EPOCH FROM (LEAST(ds.local_out, ds.day_start + interval '17 hours') - ds.local_in))/3600.0)
      ELSE 0 END AS raw_before_17,
      CASE WHEN ds.local_in IS NOT NULL AND ds.local_out IS NOT NULL AND ds.local_out > ds.local_in THEN
        GREATEST(0, EXTRACT(EPOCH FROM (ds.local_out - GREATEST(ds.local_in, ds.day_start + interval '17 hours')))/3600.0)
      ELSE 0 END AS raw_after_17
    FROM day_source ds
  ),
  detail_rows AS (
    SELECT
      r.branch_id, r.branch_name, r.attendance_date AS date, r.employee_id,
      COALESCE(r.full_name, '—') AS employee_name,
      COALESCE(r.department, '—') AS department,
      COALESCE(r.position, '—') AS position,
      CASE
        WHEN r.shift_name IS NOT NULL THEN r.shift_name || ' (' || left(r.ws_start_time::text, 5) || '–' || left(r.ws_end_time::text, 5) || ')'
        WHEN r.shift_start IS NOT NULL AND r.shift_end IS NOT NULL THEN left(r.shift_start::text, 5) || '–' || left(r.shift_end::text, 5)
        ELSE '—'
      END AS shift,
      r.first_check_in, r.last_check_out,
      COALESCE(r.total_break_minutes, 0)::int AS break_minutes,
      -- shift class
      CASE
        WHEN r.start_hour IS NULL THEN 'unknown'
        WHEN r.start_hour < 12 THEN 'morning'
        WHEN r.start_hour < 15 THEN 'mid'
        ELSE 'evening'
      END AS shift_class,
      -- morning_hours (was day_hours)
      CASE
        WHEN r.start_hour IS NOT NULL AND r.start_hour < 12 THEN r.net_hours
        WHEN r.start_hour IS NOT NULL AND r.start_hour >= 15 THEN 0
        WHEN r.start_hour IS NOT NULL AND r.start_hour < 15 AND (r.raw_before_17 + r.raw_after_17) > 0.01 AND r.net_hours > 0 THEN
          r.raw_before_17 * r.net_hours / (r.raw_before_17 + r.raw_after_17)
        WHEN (r.raw_before_17 + r.raw_after_17) > 0.01 AND r.net_hours > 0 THEN
          r.raw_before_17 * r.net_hours / (r.raw_before_17 + r.raw_after_17)
        ELSE 0
      END AS day_hours,
      -- evening_hours
      CASE
        WHEN r.start_hour IS NOT NULL AND r.start_hour < 12 THEN 0
        WHEN r.start_hour IS NOT NULL AND r.start_hour >= 15 THEN r.net_hours
        WHEN r.start_hour IS NOT NULL AND r.start_hour < 15 AND (r.raw_before_17 + r.raw_after_17) > 0.01 AND r.net_hours > 0 THEN
          r.raw_after_17 * r.net_hours / (r.raw_before_17 + r.raw_after_17)
        WHEN (r.raw_before_17 + r.raw_after_17) > 0.01 AND r.net_hours > 0 THEN
          r.raw_after_17 * r.net_hours / (r.raw_before_17 + r.raw_after_17)
        ELSE 0
      END AS evening_hours,
      r.net_hours AS total_hours,
      COALESCE(r.overtime_hours, 0)::numeric AS overtime_hours,
      -- overtime split by class
      CASE
        WHEN r.start_hour IS NOT NULL AND r.start_hour < 12 THEN COALESCE(r.overtime_hours, 0)
        WHEN r.start_hour IS NOT NULL AND r.start_hour >= 15 THEN 0
        WHEN (r.raw_before_17 + r.raw_after_17) > 0.01 THEN
          COALESCE(r.overtime_hours, 0) * r.raw_before_17 / (r.raw_before_17 + r.raw_after_17)
        ELSE 0
      END AS morning_overtime,
      CASE
        WHEN r.start_hour IS NOT NULL AND r.start_hour < 12 THEN 0
        WHEN r.start_hour IS NOT NULL AND r.start_hour >= 15 THEN COALESCE(r.overtime_hours, 0)
        WHEN (r.raw_before_17 + r.raw_after_17) > 0.01 THEN
          COALESCE(r.overtime_hours, 0) * r.raw_after_17 / (r.raw_before_17 + r.raw_after_17)
        ELSE 0
      END AS evening_overtime,
      r.status,
      COALESCE(r.is_manually_adjusted, false) AS is_manually_adjusted,
      r.adjustments_count
    FROM classified r
  ),
  sales_orders AS (
    SELECT
      pt.branch_id,
      COALESCE(o.business_date, (o.created_at AT TIME ZONE 'Asia/Hebron')::date) AS date,
      EXTRACT(HOUR FROM (o.created_at AT TIME ZONE 'Asia/Hebron'))::int AS sale_hour,
      COALESCE(o.total, 0)::numeric AS total
    FROM public.pos_orders o
    LEFT JOIN public.transactions tx ON tx.id = o.transaction_id
    LEFT JOIN public.pos_sessions ps ON ps.id = o.session_id
    LEFT JOIN public.pos_terminals pt ON pt.id = ps.terminal_id
    WHERE o.user_id = p_owner_id
      AND o.state = 'paid'
      AND (o.transaction_id IS NULL OR COALESCE(tx.is_deleted, false) = false)
      AND (
        o.business_date BETWEEN p_date_from AND p_date_to
        OR (
          o.business_date IS NULL
          AND p_date_from < (CURRENT_DATE - 60)
          AND o.created_at >= (p_date_from::timestamp AT TIME ZONE 'Asia/Hebron')
          AND o.created_at < ((p_date_to::timestamp + interval '1 day') AT TIME ZONE 'Asia/Hebron')
        )
      )
      AND (p_branch_id IS NULL OR pt.branch_id = p_branch_id)
  ),
  sales_agg AS (
    SELECT branch_id, date,
      sum(total)::numeric AS sales_total,
      sum(CASE WHEN sale_hour < 17 THEN total ELSE 0 END)::numeric AS morning_sales,
      sum(CASE WHEN sale_hour >= 17 THEN total ELSE 0 END)::numeric AS evening_sales
    FROM sales_orders GROUP BY branch_id, date
  ),
  sales_hourly AS (
    SELECT branch_id, date, sale_hour, sum(total)::numeric AS amount
    FROM sales_orders GROUP BY branch_id, date, sale_hour
  ),
  sales_hourly_json AS (
    SELECT keys.branch_id, keys.date,
      jsonb_agg(COALESCE(round(sh.amount, 2), 0) ORDER BY h.hr) AS hourly_sales
    FROM (SELECT DISTINCT branch_id, date FROM sales_orders) keys
    CROSS JOIN generate_series(0, 23) AS h(hr)
    LEFT JOIN sales_hourly sh
      ON sh.branch_id IS NOT DISTINCT FROM keys.branch_id
     AND sh.date = keys.date AND sh.sale_hour = h.hr
    GROUP BY keys.branch_id, keys.date
  ),
  attendance_agg AS (
    SELECT
      dr.branch_id, dr.date,
      count(DISTINCT dr.employee_id)::int AS employees_count,
      count(DISTINCT CASE WHEN dr.shift_class IN ('morning','mid') THEN dr.employee_id END)::int AS morning_employees,
      count(DISTINCT CASE WHEN dr.shift_class IN ('evening','mid') THEN dr.employee_id END)::int AS evening_employees,
      sum(dr.day_hours)::numeric AS day_hours,
      sum(dr.evening_hours)::numeric AS evening_hours,
      sum(dr.total_hours)::numeric AS total_hours,
      sum(dr.overtime_hours)::numeric AS overtime_hours,
      sum(dr.morning_overtime)::numeric AS morning_overtime,
      sum(dr.evening_overtime)::numeric AS evening_overtime,
      sum(dr.adjustments_count)::int AS adjustments_count
    FROM detail_rows dr GROUP BY dr.branch_id, dr.date
  ),
  dept_agg AS (
    SELECT dr.branch_id, dr.date, dr.department,
      count(DISTINCT dr.employee_id)::int AS employees_count,
      sum(dr.day_hours)::numeric AS day_hours,
      sum(dr.evening_hours)::numeric AS evening_hours,
      sum(dr.total_hours)::numeric AS total_hours,
      sum(dr.overtime_hours)::numeric AS overtime_hours
    FROM detail_rows dr GROUP BY dr.branch_id, dr.date, dr.department
  ),
  dept_json AS (
    SELECT da.branch_id, da.date,
      jsonb_agg(
        jsonb_build_object(
          'department', da.department,
          'employees_count', da.employees_count,
          'day_hours', round(da.day_hours, 2),
          'evening_hours', round(da.evening_hours, 2),
          'total_hours', round(da.total_hours, 2),
          'overtime_hours', round(da.overtime_hours, 2)
        ) ORDER BY da.total_hours DESC
      ) AS departments
    FROM dept_agg da GROUP BY da.branch_id, da.date
  ),
  all_keys AS (
    SELECT branch_id, date FROM attendance_agg
    UNION SELECT branch_id, date FROM sales_agg
  ),
  rows_json AS (
    SELECT COALESCE(jsonb_agg(row_obj ORDER BY date DESC, branch_name ASC), '[]'::jsonb) AS rows
    FROM (
      SELECT
        k.date,
        COALESCE(bl.name, 'بدون فرع') AS branch_name,
        jsonb_build_object(
          'branch_id', k.branch_id,
          'branch_name', COALESCE(bl.name, 'بدون فرع'),
          'date', k.date,
          'employees_count', COALESCE(aa.employees_count, 0),
          'morning_employees', COALESCE(aa.morning_employees, 0),
          'evening_employees', COALESCE(aa.evening_employees, 0),
          'day_hours', round(COALESCE(aa.day_hours, 0), 2),
          'evening_hours', round(COALESCE(aa.evening_hours, 0), 2),
          'total_hours', round(COALESCE(aa.total_hours, 0), 2),
          'overtime_hours', round(COALESCE(aa.overtime_hours, 0), 2),
          'morning_overtime', round(COALESCE(aa.morning_overtime, 0), 2),
          'evening_overtime', round(COALESCE(aa.evening_overtime, 0), 2),
          'adjustments_count', COALESCE(aa.adjustments_count, 0),
          'sales_total', round(COALESCE(sa.sales_total, 0), 2),
          'morning_sales', round(COALESCE(sa.morning_sales, 0), 2),
          'evening_sales', round(COALESCE(sa.evening_sales, 0), 2),
          'sales_per_hour', CASE WHEN COALESCE(aa.total_hours, 0) > 0 THEN round(COALESCE(sa.sales_total, 0) / aa.total_hours, 2) ELSE 0 END,
          'departments', COALESCE(dj.departments, '[]'::jsonb),
          'hourly_sales', COALESCE(shj.hourly_sales, '[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]'::jsonb)
        ) AS row_obj
      FROM all_keys k
      LEFT JOIN branch_list bl ON bl.id = k.branch_id
      LEFT JOIN attendance_agg aa ON aa.branch_id IS NOT DISTINCT FROM k.branch_id AND aa.date = k.date
      LEFT JOIN sales_agg sa ON sa.branch_id IS NOT DISTINCT FROM k.branch_id AND sa.date = k.date
      LEFT JOIN dept_json dj ON dj.branch_id IS NOT DISTINCT FROM k.branch_id AND dj.date = k.date
      LEFT JOIN sales_hourly_json shj ON shj.branch_id IS NOT DISTINCT FROM k.branch_id AND shj.date = k.date
      WHERE k.date BETWEEN p_date_from AND p_date_to
    ) x
  ),
  details_json AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'branch_id', dr.branch_id,
        'branch_name', dr.branch_name,
        'date', dr.date,
        'employee_id', dr.employee_id,
        'employee_name', dr.employee_name,
        'department', dr.department,
        'position', dr.position,
        'shift', dr.shift,
        'shift_class', dr.shift_class,
        'first_check_in', dr.first_check_in,
        'last_check_out', dr.last_check_out,
        'break_minutes', dr.break_minutes,
        'day_hours', round(dr.day_hours, 2),
        'evening_hours', round(dr.evening_hours, 2),
        'total_hours', round(dr.total_hours, 2),
        'overtime_hours', round(dr.overtime_hours, 2),
        'morning_overtime', round(dr.morning_overtime, 2),
        'evening_overtime', round(dr.evening_overtime, 2),
        'status', dr.status,
        'is_manually_adjusted', dr.is_manually_adjusted,
        'adjustments_count', dr.adjustments_count
      ) ORDER BY dr.date DESC, dr.branch_name ASC, dr.employee_name ASC
    ), '[]'::jsonb) AS details
    FROM detail_rows dr
  ),
  branches_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', bl.id, 'name', bl.name) ORDER BY bl.name), '[]'::jsonb) AS branches
    FROM branch_list bl
  )
  SELECT jsonb_build_object(
    'success', true,
    'rows', r.rows,
    'details', d.details,
    'branches', b.branches,
    'meta', jsonb_build_object(
      'source_of_truth', 'attendance_days',
      'split_method', 'shift-class based (morning<12h, mid 12-15h, evening>=15h). Mid split at 17:00 local.',
      'overtime_source', 'attendance_days.overtime_hours',
      'sales_split_pivot', '17:00 local',
      'corrections_source', 'correction_requests approved',
      'query_mode', 'database_aggregated'
    )
  ) INTO v_result
  FROM rows_json r CROSS JOIN details_json d CROSS JOIN branches_json b;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_branch_hours_sales_report(uuid, date, date, uuid) TO service_role;