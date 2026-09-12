-- Document numbering start point (additive; does not change existing numbering behavior)

CREATE OR REPLACE FUNCTION public.get_document_sequence_next(
  p_user_id uuid,
  p_doc_type text,
  p_year integer
) RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_current integer := 0;
  v_used integer := 0;
BEGIN
  PERFORM public.assert_owner_scope(p_user_id);

  SELECT COALESCE(last_number, 0) INTO v_current
  FROM public.document_sequences
  WHERE user_id = p_user_id AND doc_type = p_doc_type AND year = p_year;

  IF p_doc_type = 'delivery_note' THEN
    SELECT COALESCE(MAX(CASE WHEN split_part(delivery_number, '-', 3) ~ '^[0-9]+$'
                             THEN split_part(delivery_number, '-', 3)::int END), 0)
    INTO v_used
    FROM public.delivery_notes
    WHERE user_id = p_user_id
      AND delivery_number LIKE 'DN-' || p_year::text || '-%';
  END IF;

  RETURN GREATEST(COALESCE(v_current, 0), COALESCE(v_used, 0)) + 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_document_sequence_start(
  p_user_id uuid,
  p_doc_type text,
  p_year integer,
  p_next_number integer
) RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_current integer := 0;
  v_used integer := 0;
  v_floor integer := 0;
  v_actor text;
BEGIN
  PERFORM public.assert_owner_scope(p_user_id);

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'غير مصرح' USING ERRCODE = '42501';
  END IF;

  IF NOT (v_uid = p_user_id
          OR public.has_role(v_uid, 'admin')
          OR public.has_role(v_uid, 'super_admin')) THEN
    RAISE EXCEPTION 'تغيير ترقيم المستندات متاح لصاحب المؤسسة أو مدير النظام فقط'
      USING ERRCODE = '42501';
  END IF;

  IF p_doc_type IS NULL OR p_doc_type NOT IN (
      'delivery_note', 'stock_transfer',
      'receipt_voucher', 'payment_voucher', 'journal_voucher',
      'voucher_receipt', 'voucher_payment', 'voucher_journal'
  ) THEN
    RAISE EXCEPTION 'نوع مستند غير مدعوم: %', p_doc_type USING ERRCODE = '22023';
  END IF;

  IF p_year IS NULL OR p_year < 2000 OR p_year > 2100 THEN
    RAISE EXCEPTION 'سنة غير صالحة' USING ERRCODE = '22023';
  END IF;

  IF p_next_number IS NULL OR p_next_number < 1 OR p_next_number > 9999999 THEN
    RAISE EXCEPTION 'رقم بداية غير صالح' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(last_number, 0) INTO v_current
  FROM public.document_sequences
  WHERE user_id = p_user_id AND doc_type = p_doc_type AND year = p_year
  FOR UPDATE;

  IF p_doc_type = 'delivery_note' THEN
    SELECT COALESCE(MAX(CASE WHEN split_part(delivery_number, '-', 3) ~ '^[0-9]+$'
                             THEN split_part(delivery_number, '-', 3)::int END), 0)
    INTO v_used
    FROM public.delivery_notes
    WHERE user_id = p_user_id
      AND delivery_number LIKE 'DN-' || p_year::text || '-%';
  END IF;

  v_floor := GREATEST(COALESCE(v_current, 0), COALESCE(v_used, 0));

  IF p_next_number <= v_floor THEN
    RAISE EXCEPTION 'لا يمكن البدء من %. آخر رقم مستخدم لهذا النوع في سنة % هو %، اختر رقماً أكبر منه',
      p_next_number, p_year, v_floor USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.document_sequences (user_id, doc_type, year, last_number)
  VALUES (p_user_id, p_doc_type, p_year, p_next_number - 1)
  ON CONFLICT (user_id, doc_type, year)
  DO UPDATE SET last_number = EXCLUDED.last_number, updated_at = now();

  SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.raw_user_meta_data ->> 'full_name')), ''), u.email, v_uid::text)
  INTO v_actor
  FROM auth.users u WHERE u.id = v_uid;

  INSERT INTO public.activity_log (user_id, actor_id, actor_name, action, entity_type, entity_id, entity_label, details)
  VALUES (
    p_user_id, v_uid, COALESCE(v_actor, 'unknown'),
    'document_sequence_start_changed', 'document_sequence',
    p_doc_type || ':' || p_year::text, p_doc_type,
    jsonb_build_object('doc_type', p_doc_type, 'year', p_year,
                       'previous_last_number', v_current, 'new_last_number', p_next_number - 1,
                       'next_number', p_next_number)
  );

  RETURN p_next_number;
END;
$$;

REVOKE ALL ON FUNCTION public.get_document_sequence_next(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_document_sequence_start(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_document_sequence_next(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_document_sequence_start(uuid, text, integer, integer) TO authenticated, service_role;