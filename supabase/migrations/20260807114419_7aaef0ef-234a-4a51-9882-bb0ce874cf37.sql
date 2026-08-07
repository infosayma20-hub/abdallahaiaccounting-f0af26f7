-- ===== محافظ العملاء =====
CREATE TABLE public.customer_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  is_frozen boolean NOT NULL DEFAULT false,
  max_balance numeric(14,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_wallets_unique_contact UNIQUE (user_id, contact_id),
  CONSTRAINT customer_wallets_balance_non_negative CHECK (balance >= 0)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_wallets TO authenticated;
GRANT ALL ON public.customer_wallets TO service_role;

ALTER TABLE public.customer_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team can view customer wallets" ON public.customer_wallets
  FOR SELECT TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), user_id));

CREATE POLICY "team can insert customer wallets" ON public.customer_wallets
  FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member((SELECT auth.uid()), user_id));

CREATE POLICY "team can update customer wallets" ON public.customer_wallets
  FOR UPDATE TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), user_id))
  WITH CHECK (public.is_team_member((SELECT auth.uid()), user_id));

CREATE POLICY "team can delete customer wallets" ON public.customer_wallets
  FOR DELETE TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), user_id));

CREATE INDEX idx_customer_wallets_user ON public.customer_wallets(user_id);
CREATE INDEX idx_customer_wallets_contact ON public.customer_wallets(contact_id);

CREATE TRIGGER trg_customer_wallets_updated_at
  BEFORE UPDATE ON public.customer_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ===== حركات المحفظة =====
CREATE TABLE public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  wallet_id uuid NOT NULL REFERENCES public.customer_wallets(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL,
  txn_type text NOT NULL CHECK (txn_type IN ('topup','spend','refund','adjustment')),
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  direction smallint NOT NULL CHECK (direction IN (-1, 1)),
  balance_after numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'ILS',
  branch_id uuid,
  pos_order_id uuid,
  transaction_id uuid,
  payment_method text,
  reference text,
  notes text,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.wallet_transactions TO authenticated;
GRANT ALL ON public.wallet_transactions TO service_role;

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team can view wallet transactions" ON public.wallet_transactions
  FOR SELECT TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), user_id));

CREATE POLICY "team can insert wallet transactions" ON public.wallet_transactions
  FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member((SELECT auth.uid()), user_id));

CREATE INDEX idx_wallet_txn_wallet ON public.wallet_transactions(wallet_id, created_at DESC);
CREATE INDEX idx_wallet_txn_user_date ON public.wallet_transactions(user_id, created_at DESC);
CREATE INDEX idx_wallet_txn_contact ON public.wallet_transactions(contact_id);
CREATE UNIQUE INDEX uq_wallet_txn_pos_order_spend
  ON public.wallet_transactions(pos_order_id, txn_type)
  WHERE pos_order_id IS NOT NULL;

-- ===== إنشاء/جلب محفظة الزبون =====
CREATE OR REPLACE FUNCTION public.wallet_get_or_create(_contact_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_wallet uuid;
BEGIN
  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'لا يمكن تحديد صاحب الحساب';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = _contact_id AND c.user_id = v_owner) THEN
    RAISE EXCEPTION 'الزبون غير موجود ضمن حسابك';
  END IF;

  SELECT id INTO v_wallet FROM public.customer_wallets
   WHERE user_id = v_owner AND contact_id = _contact_id;

  IF v_wallet IS NULL THEN
    INSERT INTO public.customer_wallets(user_id, contact_id)
    VALUES (v_owner, _contact_id)
    RETURNING id INTO v_wallet;
  END IF;

  RETURN v_wallet;
END;
$$;

-- ===== تنفيذ حركة على المحفظة (ذرّية) =====
CREATE OR REPLACE FUNCTION public.wallet_apply_transaction(
  _contact_id uuid,
  _txn_type text,
  _amount numeric,
  _branch_id uuid DEFAULT NULL,
  _pos_order_id uuid DEFAULT NULL,
  _payment_method text DEFAULT NULL,
  _reference text DEFAULT NULL,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_wallet public.customer_wallets%ROWTYPE;
  v_dir smallint;
  v_new_balance numeric(14,2);
  v_txn_id uuid;
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

  PERFORM public.wallet_get_or_create(_contact_id);

  SELECT * INTO v_wallet FROM public.customer_wallets
   WHERE user_id = v_owner AND contact_id = _contact_id
   FOR UPDATE;

  IF v_wallet.is_frozen THEN
    RAISE EXCEPTION 'محفظة الزبون مجمّدة، لا يمكن تنفيذ حركات عليها';
  END IF;

  -- التسوية اليدوية تقبل قيمة موجبة أو سالبة، وباقي الأنواع دائماً موجبة
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

  IF v_wallet.max_balance IS NOT NULL AND v_new_balance > v_wallet.max_balance THEN
    RAISE EXCEPTION 'تجاوز الحد الأقصى المسموح للمحفظة (%)', v_wallet.max_balance;
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

  RETURN jsonb_build_object(
    'wallet_id', v_wallet.id,
    'transaction_id', v_txn_id,
    'balance', v_new_balance
  );
END;
$$;