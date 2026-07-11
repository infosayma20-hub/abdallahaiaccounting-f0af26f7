-- Portal roster assignments viewer: SECURITY DEFINER RPCs so bawwabet el-idara users
-- (malaki_portal_users) can see shift assignments made by branch managers for their tenant,
-- with manager names resolved via employees.auth_user_id. Read-only. No schema changes.

CREATE OR REPLACE FUNCTION public.get_portal_roster_assignments(
  p_company_id uuid,
  p_date_from date DEFAULT (CURRENT_DATE - INTERVAL '7 days')::date,
  p_date_to   date DEFAULT (CURRENT_DATE + INTERVAL '7 days')::date
)
RETURNS TABLE (
  id uuid,
  roster_date date,
  employee_id uuid,
  employee_name text,
  branch_id uuid,
  branch_name text,
  shift_template_id uuid,
  shift_name text,
  shift_start time,
  shift_end time,
  start_time time,
  end_time time,
  status text,
  notes text,
  created_by uuid,
  manager_name text,
  created_at timestamptz,
  updated_at timestamptz,
  was_edited boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    dr.id,
    dr.roster_date,
    dr.employee_id,
    e.full_name AS employee_name,
    dr.branch_id,
    b.name AS branch_name,
    dr.shift_template_id,
    st.name_ar AS shift_name,
    st.start_time AS shift_start,
    st.end_time AS shift_end,
    dr.start_time,
    dr.end_time,
    dr.status::text,
    dr.notes,
    dr.created_by,
    COALESCE(mgr.full_name, mgr_mpu.full_name, '—') AS manager_name,
    dr.created_at,
    dr.updated_at,
    (dr.updated_at IS NOT NULL AND dr.updated_at > dr.created_at + INTERVAL '2 seconds') AS was_edited
  FROM public.daily_roster dr
  LEFT JOIN public.employees e ON e.id = dr.employee_id
  LEFT JOIN public.branches  b ON b.id = dr.branch_id
  LEFT JOIN public.shift_templates st ON st.id = dr.shift_template_id
  LEFT JOIN public.employees mgr ON mgr.auth_user_id = dr.created_by
  LEFT JOIN public.malaki_portal_users mgr_mpu ON mgr_mpu.auth_user_id = dr.created_by
  WHERE dr.company_id = p_company_id
    AND dr.roster_date BETWEEN p_date_from AND p_date_to
    AND EXISTS (
      SELECT 1 FROM public.malaki_portal_users mpu
      WHERE mpu.auth_user_id = auth.uid()
        AND mpu.is_active = true
        AND mpu.user_id IN (SELECT owner_id FROM public.companies WHERE id = p_company_id)
    )
  ORDER BY dr.roster_date DESC, dr.updated_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_portal_roster_assignments(uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.get_portal_roster_assignments(uuid, date, date) TO authenticated;

-- Summary for the home card: today's total + upcoming week + last manager + last activity.
CREATE OR REPLACE FUNCTION public.get_portal_roster_summary(p_company_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_allowed boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.malaki_portal_users mpu
    WHERE mpu.auth_user_id = auth.uid()
      AND mpu.is_active = true
      AND mpu.user_id IN (SELECT owner_id FROM public.companies WHERE id = p_company_id)
  ) INTO v_allowed;

  IF NOT v_allowed THEN
    RETURN jsonb_build_object('allowed', false);
  END IF;

  SELECT jsonb_build_object(
    'allowed', true,
    'today_count', (
      SELECT COUNT(*) FROM public.daily_roster
      WHERE company_id = p_company_id AND roster_date = CURRENT_DATE
    ),
    'week_count', (
      SELECT COUNT(*) FROM public.daily_roster
      WHERE company_id = p_company_id
        AND roster_date BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '6 days')::date
    ),
    'last_assignment', (
      SELECT jsonb_build_object(
        'at', dr.created_at,
        'manager', COALESCE(mgr.full_name, mpu.full_name, '—'),
        'employee', e.full_name,
        'shift', st.name_ar,
        'date', dr.roster_date
      )
      FROM public.daily_roster dr
      LEFT JOIN public.employees e ON e.id = dr.employee_id
      LEFT JOIN public.employees mgr ON mgr.auth_user_id = dr.created_by
      LEFT JOIN public.malaki_portal_users mpu ON mpu.auth_user_id = dr.created_by
      LEFT JOIN public.shift_templates st ON st.id = dr.shift_template_id
      WHERE dr.company_id = p_company_id
      ORDER BY dr.created_at DESC
      LIMIT 1
    ),
    'top_managers', (
      SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) FROM (
        SELECT
          COALESCE(mgr.full_name, mpu.full_name, '—') AS manager,
          COUNT(*)::int AS assignments,
          MAX(dr.created_at) AS last_at
        FROM public.daily_roster dr
        LEFT JOIN public.employees mgr ON mgr.auth_user_id = dr.created_by
        LEFT JOIN public.malaki_portal_users mpu ON mpu.auth_user_id = dr.created_by
        WHERE dr.company_id = p_company_id
          AND dr.created_at >= (now() - INTERVAL '30 days')
        GROUP BY 1
        ORDER BY assignments DESC
        LIMIT 5
      ) t
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_portal_roster_summary(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_portal_roster_summary(uuid) TO authenticated;