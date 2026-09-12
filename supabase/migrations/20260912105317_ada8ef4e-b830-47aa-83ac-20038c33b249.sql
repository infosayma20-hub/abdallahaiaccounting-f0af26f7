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

  SELECT CASE
    WHEN p_invoice_type = 'sale' THEN COALESCE(NULLIF(trim(invoice_prefix), ''), 'INV')
    ELSE COALESCE(NULLIF(trim(purchase_order_prefix), ''), 'PO')
  END
  INTO v_prefix
  FROM public.company_settings
  WHERE user_id = p_user_id
  LIMIT 1;

  v_prefix := COALESCE(v_prefix, CASE WHEN p_invoice_type = 'sale' THEN 'INV' ELSE 'PO' END);

  SELECT last_number
  INTO v_current
  FROM public.invoice_sequences
  WHERE user_id = p_user_id
    AND invoice_type = p_invoice_type
    AND year = p_year
    AND prefix = v_prefix;

  IF v_current IS NULL THEN
    SELECT COALESCE(MAX(parts[3]::integer), 0)
    INTO v_current
    FROM public.invoices i
    CROSS JOIN LATERAL regexp_match(i.invoice_number, '^(.*)-([0-9]{4})-([0-9]+)$') AS parts
    WHERE i.user_id = p_user_id
      AND i.invoice_type = p_invoice_type
      AND parts IS NOT NULL
      AND parts[1] = v_prefix
      AND parts[2] = p_year::text;
  END IF;

  v_candidate := COALESCE(v_current, 0) + 1;
  WHILE EXISTS (
    SELECT 1 FROM public.invoices
    WHERE user_id = p_user_id
      AND invoice_type = p_invoice_type
      AND invoice_number = v_prefix || '-' || p_year::text || '-' || lpad(v_candidate::text, 4, '0')
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

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'غير مصرح' USING ERRCODE = '42501';
  END IF;

  IF NOT (v_uid = p_user_id
          OR public.has_role(v_uid, 'admin')
          OR public.has_role(v_uid, 'super_admin')) THEN
    RAISE EXCEPTION 'تغيير ترقيم الفواتير متاح لصاحب المؤسسة أو مدير النظام فقط'
      USING ERRCODE = '42501';
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

  SELECT CASE
    WHEN p_invoice_type = 'sale' THEN COALESCE(NULLIF(trim(invoice_prefix), ''), 'INV')
    ELSE COALESCE(NULLIF(trim(purchase_order_prefix), ''), 'PO')
  END
  INTO v_prefix
  FROM public.company_settings
  WHERE user_id = p_user_id
  LIMIT 1;

  v_prefix := COALESCE(v_prefix, CASE WHEN p_invoice_type = 'sale' THEN 'INV' ELSE 'PO' END);
  v_candidate := v_prefix || '-' || p_year::text || '-' || lpad(p_next_number::text, 4, '0');

  INSERT INTO public.invoice_sequences (user_id, invoice_type, year, prefix, last_number, updated_at)
  VALUES (p_user_id, p_invoice_type, p_year, v_prefix, 0, now())
  ON CONFLICT (user_id, invoice_type, year, prefix) DO NOTHING;

  SELECT last_number
  INTO v_previous
  FROM public.invoice_sequences
  WHERE user_id = p_user_id
    AND invoice_type = p_invoice_type
    AND year = p_year
    AND prefix = v_prefix
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE user_id = p_user_id
      AND invoice_type = p_invoice_type
      AND invoice_number = v_candidate
  ) THEN
    RAISE EXCEPTION 'رقم الفاتورة % مستخدم مسبقاً، اختر رقماً فارغاً', v_candidate
      USING ERRCODE = '23505';
  END IF;

  UPDATE public.invoice_sequences
  SET last_number = p_next_number - 1,
      updated_at = now()
  WHERE user_id = p_user_id
    AND invoice_type = p_invoice_type
    AND year = p_year
    AND prefix = v_prefix;

  SELECT COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.raw_user_meta_data ->> 'full_name')), ''), u.email, v_uid::text)
  INTO v_actor
  FROM auth.users u WHERE u.id = v_uid;

  INSERT INTO public.activity_log (user_id, actor_id, actor_name, action, entity_type, entity_id, entity_label, details)
  VALUES (
    p_user_id, v_uid, COALESCE(v_actor, 'unknown'),
    'invoice_sequence_start_changed', 'invoice_sequence',
    p_invoice_type || ':' || p_year::text || ':' || v_prefix,
    CASE WHEN p_invoice_type = 'sale' THEN 'فواتير المبيعات' ELSE 'فواتير المشتريات' END,
    jsonb_build_object(
      'invoice_type', p_invoice_type,
      'year', p_year,
      'prefix', v_prefix,
      'previous_last_number', v_previous,
      'new_last_number', p_next_number - 1,
      'next_number', p_next_number,
      'candidate', v_candidate
    )
  );

  RETURN p_next_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_next integer;
  v_prefix text;
  v_year integer;
  v_offset integer := 0;
  v_max_existing integer := 0;
  v_current integer := 0;
  v_candidate text;
BEGIN
  v_prefix := CASE NEW.invoice_type
    WHEN 'sale' THEN 'INV'
    WHEN 'sales' THEN 'INV'
    WHEN 'purchase' THEN 'PO'
    WHEN 'credit_note' THEN 'CN'
    WHEN 'debit_note' THEN 'DN'
    WHEN 'sales_return' THEN 'SR'
    WHEN 'purchase_return' THEN 'PR'
    ELSE 'DOC'
  END;

  IF NEW.invoice_type IN ('sale', 'sales', 'purchase') THEN
    SELECT CASE
      WHEN NEW.invoice_type IN ('sale', 'sales') THEN COALESCE(NULLIF(trim(invoice_prefix), ''), v_prefix)
      WHEN NEW.invoice_type = 'purchase' THEN COALESCE(NULLIF(trim(purchase_order_prefix), ''), v_prefix)
      ELSE v_prefix
    END
    INTO v_prefix
    FROM public.company_settings
    WHERE user_id = NEW.user_id
    LIMIT 1;
    v_prefix := COALESCE(NULLIF(trim(v_prefix), ''), CASE WHEN NEW.invoice_type = 'purchase' THEN 'PO' ELSE 'INV' END);
  END IF;

  v_year := EXTRACT(YEAR FROM COALESCE(NEW.invoice_date, NEW.created_at::date, CURRENT_DATE))::integer;

  IF NEW.invoice_type IN ('sale', 'sales') THEN
    SELECT COALESCE(invoice_number_offset, 0)
    INTO v_offset
    FROM public.companies
    WHERE owner_id = NEW.user_id
    LIMIT 1;
    v_offset := COALESCE(v_offset, 0);
  END IF;

  SELECT COALESCE(MAX(parts[3]::integer), 0)
  INTO v_max_existing
  FROM public.invoices i
  CROSS JOIN LATERAL regexp_match(i.invoice_number, '^(.*)-([0-9]{4})-([0-9]+)$') AS parts
  WHERE i.user_id = NEW.user_id
    AND i.invoice_type = NEW.invoice_type
    AND i.invoice_number IS NOT NULL
    AND i.invoice_number <> ''
    AND parts IS NOT NULL
    AND parts[1] = v_prefix
    AND parts[2] = v_year::text;

  INSERT INTO public.invoice_sequences (user_id, invoice_type, year, prefix, last_number, updated_at)
  VALUES (NEW.user_id, NEW.invoice_type, v_year, v_prefix, GREATEST(COALESCE(v_offset, 0), COALESCE(v_max_existing, 0)), now())
  ON CONFLICT (user_id, invoice_type, year, prefix) DO NOTHING;

  SELECT last_number
  INTO v_current
  FROM public.invoice_sequences
  WHERE user_id = NEW.user_id
    AND invoice_type = NEW.invoice_type
    AND year = v_year
    AND prefix = v_prefix
  FOR UPDATE;

  LOOP
    v_next := COALESCE(v_current, 0) + 1;
    v_candidate := v_prefix || '-' || v_year::text || '-' || lpad(v_next::text, 4, '0');

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.invoices
      WHERE user_id = NEW.user_id
        AND invoice_type = NEW.invoice_type
        AND invoice_number = v_candidate
    );

    v_current := v_next;
  END LOOP;

  UPDATE public.invoice_sequences
  SET last_number = v_next,
      updated_at = now()
  WHERE user_id = NEW.user_id
    AND invoice_type = NEW.invoice_type
    AND year = v_year
    AND prefix = v_prefix;

  NEW.invoice_number := v_candidate;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.get_invoice_sequence_next(uuid, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_invoice_sequence_start(uuid, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_invoice_sequence_next(uuid, text, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_invoice_sequence_start(uuid, text, integer, integer) TO authenticated, service_role;