ALTER TABLE public.employee_forms
  ADD CONSTRAINT employee_forms_complaint_target_chk
  CHECK (
    (form_type = 'complaints' AND complaint_target IN ('hr','executive'))
    OR (form_type <> 'complaints' AND complaint_target IS NULL)
  ) NOT VALID;