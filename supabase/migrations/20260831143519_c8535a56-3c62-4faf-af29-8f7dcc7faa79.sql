-- attendance_events: replace per-row EXISTS/recursive checks with per-statement InitPlan arrays
DROP POLICY IF EXISTS "HR can view organization attendance events" ON public.attendance_events;
CREATE POLICY "HR can view organization attendance events"
ON public.attendance_events FOR SELECT TO authenticated
USING (
  ((SELECT public.has_role((SELECT auth.uid()), 'hr_manager'::app_role))
   OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)))
  AND employee_id = ANY ((SELECT public.my_org_employee_ids())::uuid[])
);

DROP POLICY IF EXISTS "HR can update organization attendance events" ON public.attendance_events;
CREATE POLICY "HR can update organization attendance events"
ON public.attendance_events FOR UPDATE TO authenticated
USING (
  ((SELECT public.has_role((SELECT auth.uid()), 'hr_manager'::app_role))
   OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)))
  AND employee_id = ANY ((SELECT public.my_org_employee_ids())::uuid[])
);

DROP POLICY IF EXISTS "Managers can view team attendance events" ON public.attendance_events;
CREATE POLICY "Managers can view team attendance events"
ON public.attendance_events FOR SELECT TO authenticated
USING (employee_id = ANY ((SELECT public.my_visible_employee_ids())::uuid[]));

-- attendance_breaks
DROP POLICY IF EXISTS "HR can view organization breaks" ON public.attendance_breaks;
CREATE POLICY "HR can view organization breaks"
ON public.attendance_breaks FOR SELECT TO authenticated
USING (
  ((SELECT public.has_role((SELECT auth.uid()), 'hr_manager'::app_role))
   OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)))
  AND employee_id = ANY ((SELECT public.my_org_employee_ids())::uuid[])
);

DROP POLICY IF EXISTS "HR can update organization breaks" ON public.attendance_breaks;
CREATE POLICY "HR can update organization breaks"
ON public.attendance_breaks FOR UPDATE TO authenticated
USING (
  ((SELECT public.has_role((SELECT auth.uid()), 'hr_manager'::app_role))
   OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)))
  AND employee_id = ANY ((SELECT public.my_org_employee_ids())::uuid[])
);

DROP POLICY IF EXISTS "HR can delete organization breaks" ON public.attendance_breaks;
CREATE POLICY "HR can delete organization breaks"
ON public.attendance_breaks FOR DELETE TO authenticated
USING (
  ((SELECT public.has_role((SELECT auth.uid()), 'hr_manager'::app_role))
   OR (SELECT public.has_role((SELECT auth.uid()), 'admin'::app_role)))
  AND employee_id = ANY ((SELECT public.my_org_employee_ids())::uuid[])
);

DROP POLICY IF EXISTS "Managers can view team attendance breaks" ON public.attendance_breaks;
CREATE POLICY "Managers can view team attendance breaks"
ON public.attendance_breaks FOR SELECT TO authenticated
USING (
  employee_id = ANY ((SELECT public.my_visible_employee_ids())::uuid[])
  OR (employee_id IS NULL AND EXISTS (
        SELECT 1 FROM public.attendance_days d
        WHERE d.id = attendance_breaks.attendance_day_id
          AND d.employee_id = ANY ((SELECT public.my_visible_employee_ids())::uuid[])))
);