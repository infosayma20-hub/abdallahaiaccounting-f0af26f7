CREATE POLICY "Admins can delete forms"
ON public.employee_forms
FOR DELETE
TO authenticated
USING (is_team_member(auth.uid(), user_id));