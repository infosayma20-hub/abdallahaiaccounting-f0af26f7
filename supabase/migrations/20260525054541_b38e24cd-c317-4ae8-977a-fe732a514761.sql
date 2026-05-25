-- ============================================================================
-- Rep-owned invoice self-cancel: limited path for sales reps to cancel ONLY
-- their own rep-source invoices that have not been collected. Admin/accountant
-- path (sales.invoices.delete) remains unchanged.
-- ============================================================================

-- 1) Update the enforcement trigger to allow a session-scoped bypass that
--    can ONLY be set inside the rep self-cancel RPC (SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.enforce_feature_perm_invoices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
  v_app text;
  v_feature text;
  v_destructive boolean := false;
  v_bypass text;
BEGIN
  IF v_uid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- Session-scoped bypass: set by rep_cancel_owned_invoice (SECURITY DEFINER)
  -- after it validates ownership + unpaid + rep-source. The GUC is local to
  -- the transaction so it cannot be smuggled from the client.
  BEGIN
    v_bypass := current_setting('app.rep_self_cancel', true);
  EXCEPTION WHEN OTHERS THEN
    v_bypass := NULL;
  END;
  IF v_bypass = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role = 'super_admin') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_destructive := true; v_row := OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(NEW.status, '') = 'cancelled' AND COALESCE(OLD.status, '') <> 'cancelled' THEN
      v_destructive := true; v_row := NEW;
    END IF;
  END IF;

  IF NOT v_destructive THEN RETURN COALESCE(NEW, OLD); END IF;

  IF COALESCE(v_row.invoice_type, '') = 'purchase' THEN
    v_app := 'purchases'; v_feature := 'purchase_invoices';
  ELSE
    v_app := 'sales'; v_feature := 'invoices';
  END IF;

  IF public.has_feature_permission(v_uid, v_app, v_feature, 'delete') IS NOT TRUE THEN
    BEGIN
      INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, entity_label, details, created_at)
      VALUES (v_uid, 'feature_perm_denied_destructive', 'invoices', v_row.id,
              v_app || '.' || v_feature || '.delete',
              jsonb_build_object('op', TG_OP, 'app', v_app, 'feature', v_feature), now());
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE EXCEPTION 'permission_denied: % requires %.%.delete', TG_OP, v_app, v_feature
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 2) New RPC: rep_cancel_owned_invoice
--    Lets a sales rep cancel ONLY their own rep-source invoice when it has
--    not been collected. Re-uses void_rep_sale_atomic for posted invoices so
--    journal reversals stay correct; uses the legacy void path for drafts.
--    On ANY validation failure, raises 'REP_CANCEL_FORBIDDEN' so the UI shows
--    a single, consistent Arabic message.
CREATE OR REPLACE FUNCTION public.rep_cancel_owned_invoice(
  p_invoice_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_rep_id uuid;
  v_inv RECORD;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'REP_CANCEL_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'سبب الإلغاء مطلوب (3 حروف على الأقل)';
  END IF;

  -- Map auth user → sales_representatives.id
  SELECT id INTO v_rep_id
  FROM public.sales_representatives
  WHERE auth_user_id = v_uid
  LIMIT 1;

  IF v_rep_id IS NULL THEN
    RAISE EXCEPTION 'REP_CANCEL_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inv
  FROM public.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REP_CANCEL_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Strict ownership + state checks. Any failure → uniform forbidden error.
  IF v_inv.source IS DISTINCT FROM 'rep'
     OR v_inv.salesperson_id IS DISTINCT FROM v_rep_id
     OR COALESCE(v_inv.is_voided, false)
     OR v_inv.status IN ('cancelled','void','reversed')
     OR COALESCE(v_inv.paid_amount, 0) > 0
  THEN
    RAISE EXCEPTION 'REP_CANCEL_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Authorize the status update for the trigger (transaction-local GUC).
  PERFORM set_config('app.rep_self_cancel', 'on', true);

  IF v_inv.linked_transaction_id IS NOT NULL THEN
    -- Posted rep invoice → use the canonical atomic reversal.
    v_result := public.void_rep_sale_atomic(p_invoice_id, trim(p_reason));
  ELSE
    -- Unposted draft → simple cancel.
    UPDATE public.invoices
       SET status = 'cancelled',
           is_voided = true,
           voided_at = COALESCE(voided_at, now()),
           void_reason = trim(p_reason),
           notes_internal = COALESCE(notes_internal, '')
             || E'\n[REP-CANCEL ' || to_char(now(),'YYYY-MM-DD HH24:MI')
             || ' by ' || v_uid::text || '] ' || trim(p_reason)
     WHERE id = p_invoice_id;

    v_result := jsonb_build_object(
      'success', true,
      'invoice_id', p_invoice_id,
      'already_voided', false,
      'posted', false
    );
  END IF;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.rep_cancel_owned_invoice(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rep_cancel_owned_invoice(uuid, text) TO authenticated;