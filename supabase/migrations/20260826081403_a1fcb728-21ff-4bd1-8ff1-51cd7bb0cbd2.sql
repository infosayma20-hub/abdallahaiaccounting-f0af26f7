CREATE POLICY "HR admins can insert company forms"
ON public.employee_forms
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_hr_admin(auth.uid(), user_id)
  AND public.is_team_member(auth.uid(), user_id)
);

ALTER TABLE public.employee_advances
  ADD CONSTRAINT employee_advances_amount_positive_chk
  CHECK (amount > 0) NOT VALID,
  ADD CONSTRAINT employee_advances_installments_positive_chk
  CHECK (installments_count >= 1) NOT VALID;

ALTER TABLE public.employee_advance_installments
  ADD CONSTRAINT employee_advance_installments_amount_positive_chk
  CHECK (amount > 0) NOT VALID,
  ADD CONSTRAINT employee_advance_installments_number_positive_chk
  CHECK (installment_number >= 1) NOT VALID;