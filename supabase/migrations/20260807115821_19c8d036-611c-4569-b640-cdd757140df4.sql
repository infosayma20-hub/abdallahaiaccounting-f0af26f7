-- 1) Helper: ensure wallet liability + adjustment accounts exist
CREATE OR REPLACE FUNCTION public.wallet_liability_account(_owner uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text := '2185';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id = _owner AND account_code = v_code) THEN
    INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, is_active, nature)
    VALUES (_owner, v_code, 'التزام محافظ العملاء', 'مطلوبات', '2100', true, 'credit')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN v_code;
END; $$;

CREATE OR REPLACE FUNCTION public.wallet_adjustment_account(_owner uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text := '5390';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id = _owner AND account_code = v_code) THEN
    INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, is_active, nature)
    VALUES (_owner, v_code, 'تسويات محافظ العملاء', 'مصروفات', '5300', true, 'debit')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN v_code;
END; $$;

-- 2) Auto GL posting for wallet transactions
CREATE OR REPLACE FUNCTION public.wallet_post_gl()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_liab text; v_cash text; v_card text; v_adj text;
  v_debit text; v_credit text; v_desc text;
BEGIN
  -- POS-consumed wallet spend is posted by complete_pos_order (Dr liability / Cr revenue)
  IF NEW.txn_type = 'spend' AND NEW.pos_order_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_liab := public.wallet_liability_account(NEW.user_id);

  SELECT gl_account_code INTO v_cash FROM public.cash_boxes
   WHERE user_id = NEW.user_id
     AND (NEW.branch_id IS NULL OR branch_id = NEW.branch_id)
     AND upper(COALESCE(currency,'ILS')) = 'ILS'
     AND COALESCE(is_active, true) = true
   ORDER BY created_at LIMIT 1;
  v_cash := COALESCE(v_cash, '1110');

  SELECT COALESCE(ba.gl_account_code, '1120') INTO v_card
  FROM public.company_settings cs
  LEFT JOIN public.bank_accounts ba ON ba.id = cs.card_bank_account_id
  WHERE cs.user_id = NEW.user_id;
  v_card := COALESCE(v_card, '1120');

  IF NEW.txn_type IN ('topup','refund') THEN
    v_debit := CASE
      WHEN NEW.txn_type = 'topup' AND NEW.payment_method = 'card' THEN v_card
      WHEN NEW.txn_type = 'topup' AND NEW.payment_method = 'bank' THEN v_card
      ELSE v_cash END;
    v_credit := v_liab;
    v_desc := CASE WHEN NEW.txn_type = 'topup' THEN 'شحن محفظة زبون' ELSE 'إرجاع لمحفظة زبون' END;
  ELSIF NEW.txn_type = 'spend' THEN
    v_debit := v_liab; v_credit := v_cash;
    v_desc := 'سحب نقدي من محفظة زبون';
  ELSE -- adjustment
    v_adj := public.wallet_adjustment_account(NEW.user_id);
    IF NEW.direction > 0 THEN
      v_debit := v_adj; v_credit := v_liab;
    ELSE
      v_debit := v_liab; v_credit := v_adj;
    END IF;
    v_desc := 'تسوية محفظة زبون';
  END IF;

  INSERT INTO public.transactions (
    user_id, transaction_date, description, debit_account_code, credit_account_code,
    amount, currency, transaction_type, contact_id, reference, payment_method,
    idempotency_key, notes
  ) VALUES (
    NEW.user_id, CURRENT_DATE, v_desc || ' - ' || COALESCE(NEW.reference, NEW.id::text),
    v_debit, v_credit, NEW.amount, 'شيكل', 'wallet_' || NEW.txn_type, NEW.contact_id,
    COALESCE(NEW.reference, NEW.id::text), COALESCE(NEW.payment_method, 'wallet'),
    'WALLET-TXN-' || NEW.id::text, NEW.notes
  ) ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_wallet_post_gl ON public.wallet_transactions;
CREATE TRIGGER trg_wallet_post_gl
AFTER INSERT ON public.wallet_transactions
FOR EACH ROW EXECUTE FUNCTION public.wallet_post_gl();

-- 3) Wallet spend consumed by a POS order (server-side, idempotent)
CREATE OR REPLACE FUNCTION public.wallet_spend_for_order(
  _owner uuid, _contact_id uuid, _order_id uuid, _amount numeric, _reference text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_wallet public.customer_wallets%ROWTYPE; v_new numeric(14,2);
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN RETURN; END IF;
  IF _contact_id IS NULL THEN
    RAISE EXCEPTION 'الدفع من المحفظة يتطلب تحديد الزبون';
  END IF;
  IF EXISTS (SELECT 1 FROM public.wallet_transactions
              WHERE pos_order_id = _order_id AND txn_type = 'spend') THEN
    RETURN; -- already consumed
  END IF;

  SELECT * INTO v_wallet FROM public.customer_wallets
   WHERE user_id = _owner AND contact_id = _contact_id FOR UPDATE;
  IF v_wallet.id IS NULL THEN
    RAISE EXCEPTION 'لا توجد محفظة لهذا الزبون';
  END IF;
  IF v_wallet.is_frozen THEN
    RAISE EXCEPTION 'محفظة الزبون مجمّدة';
  END IF;
  v_new := v_wallet.balance - _amount;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'رصيد المحفظة غير كافٍ. الرصيد %، المطلوب %', v_wallet.balance, _amount;
  END IF;

  UPDATE public.customer_wallets SET balance = v_new, updated_at = now() WHERE id = v_wallet.id;

  INSERT INTO public.wallet_transactions(
    user_id, wallet_id, contact_id, txn_type, amount, direction, balance_after,
    currency, branch_id, pos_order_id, payment_method, reference, notes, performed_by
  ) VALUES (
    _owner, v_wallet.id, _contact_id, 'spend', _amount, -1, v_new,
    v_wallet.currency, NULL, _order_id, 'wallet', _reference, 'دفع من المحفظة في نقطة البيع', auth.uid()
  );
END; $$;

-- 4) Reconciliation: wallets balance vs GL liability account
CREATE OR REPLACE FUNCTION public.get_wallet_reconciliation(_owner uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid; v_wallets numeric := 0; v_gl numeric := 0; v_count int := 0;
BEGIN
  v_owner := COALESCE(_owner, public.get_team_owner_id(auth.uid()));
  IF v_owner IS NULL THEN RETURN jsonb_build_object('error', 'no_owner'); END IF;

  SELECT COALESCE(SUM(balance),0), COUNT(*) INTO v_wallets, v_count
  FROM public.customer_wallets WHERE user_id = v_owner;

  SELECT COALESCE(SUM(CASE WHEN credit_account_code = '2185' THEN amount ELSE -amount END), 0)
  INTO v_gl
  FROM public.transactions
  WHERE user_id = v_owner
    AND COALESCE(is_deleted, false) = false
    AND ('2185' IN (debit_account_code, credit_account_code));

  RETURN jsonb_build_object(
    'wallets_total', ROUND(v_wallets, 2),
    'gl_balance', ROUND(v_gl, 2),
    'difference', ROUND(v_wallets - v_gl, 2),
    'wallets_count', v_count
  );
END; $$;

-- 5) Teach complete_pos_order about the 'wallet' tender (surgical, verified patch)
DO $do$
DECLARE
  v_src text;
  v_old_a text := 'IF v_tender_method = ''credit'' THEN v_debit_account := v_credit_debit_account;';
  v_new_a text := 'IF v_tender_method = ''wallet'' THEN v_debit_account := public.wallet_liability_account(p_user_id);
    ELSIF v_tender_method = ''credit'' THEN v_debit_account := v_credit_debit_account;';
  v_old_b text := '  UPDATE public.pos_orders
  SET state = ''paid'', paid_at = NOW(),';
  v_new_b text := '  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payments) p
               WHERE COALESCE(p.value->>''method'', ''cash'') = ''wallet'') THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_payments) p
                WHERE COALESCE(p.value->>''method'', ''cash'') = ''wallet''
                  AND COALESCE(p.value->>''currency'', ''ILS'') <> ''ILS'') THEN
      RAISE EXCEPTION ''الدفع من المحفظة متاح بالشيكل فقط'';
    END IF;
    PERFORM public.wallet_spend_for_order(
      p_user_id, v_order.customer_id, p_order_id,
      (SELECT COALESCE(SUM((p.value->>''amount'')::numeric), 0)
         FROM jsonb_array_elements(p_payments) p
        WHERE COALESCE(p.value->>''method'', ''cash'') = ''wallet''),
      v_order.order_number);
  END IF;

  UPDATE public.pos_orders
  SET state = ''paid'', paid_at = NOW(),';
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'complete_pos_order';

  IF position(v_old_a in v_src) = 0 THEN RAISE EXCEPTION 'anchor A not found'; END IF;
  IF position(v_old_b in v_src) = 0 THEN RAISE EXCEPTION 'anchor B not found'; END IF;

  v_src := replace(v_src, v_old_a, v_new_a);
  v_src := replace(v_src, v_old_b, v_new_b);

  EXECUTE format(
    'CREATE OR REPLACE FUNCTION public.complete_pos_order(p_order_id uuid, p_user_id uuid, p_payments jsonb, p_meal_subsidy numeric DEFAULT 0)
     RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS %L', v_src);
END $do$;