-- الإصلاح: لا يمكن تعيين accounts.contact_id داخل مشغل BEFORE INSERT على contacts
-- لأن جهة الاتصال لسا غير محفوظة (FK). ننشئ الحساب بدون ربط ثم نربطه بعد حفظ الجهة.

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

  INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, currency, is_active, notes)
  VALUES (
    NEW.user_id, v_new_code, v_prefix || NEW.contact_name,
    CASE WHEN v_parent='2110' THEN 'خصوم' ELSE 'أصول' END,
    v_parent,
    CASE WHEN v_parent='2110' THEN 'credit' ELSE 'debit' END,
    'شيكل', true,
    'أُنشئ آلياً (trigger auto-link)'
  );

  NEW.linked_account_code := v_new_code;
  RETURN NEW;
END;
$function$;

-- بعد حفظ جهة الاتصال: نربط حسابها الذمم بها (يغطي المشغل الآلي وأي ربط مسبق)
CREATE OR REPLACE FUNCTION public.contacts_link_account_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  IF NEW.linked_account_code IS NOT NULL AND NEW.linked_account_code <> '' THEN
    UPDATE public.accounts a
       SET contact_id = NEW.id
      FROM public.contacts c
     WHERE c.id = NEW.id AND c.user_id = NEW.user_id
       AND a.user_id = NEW.user_id AND a.account_code = c.linked_account_code
       AND (a.contact_id IS NULL OR a.contact_id = NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_contacts_link_account_after ON public.contacts;
CREATE TRIGGER trg_contacts_link_account_after
AFTER INSERT ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.contacts_link_account_after();
