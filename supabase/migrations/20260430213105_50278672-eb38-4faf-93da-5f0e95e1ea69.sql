-- ============================================================
-- Safety trigger: auto-fill employees.company_id from user_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_fill_employee_company_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  -- Only fill if not already provided
  IF NEW.company_id IS NULL THEN
    IF NEW.user_id IS NULL THEN
      RAISE EXCEPTION 'لا يمكن إنشاء موظف بدون user_id أو company_id';
    END IF;
    
    -- Get the oldest company owned by this user
    SELECT id INTO v_company_id
    FROM public.companies
    WHERE owner_id = NEW.user_id
    ORDER BY created_at ASC
    LIMIT 1;
    
    IF v_company_id IS NULL THEN
      RAISE EXCEPTION 'لا توجد شركة مرتبطة بالمستخدم %. يجب إنشاء شركة أولاً.', NEW.user_id;
    END IF;
    
    NEW.company_id := v_company_id;
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_fill_employee_company_id ON public.employees;
CREATE TRIGGER trg_auto_fill_employee_company_id
  BEFORE INSERT ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_fill_employee_company_id();

COMMENT ON FUNCTION public.auto_fill_employee_company_id IS 'Multi-tenant safety: auto-fills employees.company_id from companies.owner_id when not explicitly provided. Prevents orphan employees that bypass RLS isolation.';