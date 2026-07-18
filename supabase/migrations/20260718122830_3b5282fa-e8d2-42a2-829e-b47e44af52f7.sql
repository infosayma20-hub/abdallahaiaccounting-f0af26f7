CREATE OR REPLACE FUNCTION public.auto_fill_employee_company_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
BEGIN
  IF NEW.company_id IS NULL THEN
    IF NEW.user_id IS NULL THEN
      RAISE EXCEPTION 'لا يمكن إنشاء موظف بدون user_id أو company_id';
    END IF;
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
$function$;