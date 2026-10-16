CREATE TABLE public.account_balances_daily (
  user_id uuid NOT NULL,
  account_code text NOT NULL,
  currency text NOT NULL DEFAULT '',
  day date NOT NULL,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, account_code, currency, day)
);
GRANT SELECT ON public.account_balances_daily TO authenticated;
GRANT ALL ON public.account_balances_daily TO service_role;
ALTER TABLE public.account_balances_daily ENABLE ROW LEVEL SECURITY;
-- نفس سياسة قراءة transactions تمامًا
CREATE POLICY "abd_select_team" ON public.account_balances_daily FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR user_id = (SELECT public.get_team_owner_id()));

CREATE TABLE public.account_balances_drift_log (
  id bigserial PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  account_code text,
  currency text,
  expected_debit numeric,
  expected_credit numeric,
  stored_debit numeric,
  stored_credit numeric
);
GRANT SELECT ON public.account_balances_drift_log TO authenticated;
GRANT ALL ON public.account_balances_drift_log TO service_role;
ALTER TABLE public.account_balances_drift_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "abd_drift_super" ON public.account_balances_drift_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'));

CREATE OR REPLACE FUNCTION public._abd_apply(p_user uuid, p_dr text, p_cr text, p_cur text, p_day date, p_amt numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_user IS NULL OR p_day IS NULL OR coalesce(p_amt,0) = 0 THEN RETURN; END IF;
  IF p_dr IS NOT NULL AND p_dr <> '' THEN
    INSERT INTO public.account_balances_daily AS b (user_id, account_code, currency, day, debit, credit)
    VALUES (p_user, p_dr, coalesce(p_cur,''), p_day, p_amt, 0)
    ON CONFLICT (user_id, account_code, currency, day) DO UPDATE SET debit = b.debit + EXCLUDED.debit;
  END IF;
  IF p_cr IS NOT NULL AND p_cr <> '' THEN
    INSERT INTO public.account_balances_daily AS b (user_id, account_code, currency, day, debit, credit)
    VALUES (p_user, p_cr, coalesce(p_cur,''), p_day, 0, p_amt)
    ON CONFLICT (user_id, account_code, currency, day) DO UPDATE SET credit = b.credit + EXCLUDED.credit;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public._abd_apply(uuid,text,text,text,date,numeric) FROM public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.tg_account_balances_daily()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND coalesce(OLD.is_deleted,false) = false THEN
    PERFORM public._abd_apply(OLD.user_id, OLD.debit_account_code, OLD.credit_account_code, OLD.currency, OLD.transaction_date, -coalesce(OLD.amount,0));
  END IF;
  IF TG_OP IN ('INSERT','UPDATE') AND coalesce(NEW.is_deleted,false) = false THEN
    PERFORM public._abd_apply(NEW.user_id, NEW.debit_account_code, NEW.credit_account_code, NEW.currency, NEW.transaction_date, coalesce(NEW.amount,0));
  END IF;
  RETURN NULL;
END $$;

INSERT INTO public.account_balances_daily (user_id, account_code, currency, day, debit, credit)
SELECT user_id, code, coalesce(currency,''), transaction_date, sum(dr), sum(cr)
FROM (
  SELECT user_id, debit_account_code code, currency, transaction_date, coalesce(amount,0) dr, 0::numeric cr
  FROM public.transactions WHERE coalesce(is_deleted,false)=false AND debit_account_code <> '' AND user_id IS NOT NULL AND transaction_date IS NOT NULL
  UNION ALL
  SELECT user_id, credit_account_code, currency, transaction_date, 0, coalesce(amount,0)
  FROM public.transactions WHERE coalesce(is_deleted,false)=false AND credit_account_code <> '' AND user_id IS NOT NULL AND transaction_date IS NOT NULL
) s GROUP BY 1,2,3,4;

CREATE TRIGGER trg_account_balances_daily
AFTER INSERT OR UPDATE OF amount, debit_account_code, credit_account_code, currency, transaction_date, is_deleted, user_id OR DELETE
ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.tg_account_balances_daily();

CREATE OR REPLACE FUNCTION public.check_account_balances_daily()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  WITH raw AS (
    SELECT user_id, code, coalesce(currency,'') cur, sum(dr) dr, sum(cr) cr FROM (
      SELECT user_id, debit_account_code code, currency, coalesce(amount,0) dr, 0::numeric cr FROM public.transactions
       WHERE coalesce(is_deleted,false)=false AND debit_account_code <> '' AND user_id IS NOT NULL AND transaction_date IS NOT NULL
      UNION ALL
      SELECT user_id, credit_account_code, currency, 0, coalesce(amount,0) FROM public.transactions
       WHERE coalesce(is_deleted,false)=false AND credit_account_code <> '' AND user_id IS NOT NULL AND transaction_date IS NOT NULL
    ) s GROUP BY 1,2,3),
  st AS (SELECT user_id, account_code code, currency cur, sum(debit) dr, sum(credit) cr FROM public.account_balances_daily GROUP BY 1,2,3),
  diff AS (
    SELECT coalesce(r.user_id,s.user_id) u, coalesce(r.code,s.code) c, coalesce(r.cur,s.cur) cu,
           coalesce(r.dr,0) edr, coalesce(r.cr,0) ecr, coalesce(s.dr,0) sdr, coalesce(s.cr,0) scr
    FROM raw r FULL JOIN st s ON s.user_id=r.user_id AND s.code=r.code AND s.cur=r.cur
    WHERE abs(coalesce(r.dr,0)-coalesce(s.dr,0)) > 0.001 OR abs(coalesce(r.cr,0)-coalesce(s.cr,0)) > 0.001)
  INSERT INTO public.account_balances_drift_log (user_id, account_code, currency, expected_debit, expected_credit, stored_debit, stored_credit)
  SELECT u,c,cu,edr,ecr,sdr,scr FROM diff;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    INSERT INTO public.account_balances_drift_log (account_code) VALUES ('__OK__');
  END IF;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.check_account_balances_daily() FROM public, anon, authenticated;

SELECT cron.schedule('account-balances-daily-check', '30 0 * * *', $$SELECT public.check_account_balances_daily()$$);