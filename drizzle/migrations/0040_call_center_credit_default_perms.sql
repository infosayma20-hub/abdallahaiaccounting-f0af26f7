CREATE OR REPLACE FUNCTION public.guard_call_center_credit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_uid uuid := auth.uid(); v_ok boolean;
BEGIN
  IF NEW.payment_method IS DISTINCT FROM 'credit' THEN RETURN NEW; END IF;
  IF NEW.customer_contact_id IS NULL THEN RAISE EXCEPTION 'البيع الآجل يتطلب ربط الطلبية بزبون مسجل'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = NEW.customer_contact_id AND c.user_id = NEW.user_id AND COALESCE(c.is_active, true)) THEN
    RAISE EXCEPTION 'الزبون المحدد للبيع الآجل غير صالح لهذه الشركة'; END IF;
  IF v_uid IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.payment_method IS DISTINCT FROM 'credit') THEN
    -- Same semantics as the POS app: a POS user without a saved permission row uses defaults (credit allowed)
    v_ok := v_uid = NEW.user_id OR public.has_role(v_uid,'admin') OR public.has_role(v_uid,'super_admin')
      OR EXISTS (SELECT 1 FROM public.pos_users pu LEFT JOIN public.pos_user_permissions pp ON pp.pos_user_id = pu.id
                 WHERE pu.auth_user_id = v_uid AND pu.user_id = NEW.user_id AND COALESCE(pu.is_active, true)
                   AND (pp.id IS NULL OR pp.allow_credit_sale = true));
    IF NOT v_ok THEN RAISE EXCEPTION 'ليس لديك صلاحية البيع الآجل'; END IF;
  END IF;
  RETURN NEW;
END $$;