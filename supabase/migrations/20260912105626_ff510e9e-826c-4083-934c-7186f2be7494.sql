CREATE OR REPLACE FUNCTION public.get_invoice_sequence_next(
  p_user_id uuid,
  p_invoice_type text,
  p_year integer
) RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_prefix text;
  v_current integer;
  v_candidate integer;
BEGIN
  PERFORM public.assert_owner_scope(p_user_id);

  IF p_invoice_type NOT IN ('sale', 'purchase') THEN
    RAISE EXCEPTION 'نوع فاتورة غير مدعوم: %', p_invoice_type USING ERRCODE = '22023';
  END IF;
  IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'سنة غير صالحة' USING ERRCODE = '22023';
  END IF;

  SELECT CASE WHEN p_invoice_type = 'sale'
    THEN COALESCE(NULLIF(trim(invoice_prefix), ''), 'INV')
    ELSE COALESCE(NULLIF(trim(purchase_order_prefix), ''), 'PO') END
  INTO v_prefix
  FROM public.company_settings
  WHERE user_id = p_user_id
  LIMIT 1;
  v_prefix := COALESCE(v_prefix, CASE WHEN p_invoice_type = 'sale' THEN 'INV' ELSE 'PO' END);

  SELECT last_number INTO v_current
  FROM public.invoice_sequences
  WHERE user_id = p_user_id AND invoice_type = p_invoice_type
    AND year = p_year AND prefix = v_prefix;

  IF v_current IS NULL THEN
    SELECT COALESCE(MAX(parts[3]::integer), 0) INTO v_current
    FROM public.invoices i
    CROSS JOIN LATERAL regexp_match(i.invoice_number, '^(.*)-([0-9]{4})-([0-9]+)$') AS parts
    WHERE i.user_id = p_user_id
      AND ((p_invoice_type = 'sale' AND i.invoice_type IN ('sale', 'sales'))
        OR (p_invoice_type = 'purchase' AND i.invoice_type = 'purchase'))
      AND parts IS NOT NULL AND parts[1] = v_prefix AND parts[2] = p_year::text;
  END IF;

  v_candidate := COALESCE(v_current, 0) + 1;
  WHILE EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.user_id = p_user_id
      AND ((p_invoice_type = 'sale' AND i.invoice_type IN ('sale', 'sales'))
        OR (p_invoice_type = 'purchase' AND i.invoice_type = 'purchase'))
      AND i.invoice_number = v_prefix || '-' || p_year::text || '-' || lpad(v_candidate::text, 4, '0')
  ) LOOP
    v_candidate := v_candidate + 1;
  END LOOP;
  RETURN v_candidate;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_invoice_sequence_start(
  p_user_id uuid,
  p_invoice_type text,
  p_year integer,
  p_next_number integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_prefix text;
  v_candidate text;
  v_previous integer;
  v_actor text;
BEGIN
  PERFORM public.assert_owner_scope(p_user_id);
  IF v_uid IS NULL THEN RAISE EXCEPTION 'غير مصرح' USING ERRCODE = '42501'; END IF;
  IF NOT (v_uid = p_user_id OR public.has_role(v_uid, 'admin') OR public.has_role(v_uid, 'super_admin')) THEN
    RAISE EXCEPTION 'تغيير ترقيم الفواتير متاح لصاحب المؤسسة أو مدير النظام فقط' USING ERRCODE = '42501';
  END IF;
  IF p_invoice_type NOT IN ('sale', 'purchase') THEN
    RAISE EXCEPTION 'نوع فاتورة غير مدعوم: %', p_invoice_type USING ERRCODE = '22023';
  END IF;
  IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'سنة غير صالحة' USING ERRCODE = '22023';
  END IF;
  IF p_next_number IS NULL OR p_next_number < 1 OR p_next_number > 9999999 THEN
    RAISE EXCEPTION 'رقم بداية غير صالح' USING ERRCODE = '22023';
  END IF;

  SELECT CASE WHEN p_invoice_type = 'sale'
    THEN COALESCE(NULLIF(trim(invoice_prefix), ''), 'INV')
    ELSE COALESCE(NULLIF(trim(purchase_order_prefix), ''), 'PO') END
  INTO v_prefix FROM public.company_settings WHERE user_id = p_user_id LIMIT 1;
  v_prefix := COALESCE(v_prefix, CASE WHEN p_invoice_type = 'sale' THEN 'INV' ELSE 'PO' END);
  v_candidate := v_prefix || '-' || p_year::text || '-' || lpad(p_next_number::text, 4, '0');

  INSERT INTO public.invoice_sequences (user_id, invoice_type, year, prefix, last_number, updated_at)
  VALUES (p_user_id, p_invoice_type, p_year, v_prefix, 0, now())
  ON CONFLICT (user_id, invoice_type, year, prefix) DO NOTHING;

  SELECT last_number INTO v_previous
  FROM public.invoice_sequences
  WHERE user_id = p_user_id AND invoice_type = p_invoice_type
    AND year = p_year AND prefix = v_prefix
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.user_id = p_user_id
      AND ((p_invoice_type = 'sale' AND i.invoice_type IN ('sale', 'sales'))
        OR (p_invoice_type = 'purchase' AND i.invoice_type = 'purchase'))
      AND i.invoice_number = v_candidate
  ) THEN
    RAISE EXCEPTION 'رقم الفاتورة % مستخدم مسبقاً، اختر رقماً فارغاً', v_candidate USING ERRCODE = '23505';
  END IF;

  UPDATE public.invoice_sequences
  SET last_number = p_next_number - 1, updated_at = now()
  WHERE user_id = p_user_id AND invoice_type = p_invoice_type
    AND year = p_year AND prefix = v_prefix;

  SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.raw_user_meta_data ->> 'full_name')), ''), u.email, v_uid::text)
  INTO v_actor FROM auth.users u WHERE u.id = v_uid;
  INSERT INTO public.activity_log (user_id, actor_id, actor_name, action, entity_type, entity_id, entity_label, details)
  VALUES (p_user_id, v_uid, COALESCE(v_actor, 'unknown'), 'invoice_sequence_start_changed', 'invoice_sequence',
    p_invoice_type || ':' || p_year::text || ':' || v_prefix,
    CASE WHEN p_invoice_type = 'sale' THEN 'فواتير المبيعات' ELSE 'فواتير المشتريات' END,
    jsonb_build_object('invoice_type', p_invoice_type, 'year', p_year, 'prefix', v_prefix,
      'previous_last_number', v_previous, 'new_last_number', p_next_number - 1,
      'next_number', p_next_number, 'candidate', v_candidate));
  RETURN p_next_number;
END;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_sequence_next(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_invoice_sequence_start(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invoice_sequence_next(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_invoice_sequence_start(uuid, text, integer, integer) TO authenticated, service_role;