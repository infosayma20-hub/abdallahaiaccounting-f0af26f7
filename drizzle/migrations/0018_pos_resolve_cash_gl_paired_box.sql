CREATE OR REPLACE FUNCTION public._pos_resolve_cash_gl(p_session_box_id uuid, p_currency text, p_default text)
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_branch_id uuid; v_user_id uuid; v_name text; v_gl text; v_label text;
BEGIN
  IF p_currency IS NULL OR upper(p_currency) = 'ILS' OR p_session_box_id IS NULL THEN
    RETURN p_default;
  END IF;
  SELECT branch_id, user_id, name INTO v_branch_id, v_user_id, v_name
  FROM public.cash_boxes WHERE id = p_session_box_id;
  IF v_branch_id IS NULL THEN RETURN p_default; END IF;

  v_label := CASE upper(p_currency) WHEN 'JOD' THEN 'دينار' WHEN 'USD' THEN 'دولار' WHEN 'EUR' THEN 'يورو' ELSE NULL END;

  -- 1) الصندوق المقابل لصندوق الوردية نفسه (مثال: "كاش سفيان 2" ← "كاش سفيان 2 - دينار")
  SELECT gl_account_code INTO v_gl FROM public.cash_boxes
  WHERE user_id = v_user_id AND branch_id = v_branch_id
    AND upper(currency) = upper(p_currency) AND COALESCE(is_active, true)
    AND (btrim(name) = btrim(v_name) || ' - ' || COALESCE(v_label, upper(p_currency))
         OR btrim(name) = btrim(v_name) || ' - ' || upper(p_currency))
  ORDER BY created_at LIMIT 1;

  -- 2) أي صندوق كاش بنفس العملة والفرع غير الخزينة
  IF v_gl IS NULL THEN
    SELECT gl_account_code INTO v_gl FROM public.cash_boxes
    WHERE user_id = v_user_id AND branch_id = v_branch_id
      AND upper(currency) = upper(p_currency) AND COALESCE(is_active, true)
      AND name NOT ILIKE 'خزينة%'
    ORDER BY created_at LIMIT 1;
  END IF;

  -- 3) الخزينة فقط إذا ما في صندوق كاش
  IF v_gl IS NULL THEN
    SELECT gl_account_code INTO v_gl FROM public.cash_boxes
    WHERE user_id = v_user_id AND branch_id = v_branch_id
      AND upper(currency) = upper(p_currency) AND COALESCE(is_active, true)
    ORDER BY created_at LIMIT 1;
  END IF;

  RETURN COALESCE(v_gl, p_default);
END;
$function$;