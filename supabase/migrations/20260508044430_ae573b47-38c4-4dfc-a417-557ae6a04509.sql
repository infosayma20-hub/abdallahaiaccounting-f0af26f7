
-- Allow branch managers to view team's attendance days
CREATE POLICY "Branch managers can view team attendance days"
ON public.attendance_days
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = attendance_days.employee_id
      AND e.branch_id IS NOT NULL
      AND public.is_branch_manager_of(auth.uid(), e.branch_id)
  )
);

-- Allow branch managers to view team's correction requests
CREATE POLICY "Branch managers can view team correction requests"
ON public.correction_requests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = correction_requests.employee_id
      AND e.branch_id IS NOT NULL
      AND public.is_branch_manager_of(auth.uid(), e.branch_id)
  )
);

-- Allow branch managers to approve/reject team's correction requests
CREATE POLICY "Branch managers can update team correction requests"
ON public.correction_requests
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.id = correction_requests.employee_id
      AND e.branch_id IS NOT NULL
      AND public.is_branch_manager_of(auth.uid(), e.branch_id)
  )
);
