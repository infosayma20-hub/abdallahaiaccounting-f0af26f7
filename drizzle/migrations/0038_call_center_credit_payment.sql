-- 1) Link the AR customer for credit (آجل) call-center orders
ALTER TABLE public.call_center_orders
  ADD COLUMN IF NOT EXISTS customer_contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cco_customer_contact ON public.call_center_orders(customer_contact_id) WHERE customer_contact_id IS NOT NULL;

-- 2) Allow 'credit' as a payment method (additive)
ALTER TABLE public.call_center_orders DROP CONSTRAINT IF EXISTS call_center_orders_payment_method_check;
ALTER TABLE public.call_center_orders ADD CONSTRAINT call_center_orders_payment_method_check
  CHECK (payment_method = ANY (ARRAY['cash'::text, 'visa'::text, 'credit'::text]));

-- 3) Server-side guard: credit requires a real customer of the same tenant
--    and a caller allowed to sell on credit (owner/admin or allow_credit_sale).
CREATE OR REPLACE FUNCTION public.guard_call_center_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_ok boolean;
BEGIN
  IF NEW.payment_method IS DISTINCT FROM 'credit' THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_contact_id IS NULL THEN
    RAISE EXCEPTION 'البيع الآجل يتطلب ربط الطلبية بزبون مسجل';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.contacts c
                 WHERE c.id = NEW.customer_contact_id AND c.user_id = NEW.user_id
                   AND COALESCE(c.is_active, true)) THEN
    RAISE EXCEPTION 'الزبون المحدد للبيع الآجل غير صالح لهذه الشركة';
  END IF;

  -- Permission check only when credit is newly chosen (insert or switch to credit)
  IF v_uid IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.payment_method IS DISTINCT FROM 'credit') THEN
    v_ok := v_uid = NEW.user_id
      OR public.has_role(v_uid, 'admin')
      OR public.has_role(v_uid, 'super_admin')
      OR EXISTS (SELECT 1 FROM public.pos_users pu
                 JOIN public.pos_user_permissions pp ON pp.pos_user_id = pu.id
                 WHERE pu.auth_user_id = v_uid AND pu.user_id = NEW.user_id
                   AND COALESCE(pu.is_active, true) AND pp.allow_credit_sale = true);
    IF NOT v_ok THEN
      RAISE EXCEPTION 'ليس لديك صلاحية البيع الآجل';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_call_center_credit ON public.call_center_orders;
CREATE TRIGGER trg_guard_call_center_credit
  BEFORE INSERT OR UPDATE OF payment_method, customer_contact_id ON public.call_center_orders
  FOR EACH ROW EXECUTE FUNCTION public.guard_call_center_credit();

-- 4) Edit RPCs: keep 'credit' instead of collapsing it to 'cash'
CREATE OR REPLACE FUNCTION public.finish_editing_call_center_order(p_order_id uuid, p_customer_name text, p_customer_phone text, p_delivery_type text, p_delivery_address text, p_payment_method text, p_source_app text, p_items jsonb, p_total numeric, p_order_note text, p_delivery_fee numeric DEFAULT 0, p_delivery_info jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.call_center_orders%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'unauthenticated'); END IF;
  SELECT * INTO v_row FROM public.call_center_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF NOT public.is_team_member(v_uid, v_row.user_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'forbidden'); END IF;
  IF v_row.status <> 'pending' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_accepted', 'status', v_row.status); END IF;
  IF v_row.is_editing AND v_row.editing_by IS DISTINCT FROM v_uid THEN RETURN jsonb_build_object('ok', false, 'reason', 'lock_lost'); END IF;

  UPDATE public.call_center_orders
     SET customer_name    = p_customer_name,
         customer_phone   = p_customer_phone,
         delivery_type    = p_delivery_type,
         delivery_address = p_delivery_address,
         payment_method   = CASE WHEN p_payment_method LIKE 'visa%' THEN 'visa'
                                 WHEN p_payment_method = 'credit' THEN 'credit'
                                 ELSE 'cash' END,
         source_app       = COALESCE(p_source_app, source_app),
         items            = p_items,
         total            = p_total,
         order_note       = p_order_note,
         delivery_fee     = COALESCE(p_delivery_fee, 0),
         delivery_info    = p_delivery_info,
         is_editing       = false,
         editing_by       = null,
         editing_by_name  = null,
         editing_started_at = null,
         updated_at       = now()
   WHERE id = p_order_id AND status = 'pending';
  RETURN jsonb_build_object('ok', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.finish_editing_call_center_order(p_order_id uuid, p_customer_name text, p_customer_phone text, p_delivery_type text, p_delivery_address text, p_payment_method text, p_source_app text, p_items jsonb, p_total numeric, p_order_note text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  RETURN public.finish_editing_call_center_order(p_order_id, p_customer_name, p_customer_phone, p_delivery_type,
    p_delivery_address, p_payment_method, p_source_app, p_items, p_total, p_order_note,
    (SELECT delivery_fee FROM public.call_center_orders WHERE id = p_order_id),
    (SELECT delivery_info FROM public.call_center_orders WHERE id = p_order_id));
END;
$function$;