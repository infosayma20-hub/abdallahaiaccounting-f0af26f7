-- Allow the internal GL re-post inside change_pos_payment_method (mixed flow)
-- and other legitimate reversal paths, while still blocking direct/manual
-- soft-deletes of paid POS transactions.
CREATE OR REPLACE FUNCTION public.prevent_direct_pos_transaction_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_bypass text;
BEGIN
  -- Explicit session bypass (set by future callers via set_config)
  v_bypass := current_setting('app.pos_gl_repost', true);
  IF v_bypass = 'on' OR v_bypass = 'true' THEN
    RETURN NEW;
  END IF;

  IF NEW.is_deleted = true
     AND COALESCE(OLD.is_deleted, false) = false
     AND EXISTS (
       SELECT 1
       FROM public.pos_orders po
       WHERE po.state = 'paid'
         AND COALESCE(po.is_return, false) = false
         AND (
           po.transaction_id = NEW.id
           OR po.linked_transaction_id = NEW.id
           OR po.id = NEW.pos_order_id
         )
     )
  THEN
    -- Legitimate internal reversal from change_pos_payment_method appends
    -- a marker into notes on the same UPDATE. Detect and allow.
    IF COALESCE(NEW.notes, '') ~ '\[gl-sync [^]]+\] .*soft-deleted for mixed-split re-post'
       OR COALESCE(NEW.notes, '') LIKE '%pos-edit-repost%'
    THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'POS_TX_DIRECT_DELETE_BLOCKED'
      USING ERRCODE = 'P0001',
            HINT = 'use change_pos_payment_method / void_pos_order instead of a direct delete',
            DETAIL = 'Directly deleting a paid POS transaction leaves pos_orders paid while accounting is deleted.';
  END IF;

  RETURN NEW;
END;
$$;