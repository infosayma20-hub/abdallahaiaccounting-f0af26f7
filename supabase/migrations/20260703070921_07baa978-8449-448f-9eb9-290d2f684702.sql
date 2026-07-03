
DO $$
DECLARE
  v_batch text := 'phase4_pos_sync_' || to_char(now(),'YYYYMMDD_HH24MISS');
  v_inserted int := 0;
BEGIN
  CREATE TEMP TABLE _pos_new ON COMMIT DROP AS
  WITH cleaned AS (
    SELECT DISTINCT ON (pc.user_id, regexp_replace(trim(pc.name),'\s+',' ','g'))
      pc.user_id,
      regexp_replace(trim(pc.name),'\s+',' ','g') AS clean_name,
      pc.whatsapp,
      pc.email
    FROM public.pos_customers pc
    WHERE pc.name IS NOT NULL
      AND trim(pc.name) <> ''
      AND trim(pc.name) NOT IN ('تبرع','تبرع ','test','Test')
      AND trim(pc.name) !~ '^[\d\s\+\-]+$'    -- exclude pure numeric junk
      AND NOT EXISTS (
        SELECT 1 FROM public.contacts c
        WHERE c.user_id = pc.user_id
          AND regexp_replace(trim(c.contact_name),'\s+',' ','g') = regexp_replace(trim(pc.name),'\s+',' ','g')
      )
    ORDER BY pc.user_id, regexp_replace(trim(pc.name),'\s+',' ','g'),
             (CASE WHEN pc.whatsapp IS NOT NULL AND pc.whatsapp<>'' THEN 0 ELSE 1 END),
             pc.created_at
  )
  SELECT * FROM cleaned;

  -- Insert into contacts; trigger will auto-create sub-accounts
  WITH ins AS (
    INSERT INTO public.contacts (user_id, contact_name, contact_type, phone, email)
    SELECT user_id, clean_name, 'عميل',
           NULLIF(whatsapp,''), NULLIF(email,'')
    FROM _pos_new
    RETURNING id, user_id, contact_name, linked_account_code
  )
  INSERT INTO public.finance_integrity_fix_log (fix_batch, entity_type, entity_id, old_value, new_value, reason)
  SELECT v_batch, 'contact', id,
    jsonb_build_object('source','pos_customers','existed_in_contacts', false),
    jsonb_build_object('contact_name', contact_name, 'linked_account_code', linked_account_code, 'user_id', user_id),
    'Phase-4: synced POS customer into unified contacts registry'
  FROM ins;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RAISE NOTICE 'Phase-4 POS sync done: batch=% inserted=%', v_batch, v_inserted;
END $$;
