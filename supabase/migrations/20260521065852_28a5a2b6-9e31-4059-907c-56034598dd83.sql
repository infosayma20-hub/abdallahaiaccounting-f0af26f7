-- =========================================================
-- Phase 1b — DB defense-in-depth for sensitive destructive ops
-- Enforces has_feature_permission(delete) on:
--   invoices         (UPDATE→status='cancelled' OR DELETE)
--   receipt_vouchers (UPDATE→status='cancelled' OR DELETE)
--   vouchers         (UPDATE→status='cancelled' OR DELETE)
-- Bypass: super_admin role, and missing auth.uid() (service_role/migrations).
-- =========================================================

CREATE OR REPLACE FUNCTION public.enforce_feature_perm_destructive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_app       text := TG_ARGV[0];
  v_feature   text := TG_ARGV[1];
  v_allowed   boolean;
  v_is_destructive boolean := false;
BEGIN
  -- service_role / migrations / cron — no auth.uid → allow.
  IF v_uid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- super_admin bypass.
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role = 'super_admin') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_is_destructive := true;
  ELSIF TG_OP = 'UPDATE' THEN
    -- destructive only when transitioning into cancelled (soft-delete)
    IF COALESCE(NEW.status, '') = 'cancelled' AND COALESCE(OLD.status, '') <> 'cancelled' THEN
      v_is_destructive := true;
    END IF;
  END IF;

  IF NOT v_is_destructive THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_allowed := public.has_feature_permission(v_uid, v_app, v_feature, 'delete');
  IF v_allowed IS NOT TRUE THEN
    -- Audit the denial.
    BEGIN
      INSERT INTO public.activity_log (actor_id, action, entity_type, entity_id, entity_label, details, created_at)
      VALUES (
        v_uid,
        'feature_perm_denied_destructive',
        TG_TABLE_NAME,
        COALESCE(NEW.id, OLD.id),
        v_app || '.' || v_feature || '.delete',
        jsonb_build_object('op', TG_OP, 'app', v_app, 'feature', v_feature),
        now()
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RAISE EXCEPTION 'permission_denied: % requires %.%.delete', TG_OP, v_app, v_feature
      USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- =========================================================
-- invoices: app depends on type ('purchase' → purchases, else sales).
-- Use a thin wrapper that picks the right app per row.
-- =========================================================
CREATE OR REPLACE FUNCTION public.enforce_feature_perm_invoices()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row record;
  v_app text;
  v_feature text;
  v_destructive boolean := false;
BEGIN
  IF v_uid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
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
$$;

DROP TRIGGER IF EXISTS trg_invoices_feature_perm ON public.invoices;
CREATE TRIGGER trg_invoices_feature_perm
BEFORE UPDATE OF status OR DELETE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.enforce_feature_perm_invoices();

DROP TRIGGER IF EXISTS trg_receipt_vouchers_feature_perm ON public.receipt_vouchers;
CREATE TRIGGER trg_receipt_vouchers_feature_perm
BEFORE UPDATE OF status OR DELETE ON public.receipt_vouchers
FOR EACH ROW EXECUTE FUNCTION public.enforce_feature_perm_destructive('finance', 'receipts');

DROP TRIGGER IF EXISTS trg_vouchers_feature_perm ON public.vouchers;
CREATE TRIGGER trg_vouchers_feature_perm
BEFORE UPDATE OF status OR DELETE ON public.vouchers
FOR EACH ROW EXECUTE FUNCTION public.enforce_feature_perm_destructive('finance', 'payments');