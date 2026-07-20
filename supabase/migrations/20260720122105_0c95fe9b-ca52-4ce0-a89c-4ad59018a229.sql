CREATE OR REPLACE FUNCTION public.guard_pos_meal_edit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller UUID := auth.uid();
  v_allowed BOOLEAN := false;
BEGIN
  IF v_caller IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'UPDATE' AND OLD.source_type <> 'pos_meal') THEN
    RETURN NEW;
  END IF;
  IF (TG_OP = 'DELETE' AND OLD.source_type <> 'pos_meal') THEN
    RETURN OLD;
  END IF;

  -- Tenant owner is implicitly allowed
  IF v_caller = COALESCE(OLD.user_id, NEW.user_id) THEN
    v_allowed := true;
  END IF;

  -- Roles allowed to mutate: admin, super_admin, hr_manager, manager, pos_manager, accountant
  IF NOT v_allowed AND (
       public.has_role(v_caller, 'admin'::app_role)
    OR public.has_role(v_caller, 'super_admin'::app_role)
    OR public.has_role(v_caller, 'hr_manager'::app_role)
    OR public.has_role(v_caller, 'manager'::app_role)
    OR public.has_role(v_caller, 'pos_manager'::app_role)
    OR public.has_role(v_caller, 'accountant'::app_role)
  ) THEN
    v_allowed := true;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'غير مصرح: لا يمكن تعديل أو حذف حركات وجبات POS إلا من قبل المدير أو المحاسب أو مدير الموارد البشرية'
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;