
-- Fix existing bad data: set user_id to employee's owner (employees.user_id)
UPDATE public.employee_forms ef
SET user_id = e.user_id
FROM public.employees e
WHERE ef.employee_id = e.id
  AND ef.user_id != e.user_id;

-- Create trigger to auto-set user_id on insert
CREATE OR REPLACE FUNCTION public.set_employee_form_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  SELECT user_id INTO NEW.user_id
  FROM public.employees
  WHERE id = NEW.employee_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_set_employee_form_owner
  BEFORE INSERT ON public.employee_forms
  FOR EACH ROW
  EXECUTE FUNCTION public.set_employee_form_owner();
