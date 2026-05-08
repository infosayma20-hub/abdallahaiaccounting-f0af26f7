-- =====================================================================
-- POS Tax Ledger Integration (QA-only, NOT auto-applied)
-- Purpose:
--   - Mirror paid POS sales/returns into public.tax_ledger
--   - reference_type: 'pos_sale' | 'pos_return'
--   - Sales = positive net/tax; Returns = negative net/tax
--   - Idempotent (delete + insert per order)
--   - No tax-report, RLS, or UI changes
-- Depends on Migration 20260508123000 for net/tax split on lines.
-- =====================================================================

-- Helper: sync a single POS order into tax_ledger (idempotent)
CREATE OR REPLACE FUNCTION public.sync_pos_tax_ledger(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order RECORD;
  v_ref_type TEXT;
  v_sign NUMERIC;
  v_net NUMERIC := 0;
  v_vat NUMERIC := 0;
  v_rate NUMERIC := 0;
  v_party_name TEXT;
  v_party_tax TEXT;
BEGIN
  SELECT id, user_id, customer_id, customer_name, order_number,
         is_return, state, paid_at, total, tax_amount, subtotal
  INTO v_order
  FROM public.pos_orders WHERE id = p_order_id;

  IF v_order IS NULL THEN RETURN; END IF;
  IF v_order.state IS DISTINCT FROM 'paid' THEN
    -- Cleanup any prior rows if order was reverted
    DELETE FROM public.tax_ledger
    WHERE user_id = v_order.user_id
      AND reference_type IN ('pos_sale','pos_return')
      AND reference_id = p_order_id;
    RETURN;
  END IF;

  v_ref_type := CASE WHEN v_order.is_return THEN 'pos_return' ELSE 'pos_sale' END;
  v_sign     := CASE WHEN v_order.is_return THEN -1 ELSE 1 END;

  -- Aggregate from lines (authoritative)
  SELECT
    COALESCE(SUM(GREATEST(total - COALESCE(tax_amount,0), 0)), 0),
    COALESCE(SUM(COALESCE(tax_amount,0)), 0)
  INTO v_net, v_vat
  FROM public.pos_order_lines WHERE order_id = p_order_id;

  -- Fallback to order-level if lines empty/no breakdown
  IF v_net = 0 AND v_vat = 0 THEN
    v_vat := COALESCE(v_order.tax_amount, 0);
    v_net := COALESCE(v_order.total, 0) - v_vat;
  END IF;

  IF v_net = 0 AND v_vat = 0 THEN
    -- Nothing taxable to log; ensure clean state
    DELETE FROM public.tax_ledger
    WHERE user_id = v_order.user_id
      AND reference_type = v_ref_type
      AND reference_id   = p_order_id;
    RETURN;
  END IF;

  v_rate := CASE WHEN v_net > 0 THEN ROUND((v_vat / v_net) * 100, 2) ELSE 0 END;

  -- Resolve party (customer) info if linked
  IF v_order.customer_id IS NOT NULL THEN
    SELECT name, tax_number INTO v_party_name, v_party_tax
    FROM public.contacts WHERE id = v_order.customer_id;
  END IF;
  v_party_name := COALESCE(v_party_name, v_order.customer_name, 'POS Customer');

  -- Idempotency: delete + insert
  DELETE FROM public.tax_ledger
  WHERE user_id = v_order.user_id
    AND reference_type = v_ref_type
    AND reference_id   = p_order_id;

  INSERT INTO public.tax_ledger (
    user_id, period_year, period_month, transaction_date,
    reference_type, reference_id, tax_type, tax_category,
    net_amount, tax_rate, tax_amount,
    invoice_number, party_name, party_tax_number,
    is_deductible, notes
  ) VALUES (
    v_order.user_id,
    EXTRACT(YEAR  FROM COALESCE(v_order.paid_at, NOW()))::INT,
    EXTRACT(MONTH FROM COALESCE(v_order.paid_at, NOW()))::INT,
    COALESCE(v_order.paid_at::DATE, CURRENT_DATE),
    v_ref_type, p_order_id,
    'output',
    CASE WHEN v_vat > 0 THEN 'standard' ELSE 'zero' END,
    v_net * v_sign,
    v_rate,
    v_vat * v_sign,
    v_order.order_number, v_party_name, v_party_tax,
    false,
    CASE WHEN v_order.is_return THEN 'POS Return (negative)' ELSE 'POS Sale' END
  );
END;
$$;

-- Trigger function: react to pos_orders state changes
CREATE OR REPLACE FUNCTION public.trg_pos_orders_tax_ledger_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state = 'paid' THEN
      PERFORM public.sync_pos_tax_ledger(NEW.id);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Re-sync whenever payment state, totals, or tax changed
    IF NEW.state IS DISTINCT FROM OLD.state
       OR COALESCE(NEW.total,0)      IS DISTINCT FROM COALESCE(OLD.total,0)
       OR COALESCE(NEW.tax_amount,0) IS DISTINCT FROM COALESCE(OLD.tax_amount,0)
       OR COALESCE(NEW.is_deleted,false) IS DISTINCT FROM COALESCE(OLD.is_deleted,false)
    THEN
      IF COALESCE(NEW.is_deleted, false) THEN
        DELETE FROM public.tax_ledger
        WHERE user_id = NEW.user_id
          AND reference_type IN ('pos_sale','pos_return')
          AND reference_id = NEW.id;
      ELSE
        PERFORM public.sync_pos_tax_ledger(NEW.id);
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.tax_ledger
    WHERE user_id = OLD.user_id
      AND reference_type IN ('pos_sale','pos_return')
      AND reference_id = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pos_orders_tax_ledger_sync ON public.pos_orders;
CREATE TRIGGER pos_orders_tax_ledger_sync
AFTER INSERT OR UPDATE OR DELETE ON public.pos_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_pos_orders_tax_ledger_sync();
