
-- 1) Update trigger to skip auto-account creation for order-sourced customers
CREATE OR REPLACE FUNCTION public.contacts_auto_link_account()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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

  -- NEW: skip order/POS-sourced customers — keep contact info only, no CoA entry
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

-- 2) Cleanup: delete auto-created accounts for order-sourced customers that have NO transactions
WITH target_accounts AS (
  SELECT DISTINCT c.linked_account_code, c.user_id
  FROM public.contacts c
  WHERE c.linked_account_code IS NOT NULL
    AND (
      COALESCE(c.created_from_order, false) = true
      OR COALESCE(c.source, '') IN ('call_center','whatsapp','e-commerce','instagram','pos','qr_menu')
    )
),
unused AS (
  SELECT t.linked_account_code, t.user_id
  FROM target_accounts t
  WHERE NOT EXISTS (
    SELECT 1 FROM public.transactions tr
    WHERE tr.debit_account_code = t.linked_account_code
       OR tr.credit_account_code = t.linked_account_code
  )
),
unlink AS (
  UPDATE public.contacts c
     SET linked_account_code = NULL
   FROM unused u
   WHERE c.linked_account_code = u.linked_account_code
     AND c.user_id = u.user_id
  RETURNING 1
)
DELETE FROM public.accounts a
 USING unused u
 WHERE a.account_code = u.linked_account_code
   AND a.user_id = u.user_id
   AND a.parent_code IN ('1130','2110');
