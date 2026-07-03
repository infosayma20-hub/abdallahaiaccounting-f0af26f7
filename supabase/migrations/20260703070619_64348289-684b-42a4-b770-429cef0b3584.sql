
-- =====================================================================
-- Phase 3 · Fix violating parent-linked contacts + install auto-link trigger
-- =====================================================================

DO $$
DECLARE
  v_batch text := 'phase3_reparent_' || to_char(now(),'YYYYMMDD_HH24MISS');
  v_created int := 0;
  v_relinked int := 0;
  v_moved_debit int := 0;
  v_moved_credit int := 0;
BEGIN
  -- Plan: one new sub-account per violating contact
  CREATE TEMP TABLE _plan3 ON COMMIT DROP AS
  WITH violating AS (
    SELECT c.id AS contact_id, c.user_id, c.contact_name, c.contact_type, c.linked_account_code AS parent_code
    FROM public.contacts c
    WHERE c.linked_account_code IN ('1130','2110')
  ),
  base AS (
    SELECT v.*,
      COALESCE((
        SELECT MAX(NULLIF(REGEXP_REPLACE(SUBSTRING(a.account_code FROM LENGTH(v.parent_code)+1),'\D','','g'),'')::int)
        FROM public.accounts a
        WHERE a.user_id = v.user_id AND a.parent_code = v.parent_code
      ), 0) AS max_seq
    FROM violating v
  )
  SELECT contact_id, user_id, contact_name, contact_type, parent_code,
    parent_code || LPAD((max_seq + ROW_NUMBER() OVER (PARTITION BY user_id, parent_code ORDER BY contact_id))::text, 4, '0') AS new_code
  FROM base;

  IF EXISTS (SELECT 1 FROM _plan3 p JOIN public.accounts a ON a.user_id=p.user_id AND a.account_code=p.new_code) THEN
    RAISE EXCEPTION 'Phase-3 aborted: code collision in batch %', v_batch;
  END IF;

  -- Create new sub-accounts
  INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, currency, is_active, notes)
  SELECT p.user_id, p.new_code,
    CASE WHEN p.parent_code='2110' THEN 'ذمة مورد '||p.contact_name ELSE 'ذمة '||p.contact_name END,
    CASE WHEN p.parent_code='2110' THEN 'خصوم' ELSE 'أصول' END,
    p.parent_code,
    CASE WHEN p.parent_code='2110' THEN 'credit' ELSE 'debit' END,
    'شيكل', true,
    'أُنشئ آلياً (Phase-3 reparent) — batch ' || v_batch
  FROM _plan3 p;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  -- Snapshot txns about to be moved (for audit)
  CREATE TEMP TABLE _moved_txns ON COMMIT DROP AS
  SELECT t.id AS txn_id, t.user_id, t.contact_id, t.debit_account_code, t.credit_account_code,
         t.amount, p.parent_code, p.new_code
  FROM public.transactions t
  JOIN _plan3 p ON p.contact_id = t.contact_id AND p.user_id = t.user_id
  WHERE t.is_deleted IS NOT TRUE
    AND (t.debit_account_code = p.parent_code OR t.credit_account_code = p.parent_code);

  -- Move debit side
  UPDATE public.transactions t
     SET debit_account_code = p.new_code, updated_at = now()
    FROM _plan3 p
   WHERE t.contact_id = p.contact_id
     AND t.user_id = p.user_id
     AND t.debit_account_code = p.parent_code
     AND t.is_deleted IS NOT TRUE;
  GET DIAGNOSTICS v_moved_debit = ROW_COUNT;

  -- Move credit side
  UPDATE public.transactions t
     SET credit_account_code = p.new_code, updated_at = now()
    FROM _plan3 p
   WHERE t.contact_id = p.contact_id
     AND t.user_id = p.user_id
     AND t.credit_account_code = p.parent_code
     AND t.is_deleted IS NOT TRUE;
  GET DIAGNOSTICS v_moved_credit = ROW_COUNT;

  -- Re-link contacts
  UPDATE public.contacts c
     SET linked_account_code = p.new_code, updated_at = now()
    FROM _plan3 p
   WHERE c.id = p.contact_id;
  GET DIAGNOSTICS v_relinked = ROW_COUNT;

  -- Audit
  INSERT INTO public.finance_integrity_fix_log (fix_batch, entity_type, entity_id, old_value, new_value, reason)
  SELECT v_batch, 'contact', p.contact_id,
    jsonb_build_object('linked_account_code', p.parent_code, 'contact_name', p.contact_name),
    jsonb_build_object('linked_account_code', p.new_code, 'contact_name', p.contact_name,
                       'moved_txn_ids', COALESCE((SELECT jsonb_agg(m.txn_id) FROM _moved_txns m WHERE m.contact_id = p.contact_id), '[]'::jsonb)),
    'Phase-3: reparented contact from parent to new subsidiary + moved its own transactions'
  FROM _plan3 p;

  RAISE NOTICE 'Phase-3 done: batch=% new_accounts=% relinked=% moved_debit=% moved_credit=%',
    v_batch, v_created, v_relinked, v_moved_debit, v_moved_credit;
END $$;

-- =====================================================================
-- Auto-link trigger for future contacts
-- =====================================================================

CREATE OR REPLACE FUNCTION public.contacts_auto_link_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_parent text;
  v_max int;
  v_new_code text;
  v_prefix text;
BEGIN
  -- Only act when link missing and type is one we manage
  IF NEW.linked_account_code IS NOT NULL AND NEW.linked_account_code <> '' THEN
    RETURN NEW;
  END IF;
  IF NEW.contact_type NOT IN ('عميل','مورد','مندوب','عميل ومورد') THEN
    RETURN NEW;
  END IF;

  v_parent := CASE WHEN NEW.contact_type IN ('عميل','مندوب','عميل ومورد') THEN '1130' ELSE '2110' END;
  v_prefix := CASE WHEN NEW.contact_type='مورد' THEN 'ذمة مورد ' ELSE 'ذمة ' END;

  -- Require parent to exist for this tenant
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id = NEW.user_id AND account_code = v_parent) THEN
    RETURN NEW; -- silently skip; tenant hasn't provisioned CoA
  END IF;

  SELECT COALESCE(MAX(NULLIF(REGEXP_REPLACE(SUBSTRING(account_code FROM LENGTH(v_parent)+1),'\D','','g'),'')::int), 0)
    INTO v_max
    FROM public.accounts
   WHERE user_id = NEW.user_id AND parent_code = v_parent;

  v_new_code := v_parent || LPAD((v_max + 1)::text, 4, '0');

  -- Retry loop to avoid race collisions
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
$fn$;

DROP TRIGGER IF EXISTS trg_contacts_auto_link ON public.contacts;
CREATE TRIGGER trg_contacts_auto_link
BEFORE INSERT ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.contacts_auto_link_account();
