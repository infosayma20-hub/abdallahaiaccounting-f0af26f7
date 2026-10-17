DO $$ DECLARE d text; BEGIN
 d:=pg_get_functiondef('public.sync_pos_tax_ledger(uuid)'::regprocedure);
 IF position('SELECT name, tax_number' in d)=0 THEN RAISE EXCEPTION 'Unexpected tax contact lookup'; END IF;
 d:=replace(d,'SELECT name, tax_number','SELECT contact_name, tax_number');
 EXECUTE d;
END $$;