DROP TRIGGER IF EXISTS trg_auto_archive_employee_form ON public.employee_forms;
CREATE TRIGGER trg_auto_archive_employee_form
BEFORE UPDATE ON public.employee_forms
FOR EACH ROW
EXECUTE FUNCTION public.auto_archive_employee_form();