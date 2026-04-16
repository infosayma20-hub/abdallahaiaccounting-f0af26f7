-- 1) Auto-create warranty cards when invoice is posted (status changes to sent/paid)
CREATE OR REPLACE FUNCTION public.auto_create_warranty_cards_on_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_policy RECORD;
  v_qty INTEGER;
  i INTEGER;
BEGIN
  -- Trigger only when invoice transitions into a posted state from draft/null
  IF NEW.invoice_type = 'sale'
     AND NEW.status IN ('sent','paid','posted')
     AND (OLD.status IS NULL OR OLD.status = 'draft' OR OLD.status NOT IN ('sent','paid','posted'))
  THEN
    -- Iterate items that have a warranty policy and don't already have a card
    FOR v_item IN
      SELECT ii.id AS item_id, ii.product_id, ii.quantity
      FROM public.invoice_items ii
      WHERE ii.invoice_id = NEW.id
    LOOP
      SELECT * INTO v_policy
      FROM public.warranty_policies
      WHERE product_id = v_item.product_id
        AND user_id = NEW.user_id
        AND is_active = true
      LIMIT 1;

      IF NOT FOUND THEN CONTINUE; END IF;

      -- Skip if cards already exist for this invoice item
      IF EXISTS (
        SELECT 1 FROM public.warranty_cards
        WHERE invoice_item_id = v_item.item_id
      ) THEN CONTINUE; END IF;

      v_qty := GREATEST(1, COALESCE(v_item.quantity, 1)::INTEGER);

      -- If serial-tracked: skip auto-creation (must be manual via dialog to enter serials)
      IF COALESCE(v_policy.has_serial, false) = true THEN CONTINUE; END IF;

      -- Otherwise: create one card per unit (no serial required)
      FOR i IN 1..v_qty LOOP
        INSERT INTO public.warranty_cards (
          user_id, invoice_id, invoice_item_id, product_id, contact_id,
          start_date, end_date, quantity, status
        ) VALUES (
          NEW.user_id, NEW.id, v_item.item_id, v_item.product_id, NEW.contact_id,
          COALESCE(NEW.invoice_date, CURRENT_DATE),
          COALESCE(NEW.invoice_date, CURRENT_DATE) + (v_policy.duration_months || ' months')::INTERVAL,
          1, 'active'
        );
      END LOOP;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_warranty_cards ON public.invoices;
CREATE TRIGGER trg_auto_create_warranty_cards
AFTER UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_warranty_cards_on_invoice();

-- Also fire on INSERT when invoice is created already-posted
CREATE OR REPLACE FUNCTION public.auto_create_warranty_cards_on_invoice_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_policy RECORD;
  v_qty INTEGER;
  i INTEGER;
BEGIN
  IF NEW.invoice_type = 'sale' AND NEW.status IN ('sent','paid','posted') THEN
    FOR v_item IN
      SELECT ii.id AS item_id, ii.product_id, ii.quantity
      FROM public.invoice_items ii
      WHERE ii.invoice_id = NEW.id
    LOOP
      SELECT * INTO v_policy FROM public.warranty_policies
      WHERE product_id = v_item.product_id AND user_id = NEW.user_id AND is_active = true LIMIT 1;
      IF NOT FOUND THEN CONTINUE; END IF;
      IF COALESCE(v_policy.has_serial, false) = true THEN CONTINUE; END IF;
      v_qty := GREATEST(1, COALESCE(v_item.quantity, 1)::INTEGER);
      FOR i IN 1..v_qty LOOP
        INSERT INTO public.warranty_cards (
          user_id, invoice_id, invoice_item_id, product_id, contact_id,
          start_date, end_date, quantity, status
        ) VALUES (
          NEW.user_id, NEW.id, v_item.item_id, v_item.product_id, NEW.contact_id,
          COALESCE(NEW.invoice_date, CURRENT_DATE),
          COALESCE(NEW.invoice_date, CURRENT_DATE) + (v_policy.duration_months || ' months')::INTERVAL,
          1, 'active'
        );
      END LOOP;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_create_warranty_cards_insert ON public.invoices;
CREATE TRIGGER trg_auto_create_warranty_cards_insert
AFTER INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.auto_create_warranty_cards_on_invoice_insert();

-- 2) Ensure warranty expense (6200) and warranty income (4900) accounts exist per user
CREATE OR REPLACE FUNCTION public.ensure_warranty_accounts(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, is_system, system_role)
  VALUES
    (p_user_id, '6200', 'مصاريف ضمان وكفالات', 'مصاريف', '5100', true, 'warranty_expense'),
    (p_user_id, '4900', 'إيرادات تعويضات ضمان', 'إيرادات', '4100', true, 'warranty_income')
  ON CONFLICT (user_id, account_code) DO NOTHING;
END;
$$;

-- 3) Auto journal entry when a warranty claim is resolved with cost
CREATE OR REPLACE FUNCTION public.auto_journal_warranty_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
BEGIN
  -- Only when transitioning to resolved with cost > 0 and not yet posted
  IF NEW.status = 'resolved'
     AND COALESCE(NEW.cost, 0) > 0
     AND NEW.resolution IN ('repair','replacement')
     AND (OLD.status IS NULL OR OLD.status != 'resolved')
  THEN
    -- Skip if a transaction was already created for this claim
    IF EXISTS (
      SELECT 1 FROM public.transactions
      WHERE idempotency_key = 'WARRANTY-CLAIM-' || NEW.id::text
    ) THEN
      RETURN NEW;
    END IF;

    -- Make sure target accounts exist
    PERFORM public.ensure_warranty_accounts(NEW.user_id);

    INSERT INTO public.transactions (
      user_id, transaction_date, description,
      debit_account_code, credit_account_code,
      amount, currency, transaction_type,
      reference, payment_method, idempotency_key
    ) VALUES (
      NEW.user_id,
      COALESCE(NEW.resolution_date, CURRENT_DATE),
      'تكلفة ضمان - ' || COALESCE(NEW.claim_number, NEW.id::text),
      '6200',  -- مصروف ضمان
      '1110',  -- صندوق
      NEW.cost,
      'شيكل',
      'warranty_expense',
      NEW.claim_number,
      'نقدي',
      'WARRANTY-CLAIM-' || NEW.id::text
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_journal_warranty_claim ON public.warranty_claims;
CREATE TRIGGER trg_auto_journal_warranty_claim
AFTER UPDATE ON public.warranty_claims
FOR EACH ROW
EXECUTE FUNCTION public.auto_journal_warranty_claim();