
-- V4: Fix fn_pos_order_tax_ledger to stop referencing NEW.is_deleted.
-- public.pos_orders has no is_deleted column; cancellation/voiding is done
-- via state ('cancelled') and void_pos_order(). The trigger now syncs only
-- on state/total/tax_amount changes, and delegates state-aware cleanup to
-- sync_pos_tax_ledger (which already deletes ledger rows when state != 'paid').
-- Function and trigger names are preserved; reference_type values unchanged.
CREATE OR REPLACE FUNCTION public.fn_pos_order_tax_ledger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.state = 'paid' AND COALESCE(NEW.tax_amount, 0) > 0 THEN
      PERFORM public.sync_pos_tax_ledger(NEW.id);
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.state IS DISTINCT FROM OLD.state
       OR COALESCE(NEW.total, 0)      IS DISTINCT FROM COALESCE(OLD.total, 0)
       OR COALESCE(NEW.tax_amount, 0) IS DISTINCT FROM COALESCE(OLD.tax_amount, 0)
    THEN
      IF NEW.state = 'paid' AND COALESCE(NEW.tax_amount, 0) > 0 THEN
        PERFORM public.sync_pos_tax_ledger(NEW.id);
      ELSE
        DELETE FROM public.tax_ledger
        WHERE user_id = NEW.user_id
          AND reference_type IN ('pos_sale','pos_return')
          AND reference_id   = NEW.id;
      END IF;
    END IF;
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    DELETE FROM public.tax_ledger
    WHERE user_id = OLD.user_id
      AND reference_type IN ('pos_sale','pos_return')
      AND reference_id   = OLD.id;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$;
