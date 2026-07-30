CREATE TABLE public.attendance_derived_gap_dismissals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  attendance_day_id UUID NOT NULL,
  employee_id UUID NOT NULL,
  gap_out TIMESTAMP WITH TIME ZONE NOT NULL,
  gap_in TIMESTAMP WITH TIME ZONE NOT NULL,
  reason TEXT,
  dismissed_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_adgd_day ON public.attendance_derived_gap_dismissals (attendance_day_id);
CREATE INDEX idx_adgd_emp_time ON public.attendance_derived_gap_dismissals (employee_id, gap_out);

GRANT SELECT, INSERT, DELETE ON public.attendance_derived_gap_dismissals TO authenticated;
GRANT ALL ON public.attendance_derived_gap_dismissals TO service_role;

ALTER TABLE public.attendance_derived_gap_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR can view organization gap dismissals"
ON public.attendance_derived_gap_dismissals FOR SELECT TO authenticated
USING (
  (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND EXISTS (SELECT 1 FROM employees e WHERE e.id = attendance_derived_gap_dismissals.employee_id AND is_team_member(auth.uid(), e.user_id))
);

CREATE POLICY "HR can insert organization gap dismissals"
ON public.attendance_derived_gap_dismissals FOR INSERT TO authenticated
WITH CHECK (
  (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND EXISTS (SELECT 1 FROM employees e WHERE e.id = attendance_derived_gap_dismissals.employee_id AND is_team_member(auth.uid(), e.user_id))
);

CREATE POLICY "HR can delete organization gap dismissals"
ON public.attendance_derived_gap_dismissals FOR DELETE TO authenticated
USING (
  (has_role(auth.uid(), 'hr_manager'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND EXISTS (SELECT 1 FROM employees e WHERE e.id = attendance_derived_gap_dismissals.employee_id AND is_team_member(auth.uid(), e.user_id))
);

CREATE POLICY "Service role full access gap dismissals"
ON public.attendance_derived_gap_dismissals FOR ALL TO service_role
USING (true) WITH CHECK (true);