-- =============================================================
-- ربط زبون الإرسالية بحساب ذمة كامل (مثل الفاتورة)
-- المشكلة: contacts_auto_link_account كان ينشئ الحساب بدون accounts.contact_id،
-- و_resolve_customer_ar_code_v1 يحدد حساب الزبون من accounts.contact_id،
-- فكان ترحيل الفاتورة المحوّلة من الإرسالية يفشل/يرجع للحساب الأب.
-- =============================================================

-- 1) دالة موحّدة: تضمن وجود حساب ذمم قابل للترحيل لجهة الاتصال وتربطه بها
CREATE OR REPLACE FUNCTION public.ensure_contact_account(p_user_id uuid, p_contact_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_contact public.contacts%ROWTYPE;
  v_parent text;
  v_prefix text;
  v_code text;
  v_max int;
BEGIN
  SELECT * INTO v_contact FROM public.contacts
   WHERE id = p_contact_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'جهة الاتصال غير موجودة لهذه الشركة';
  END IF;

  -- اسم فارغ أو '---': لا حساب
  IF NULLIF(BTRIM(COALESCE(v_contact.contact_name,'')), '') IS NULL
     OR BTRIM(v_contact.contact_name) IN ('---','-') THEN
    RETURN NULL;
  END IF;

  -- 1) حساب موجود مربوط بالجهة مباشرة (ورقة نشطة)
  SELECT a.account_code INTO v_code
    FROM public.accounts a
   WHERE a.user_id = p_user_id AND a.contact_id = p_contact_id
     AND COALESCE(a.is_active,true) AND a.account_code IS DISTINCT FROM a.parent_code
   ORDER BY a.account_code LIMIT 1;
  IF v_code IS NOT NULL THEN
    IF v_contact.linked_account_code IS DISTINCT FROM v_code THEN
      UPDATE public.contacts SET linked_account_code = v_code WHERE id = p_contact_id;
    END IF;
    RETURN v_code;
  END IF;

  IF v_contact.contact_type NOT IN ('عميل','مورد','مندوب','عميل ومورد') THEN
    RETURN NULLIF(v_contact.linked_account_code,'');
  END IF;

  -- 2) الحساب المرتبط نصّاً لكن بدون contact_id → تبنّيه إن كان حراً
  IF NULLIF(v_contact.linked_account_code,'') IS NOT NULL THEN
    UPDATE public.accounts a
       SET contact_id = p_contact_id
      FROM public.contacts c
     WHERE c.id = p_contact_id AND c.user_id = p_user_id
       AND a.user_id = p_user_id AND a.account_code = c.linked_account_code
       AND a.contact_id IS NULL AND COALESCE(a.is_active,true)
       AND a.account_code IS DISTINCT FROM a.parent_code;
    IF FOUND THEN
      RETURN v_contact.linked_account_code;
    END IF;
    -- الحساب المرتبط مأخوذ لجهة أخرى أو غير صالح → ننشئ حساباً جديداً
  END IF;

  -- 3) إنشاء حساب ذمة جديد تحت الأب الصحيح
  v_parent := CASE WHEN v_contact.contact_type = 'مورد' THEN '2110' ELSE '1130' END;
  v_prefix := CASE WHEN v_contact.contact_type = 'مورد' THEN 'ذمة مورد ' ELSE 'ذمة ' END;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id = p_user_id AND account_code = v_parent) THEN
    RETURN NULL; -- لا يوجد حساب أب بهذه الشركة
  END IF;

  SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(SUBSTRING(account_code FROM LENGTH(v_parent)+1),'\D','','g'),'')::int), 0)
    INTO v_max
    FROM public.accounts
   WHERE user_id = p_user_id AND parent_code = v_parent;

  v_code := v_parent || LPAD((v_max + 1)::text, 4, '0');
  WHILE EXISTS (SELECT 1 FROM public.accounts WHERE user_id = p_user_id AND account_code = v_code) LOOP
    v_max := v_max + 1;
    v_code := v_parent || LPAD((v_max + 1)::text, 4, '0');
  END LOOP;

  INSERT INTO public.accounts
    (user_id, account_code, account_name, account_type, parent_code, nature, currency, is_active, contact_id, notes)
  VALUES
    (p_user_id, v_code,
     v_prefix || BTRIM(v_contact.contact_name),
     CASE WHEN v_parent = '2110' THEN 'خصوم' ELSE 'أصول' END,
     v_parent,
     CASE WHEN v_parent = '2110' THEN 'credit' ELSE 'debit' END,
     'شيكل', true, p_contact_id,
     'أُنشئ آلياً عند التعرف على الزبون من الإرسالية');

  UPDATE public.contacts SET linked_account_code = v_code WHERE id = p_contact_id;
  RETURN v_code;
END $function$;

GRANT EXECUTE ON FUNCTION public.ensure_contact_account(uuid, uuid) TO authenticated, service_role;

-- 2) مشغل جهات الاتصال: الحساب الآلي يُربط بالجهة (contact_id) من لحظة الإنشاء
CREATE OR REPLACE FUNCTION public.contacts_auto_link_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_parent text;
  v_max int;
  v_new_code text;
  v_prefix text;
BEGIN
  IF NEW.linked_account_code IS NOT NULL AND NEW.linked_account_code <> '' THEN
    RETURN NEW;
  END IF;
  IF NEW.contact_type NOT IN ('عميل','مورد','مندوب','عميل ومورد') THEN
    RETURN NEW;
  END IF;

  -- زبائن الطلبات/نقطة البيع: بيانات جهة فقط بلا حساب بشجرة الحسابات
  IF COALESCE(NEW.created_from_order, false) = true
     OR COALESCE(NEW.source, '') IN ('call_center','whatsapp','e-commerce','instagram','pos','qr_menu') THEN
    RETURN NEW;
  END IF;

  v_parent := CASE WHEN NEW.contact_type IN ('عميل','مندوب','عميل ومورد') THEN '1130' ELSE '2110' END;
  v_prefix := CASE WHEN NEW.contact_type='مورد' THEN 'ذمة مورد ' ELSE 'ذمة ' END;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id = NEW.user_id AND account_code = v_parent) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(SUBSTRING(account_code FROM LENGTH(v_parent)+1),'\D','','g'),'')::int), 0)
    INTO v_max
    FROM public.accounts
   WHERE user_id = NEW.user_id AND parent_code = v_parent;

  v_new_code := v_parent || LPAD((v_max + 1)::text, 4, '0');

  WHILE EXISTS (SELECT 1 FROM public.accounts WHERE user_id = NEW.user_id AND account_code = v_new_code) LOOP
    v_max := v_max + 1;
    v_new_code := v_parent || LPAD((v_max + 1)::text, 4, '0');
  END LOOP;

  INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, currency, is_active, contact_id, notes)
  VALUES (
    NEW.user_id, v_new_code, v_prefix || NEW.contact_name,
    CASE WHEN v_parent='2110' THEN 'خصوم' ELSE 'أصول' END,
    v_parent,
    CASE WHEN v_parent='2110' THEN 'credit' ELSE 'debit' END,
    'شيكل', true, NEW.id,
    'أُنشئ آلياً (trigger auto-link)'
  );

  NEW.linked_account_code := v_new_code;
  RETURN NEW;
END;
$function$;

-- 3) مشغل الإرسالية: بعد ضمان جهة الاتصال، يضمن حساب الذمم ويجعله جاهزاً للترحيل
CREATE OR REPLACE FUNCTION public.delivery_note_ensure_contact()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE v_name text; v_id uuid;
BEGIN
  IF COALESCE(NEW.delivery_type,'external') <> 'external' THEN RETURN NEW; END IF;
  v_name := NULLIF(btrim(COALESCE(NEW.contact_name,'')), '');
  -- جهة مختارة: نوحّد الاسم مع اسم الجهة ونتأكد أنها لنفس الشركة
  IF NEW.contact_id IS NOT NULL THEN
    SELECT contact_name INTO v_name FROM contacts WHERE id = NEW.contact_id AND user_id = NEW.user_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'جهة الاتصال المختارة غير موجودة لهذه الشركة'; END IF;
    NEW.contact_name := v_name;
    PERFORM public.ensure_contact_account(NEW.user_id, NEW.contact_id);
    RETURN NEW;
  END IF;
  IF v_name IS NULL THEN RAISE EXCEPTION 'يجب اختيار العميل (جهة اتصال) للإرسالية الخارجية'; END IF;
  SELECT id INTO v_id FROM contacts
   WHERE user_id = NEW.user_id AND btrim(contact_name) = v_name
   ORDER BY COALESCE(is_archived,false), created_at LIMIT 1;
  IF v_id IS NULL THEN
    INSERT INTO contacts(user_id, contact_name, contact_type)
    VALUES (NEW.user_id, v_name, 'عميل')
    ON CONFLICT (user_id, contact_name) DO UPDATE SET contact_name = EXCLUDED.contact_name
    RETURNING id INTO v_id;
  END IF;
  NEW.contact_id := v_id;
  NEW.contact_name := v_name;
  PERFORM public.ensure_contact_account(NEW.user_id, NEW.contact_id);
  RETURN NEW;
END $function$;

-- 4) ترحيل تكميلي: ربط الحسابات القائمة أحادية الجهة التي بلا contact_id
--    (جهات عملاء/موردين/مندوبين فقط، وحساب نشط ورقي، وبلا مشاركة جهات)
UPDATE public.accounts a
   SET contact_id = c.id,
       notes = COALESCE(a.notes,'') || E'\n[ربط آلي بالجهة 20261014]'
  FROM public.contacts c
 WHERE c.user_id = a.user_id
   AND c.linked_account_code = a.account_code
   AND a.contact_id IS NULL
   AND COALESCE(a.is_active,true)
   AND a.account_code IS DISTINCT FROM a.parent_code
   AND c.contact_type IN ('عميل','مورد','مندوب','عميل ومورد')
   AND NULLIF(BTRIM(COALESCE(c.contact_name,'')),'') IS NOT NULL
   AND (SELECT COUNT(*) FROM public.contacts c2
         WHERE c2.user_id = a.user_id AND c2.linked_account_code = a.account_code) = 1;
