CREATE OR REPLACE FUNCTION public.prevent_manager_cycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _cur uuid;
  _owner uuid;
  _guard int := 0;
BEGIN
  IF NEW.manager_employee_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.manager_employee_id = NEW.id THEN
    RAISE EXCEPTION 'لا يمكن ربط الموظف بنفسه كمدير';
  END IF;

  SELECT user_id INTO _owner FROM public.employees WHERE id = NEW.manager_employee_id;
  IF _owner IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'المدير يجب أن يكون ضمن نفس الشركة';
  END IF;

  _cur := NEW.manager_employee_id;
  WHILE _cur IS NOT NULL AND _guard < 20 LOOP
    IF _cur = NEW.id THEN
      RAISE EXCEPTION 'تسلسل إداري دائري غير مسموح';
    END IF;
    SELECT manager_employee_id INTO _cur FROM public.employees WHERE id = _cur;
    _guard := _guard + 1;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_manager_cycle ON public.employees;
CREATE TRIGGER trg_prevent_manager_cycle
BEFORE INSERT OR UPDATE OF manager_employee_id ON public.employees
FOR EACH ROW EXECUTE FUNCTION public.prevent_manager_cycle();

CREATE INDEX IF NOT EXISTS idx_employees_manager_employee_id
  ON public.employees (manager_employee_id) WHERE manager_employee_id IS NOT NULL;