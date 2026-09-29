CREATE OR REPLACE FUNCTION public.pos_refresh_exchange_rates(p_owner_id uuid, p_rates jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
  v_rate numeric;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (auth.uid() = p_owner_id OR public.is_team_member(auth.uid(), p_owner_id)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT (public.user_can_access(auth.uid(), 'pos') OR public.user_can_access(auth.uid(), 'currencies')) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  FOR r IN SELECT c.id AS currency_id, (e.value)::text AS rate_txt
           FROM jsonb_each(COALESCE(p_rates, '{}'::jsonb)) e
           JOIN public.currencies c ON c.user_id = p_owner_id AND c.code = e.key
  LOOP
    BEGIN v_rate := r.rate_txt::numeric; EXCEPTION WHEN others THEN CONTINUE; END;
    IF v_rate IS NULL OR v_rate <= 0 OR v_rate > 100000 OR v_rate = 1 THEN CONTINUE; END IF;
    INSERT INTO public.exchange_rates (user_id, currency_id, rate_date, mid_rate, sell_rate, buy_rate, source)
    VALUES (p_owner_id, r.currency_id, CURRENT_DATE, v_rate, v_rate, v_rate, 'pos_auto_refresh')
    ON CONFLICT (user_id, currency_id, rate_date) DO UPDATE
      SET mid_rate = EXCLUDED.mid_rate, sell_rate = EXCLUDED.sell_rate, buy_rate = EXCLUDED.buy_rate
      WHERE public.exchange_rates.source = 'pos_auto_refresh';
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.pos_refresh_exchange_rates(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pos_refresh_exchange_rates(uuid, jsonb) TO authenticated;