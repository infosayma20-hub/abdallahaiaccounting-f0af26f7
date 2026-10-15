DO $m$
DECLARE d text;
BEGIN
  d := pg_get_functiondef('public.pos_return_v2(uuid,uuid,jsonb,text,text,text,numeric)'::regprocedure);
  d := replace(d, 'p_return_currency, p_return_exchange_rate, true, trim(p_reason));', 'p_return_currency, p_return_exchange_rate, false, trim(p_reason));');
  EXECUTE d;
END $m$;