\set ON_ERROR_STOP on
BEGIN;
DO $$ DECLARE o uuid:='0b08eba6-c81a-4f6c-b371-e6e324016e73'; c uuid; result jsonb; dup jsonb; n integer; item jsonb:='[{"description":"اختبار مردود خدمة متراجع","quantity":2,"unit_price":10,"discount":0,"tax_rate":0,"tax_category":"zero"}]'; doc jsonb; BEGIN
 PERFORM set_config('request.jwt.claim.sub',o::text,true);
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',o,'role','authenticated')::text,true);
 SELECT id INTO c FROM contacts WHERE user_id=o AND contact_type='عميل' AND COALESCE(is_active,true) AND NOT COALESCE(is_archived,false) ORDER BY id LIMIT 1;
 doc:=jsonb_build_object('return_type','sales','return_date','2026-10-16','contact_id',c,'reason','اختبار متراجع','refund_method','credit','currency','شيكل');
 result:=save_return_command_v1(o,'unified-returns-test-sales',doc,item,NULL,NULL,true);
 IF (result->>'success')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'save failed'; END IF;
 SELECT count(*) INTO n FROM transactions WHERE return_id=(result->>'id')::uuid AND amount=20 AND NOT COALESCE(is_deleted,false);
 IF n<>1 THEN RAISE EXCEPTION 'unexpected sales GL count %',n; END IF;
 dup:=save_return_command_v1(o,'unified-returns-test-sales',doc,item,NULL,NULL,true);
 IF dup->>'id' IS DISTINCT FROM result->>'id' OR (dup->>'duplicate')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'idempotency failed'; END IF;
 SELECT id INTO c FROM contacts WHERE user_id=o AND contact_type='مورد' AND COALESCE(is_active,true) AND NOT COALESCE(is_archived,false) ORDER BY id LIMIT 1;
 doc:=jsonb_set(jsonb_set(doc,'{return_type}','"purchase"'),'{contact_id}',to_jsonb(c));
 result:=save_return_command_v1(o,'unified-returns-test-purchase',doc,item,NULL,NULL,true);
 SELECT count(*) INTO n FROM transactions WHERE return_id=(result->>'id')::uuid AND amount=20 AND NOT COALESCE(is_deleted,false);
 IF n<>1 THEN RAISE EXCEPTION 'unexpected purchase GL count %',n; END IF;
 IF returns_can_access_v1('038d62bb-8af9-4ed2-a6a8-2ef04540c44b'::uuid) THEN RAISE EXCEPTION 'cross tenant leak'; END IF;
 RAISE NOTICE 'PASS: sales/purchase free returns, exact 20 ILS GL, idempotency, tenant isolation';
END $$;
ROLLBACK;
