ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS employee_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS accounts_employee_unique_active
  ON public.accounts (user_id, employee_id)
  WHERE employee_id IS NOT NULL AND is_active = true;

CREATE INDEX IF NOT EXISTS accounts_employee_idx ON public.accounts (employee_id);

CREATE OR REPLACE FUNCTION public.ensure_employee_sub_account(p_data_owner uuid, p_employee_id uuid)
 RETURNS TABLE(account_code text, account_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_full_name text;
  v_target_name text;
  v_existing_code text;
  v_existing_name text;
  v_parent_code text := '2180';
  v_parent_type text;
  v_next_num int;
  v_new_code text;
BEGIN
  SELECT full_name INTO v_full_name
  FROM public.employees
  WHERE id = p_employee_id AND user_id = p_data_owner;

  IF v_full_name IS NULL THEN
    RAISE EXCEPTION 'الموظف غير موجود' USING ERRCODE = 'P0002';
  END IF;

  v_target_name := 'ذمم موظف - ' || regexp_replace(v_full_name, '\s+', ' ', 'g');

  -- 1) الربط الثابت بالموظف (الأولوية القصوى) — لا يتأثر بتغيير الاسم
  SELECT a.account_code, a.account_name
    INTO v_existing_code, v_existing_name
  FROM public.accounts a
  WHERE a.user_id = p_data_owner
    AND a.is_active = true
    AND a.employee_id = p_employee_id
  LIMIT 1;

  IF v_existing_code IS NOT NULL THEN
    IF regexp_replace(v_existing_name, '\s+', ' ', 'g') <> v_target_name THEN
      UPDATE public.accounts
         SET account_name = v_target_name, updated_at = now()
       WHERE user_id = p_data_owner AND account_code = v_existing_code;
      v_existing_name := v_target_name;
    END IF;
    account_code := v_existing_code;
    account_name := v_existing_name;
    RETURN NEXT;
    RETURN;
  END IF;

  -- 2) مطابقة الاسم (للحسابات القديمة غير المربوطة بعد)
  SELECT a.account_code, a.account_name
    INTO v_existing_code, v_existing_name
  FROM public.accounts a
  WHERE a.user_id = p_data_owner
    AND a.is_active = true
    AND a.employee_id IS NULL
    AND (
      regexp_replace(a.account_name, '\s+', ' ', 'g') = v_target_name
      OR (
        regexp_replace(a.account_name, '\s+', ' ', 'g') ILIKE '%' || regexp_replace(v_full_name, '\s+', ' ', 'g') || '%'
        AND (a.account_code LIKE '218%' OR a.account_code LIKE '13%')
      )
    )
  ORDER BY (regexp_replace(a.account_name, '\s+', ' ', 'g') = v_target_name) DESC
  LIMIT 1;

  IF v_existing_code IS NOT NULL THEN
    UPDATE public.accounts
       SET employee_id = p_employee_id, updated_at = now()
     WHERE user_id = p_data_owner AND account_code = v_existing_code;
    account_code := v_existing_code;
    account_name := v_existing_name;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT a.account_type INTO v_parent_type
  FROM public.accounts a
  WHERE a.user_id = p_data_owner AND a.account_code = v_parent_code
  LIMIT 1;

  IF v_parent_type IS NULL THEN
    INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, is_active, is_system_protected, nature)
    VALUES (p_data_owner, v_parent_code, 'ذمم موظفين', 'التزامات', NULL, true, true, 'credit');
    v_parent_type := 'التزامات';
  END IF;

  SELECT COALESCE(
    MAX(NULLIF(regexp_replace(a.account_code, '^218', ''), '')::int),
    0
  ) + 1
  INTO v_next_num
  FROM public.accounts a
  WHERE a.user_id = p_data_owner
    AND a.account_code ~ '^218[0-9]+$'
    AND a.account_code <> '2180';

  IF v_next_num < 1 THEN v_next_num := 1; END IF;

  v_new_code := '218' || v_next_num::text;

  INSERT INTO public.accounts (
    user_id, account_code, account_name, account_type, parent_code,
    is_active, is_system_protected, nature, employee_id
  ) VALUES (
    p_data_owner, v_new_code, v_target_name, v_parent_type, v_parent_code,
    true, false, 'credit', p_employee_id
  );

  account_code := v_new_code;
  account_name := v_target_name;
  RETURN NEXT;
END;
$function$;