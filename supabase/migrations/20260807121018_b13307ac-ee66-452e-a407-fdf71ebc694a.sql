-- 1) card_code on customer_wallets
ALTER TABLE public.customer_wallets ADD COLUMN IF NOT EXISTS card_code text;

CREATE OR REPLACE FUNCTION public.wallet_set_card_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE v_code text; v_try int := 0;
BEGIN
  IF NEW.card_code IS NULL OR NEW.card_code = '' THEN
    LOOP
      v_try := v_try + 1;
      v_code := 'W' || lpad((floor(random() * 900000000)::bigint + 100000000)::text, 9, '0');
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.customer_wallets WHERE card_code = v_code);
      IF v_try > 20 THEN RAISE EXCEPTION 'تعذّر توليد رقم بطاقة فريد'; END IF;
    END LOOP;
    NEW.card_code := v_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_wallet_card_code ON public.customer_wallets;
CREATE TRIGGER trg_wallet_card_code
BEFORE INSERT ON public.customer_wallets
FOR EACH ROW EXECUTE FUNCTION public.wallet_set_card_code();

UPDATE public.customer_wallets
   SET card_code = 'W' || lpad((floor(random() * 900000000)::bigint + 100000000)::text, 9, '0')
 WHERE card_code IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS customer_wallets_card_code_key
  ON public.customer_wallets (card_code);

-- 2) wallet settings
CREATE TABLE IF NOT EXISTS public.wallet_settings (
  user_id uuid PRIMARY KEY,
  min_topup numeric(14,2) NOT NULL DEFAULT 0,
  max_topup numeric(14,2),
  default_max_balance numeric(14,2),
  topup_bonus_percent numeric(6,2) NOT NULL DEFAULT 0,
  allow_pos_topup boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_settings TO authenticated;
GRANT ALL ON public.wallet_settings TO service_role;
ALTER TABLE public.wallet_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wallet_settings_all ON public.wallet_settings;
CREATE POLICY wallet_settings_all ON public.wallet_settings
  FOR ALL TO authenticated
  USING (user_id = public.get_team_owner_id(auth.uid()))
  WITH CHECK (user_id = public.get_team_owner_id(auth.uid()));

-- 3) enforce settings + bonus inside wallet_apply_transaction
CREATE OR REPLACE FUNCTION public.wallet_apply_transaction(
  _contact_id uuid, _txn_type text, _amount numeric,
  _branch_id uuid DEFAULT NULL::uuid, _pos_order_id uuid DEFAULT NULL::uuid,
  _payment_method text DEFAULT NULL::text, _reference text DEFAULT NULL::text,
  _notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_owner uuid;
  v_wallet public.customer_wallets%ROWTYPE;
  v_dir smallint;
  v_new_balance numeric(14,2);
  v_txn_id uuid;
  v_cfg public.wallet_settings%ROWTYPE;
  v_cap numeric(14,2);
  v_bonus numeric(14,2) := 0;
  v_bonus_txn uuid;
BEGIN
  IF _txn_type NOT IN ('topup','spend','refund','adjustment') THEN
    RAISE EXCEPTION 'نوع حركة غير معروف: %', _txn_type;
  END IF;
  IF _amount IS NULL OR _amount = 0 THEN
    RAISE EXCEPTION 'المبلغ مطلوب ويجب أن يكون أكبر من صفر';
  END IF;

  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد صاحب الحساب';
  END IF;

  SELECT * INTO v_cfg FROM public.wallet_settings WHERE user_id = v_owner;

  PERFORM public.wallet_get_or_create(_contact_id);

  SELECT * INTO v_wallet FROM public.customer_wallets
   WHERE user_id = v_owner AND contact_id = _contact_id
   FOR UPDATE;

  IF v_wallet.is_frozen THEN
    RAISE EXCEPTION 'محفظة الزبون مجمّدة، لا يمكن تنفيذ حركات عليها';
  END IF;

  IF _txn_type = 'topup' THEN
    IF v_cfg.min_topup IS NOT NULL AND abs(_amount) < v_cfg.min_topup THEN
      RAISE EXCEPTION 'أقل مبلغ شحن مسموح هو %', v_cfg.min_topup;
    END IF;
    IF v_cfg.max_topup IS NOT NULL AND abs(_amount) > v_cfg.max_topup THEN
      RAISE EXCEPTION 'أعلى مبلغ شحن مسموح هو %', v_cfg.max_topup;
    END IF;
  END IF;

  IF _txn_type = 'adjustment' THEN
    v_dir := CASE WHEN _amount < 0 THEN -1 ELSE 1 END;
  ELSIF _txn_type = 'spend' THEN
    v_dir := -1;
  ELSE
    v_dir := 1;
  END IF;

  v_new_balance := v_wallet.balance + (v_dir * abs(_amount));

  IF v_new_balance < 0 THEN
    RAISE EXCEPTION 'الرصيد غير كافٍ. الرصيد الحالي %، المطلوب %', v_wallet.balance, abs(_amount);
  END IF;

  v_cap := COALESCE(v_wallet.max_balance, v_cfg.default_max_balance);
  IF v_cap IS NOT NULL AND v_new_balance > v_cap THEN
    RAISE EXCEPTION 'تجاوز الحد الأقصى المسموح للمحفظة (%)', v_cap;
  END IF;

  UPDATE public.customer_wallets
     SET balance = v_new_balance, updated_at = now()
   WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions(
    user_id, wallet_id, contact_id, txn_type, amount, direction, balance_after,
    currency, branch_id, pos_order_id, payment_method, reference, notes, performed_by
  ) VALUES (
    v_owner, v_wallet.id, _contact_id, _txn_type, abs(_amount), v_dir, v_new_balance,
    v_wallet.currency, _branch_id, _pos_order_id, _payment_method, _reference, _notes, auth.uid()
  ) RETURNING id INTO v_txn_id;

  -- bonus on top-up
  IF _txn_type = 'topup' AND COALESCE(v_cfg.topup_bonus_percent, 0) > 0 THEN
    v_bonus := round(abs(_amount) * v_cfg.topup_bonus_percent / 100.0, 2);
    IF v_bonus > 0 THEN
      v_new_balance := v_new_balance + v_bonus;
      IF v_cap IS NOT NULL AND v_new_balance > v_cap THEN
        v_bonus := 0;
        v_new_balance := v_new_balance - round(abs(_amount) * v_cfg.topup_bonus_percent / 100.0, 2);
      ELSE
        UPDATE public.customer_wallets
           SET balance = v_new_balance, updated_at = now()
         WHERE id = v_wallet.id;

        INSERT INTO public.wallet_transactions(
          user_id, wallet_id, contact_id, txn_type, amount, direction, balance_after,
          currency, branch_id, pos_order_id, payment_method, reference, notes, performed_by
        ) VALUES (
          v_owner, v_wallet.id, _contact_id, 'topup', v_bonus, 1, v_new_balance,
          v_wallet.currency, _branch_id, _pos_order_id, NULL, 'BONUS',
          'مكافأة شحن ' || v_cfg.topup_bonus_percent || '%', auth.uid()
        ) RETURNING id INTO v_bonus_txn;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'wallet_id', v_wallet.id,
    'transaction_id', v_txn_id,
    'bonus', v_bonus,
    'balance', v_new_balance
  );
END;
$function$;

-- 4) lookup by card code / phone / name
CREATE OR REPLACE FUNCTION public.wallet_lookup(_q text)
RETURNS TABLE(
  wallet_id uuid, contact_id uuid, contact_name text, phone text,
  card_code text, balance numeric, currency text, is_frozen boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT w.id, w.contact_id, c.contact_name, c.phone, w.card_code,
         w.balance, w.currency, w.is_frozen
    FROM public.customer_wallets w
    JOIN public.contacts c ON c.id = w.contact_id
   WHERE w.user_id = public.get_team_owner_id(auth.uid())
     AND (
       upper(trim(_q)) = upper(w.card_code)
       OR c.phone ILIKE '%' || trim(_q) || '%'
       OR c.contact_name ILIKE '%' || trim(_q) || '%'
     )
   ORDER BY (upper(trim(_q)) = upper(w.card_code)) DESC, c.contact_name
   LIMIT 10;
$$;

GRANT EXECUTE ON FUNCTION public.wallet_lookup(text) TO authenticated;