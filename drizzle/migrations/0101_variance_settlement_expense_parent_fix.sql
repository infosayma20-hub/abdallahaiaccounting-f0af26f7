DO $$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.settle_pos_shift_variance_v1(uuid,numeric,numeric,text)'::regprocedure);
  d := replace(d, 'ARRAY[''5900'',''5500'',''5000'']', 'ARRAY[''5900'',''5000'']');
  EXECUTE d;
END $$;