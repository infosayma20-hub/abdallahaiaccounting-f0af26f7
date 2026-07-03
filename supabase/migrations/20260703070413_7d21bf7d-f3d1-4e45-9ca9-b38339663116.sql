
DO $$
DECLARE
  v_batch_id text := 'phase2_autolink_' || to_char(now(),'YYYYMMDD_HH24MISS');
  v_created int := 0;
  v_linked int := 0;
BEGIN
  CREATE TEMP TABLE _plan ON COMMIT DROP AS
  WITH targets AS (
    SELECT c.id AS contact_id, c.user_id, c.contact_name, c.contact_type, c.created_at,
           CASE WHEN c.contact_type IN ('عميل','مندوب','عميل ومورد') THEN '1130' ELSE '2110' END AS parent_code
    FROM public.contacts c
    WHERE (c.linked_account_code IS NULL OR c.linked_account_code = '')
      AND c.contact_type IN ('عميل','مورد','مندوب','عميل ومورد')
  ),
  valid AS (
    SELECT t.* FROM targets t
    JOIN public.accounts a ON a.user_id = t.user_id AND a.account_code = t.parent_code
  ),
  base AS (
    SELECT v.*,
      COALESCE((
        SELECT MAX(NULLIF(REGEXP_REPLACE(SUBSTRING(a.account_code FROM LENGTH(v.parent_code)+1),'\D','','g'),'')::int)
        FROM public.accounts a
        WHERE a.user_id = v.user_id AND a.parent_code = v.parent_code
      ), 0) AS max_seq
    FROM valid v
  )
  SELECT contact_id, user_id, contact_name, contact_type, parent_code,
    parent_code || LPAD((max_seq + ROW_NUMBER() OVER (PARTITION BY user_id, parent_code ORDER BY created_at, contact_id))::text, 4, '0') AS new_code
  FROM base;

  IF EXISTS (
    SELECT 1 FROM _plan p
    JOIN public.accounts a ON a.user_id = p.user_id AND a.account_code = p.new_code
  ) THEN
    RAISE EXCEPTION 'Auto-link aborted: code collision detected in batch %', v_batch_id;
  END IF;

  INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, nature, currency, is_active, notes)
  SELECT p.user_id, p.new_code,
    CASE WHEN p.parent_code = '2110' THEN 'ذمة مورد ' || p.contact_name ELSE 'ذمة ' || p.contact_name END,
    CASE WHEN p.parent_code = '2110' THEN 'خصوم' ELSE 'أصول' END,
    p.parent_code,
    CASE WHEN p.parent_code = '2110' THEN 'credit' ELSE 'debit' END,
    'شيكل', true,
    'أُنشئ آلياً (Phase-2 auto-link) — batch ' || v_batch_id
  FROM _plan p;
  GET DIAGNOSTICS v_created = ROW_COUNT;

  UPDATE public.contacts c
     SET linked_account_code = p.new_code
    FROM _plan p
   WHERE c.id = p.contact_id AND (c.linked_account_code IS NULL OR c.linked_account_code = '');
  GET DIAGNOSTICS v_linked = ROW_COUNT;

  INSERT INTO public.finance_integrity_fix_log (fix_batch, entity_type, entity_id, old_value, new_value, reason)
  SELECT v_batch_id, 'contact', p.contact_id,
    jsonb_build_object('linked_account_code', NULL),
    jsonb_build_object(
      'linked_account_code', p.new_code,
      'account_name', CASE WHEN p.parent_code='2110' THEN 'ذمة مورد '||p.contact_name ELSE 'ذمة '||p.contact_name END,
      'parent_code', p.parent_code,
      'contact_name', p.contact_name,
      'contact_type', p.contact_type,
      'user_id', p.user_id
    ),
    'Phase-2 auto-link: created subsidiary account and linked contact'
  FROM _plan p;

  RAISE NOTICE 'Phase-2 auto-link complete. Batch=% accounts_created=% contacts_linked=%',
    v_batch_id, v_created, v_linked;
END $$;
