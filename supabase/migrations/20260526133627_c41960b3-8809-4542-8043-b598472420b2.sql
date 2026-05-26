
-- (1) Expand outcome CHECK constraint
ALTER TABLE public.feedback_calls DROP CONSTRAINT IF EXISTS feedback_calls_outcome_check;
ALTER TABLE public.feedback_calls ADD CONSTRAINT feedback_calls_outcome_check
  CHECK (outcome IN ('answered','no_answer','busy','wrong_number','callback_requested','refused','do_not_call'));

-- (2) feedback_upsert_customer
CREATE OR REPLACE FUNCTION public.feedback_upsert_customer(
  p_phone text, p_full_name text DEFAULT NULL, p_branch_id uuid DEFAULT NULL
) RETURNS TABLE(id uuid, display_phone text, normalized_phone text, full_name text,
                last_known_branch_id uuid, do_not_call boolean, was_created boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid; v_norm text; v_existing public.feedback_customers%ROWTYPE;
  v_new_name text; v_will_update boolean := false; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_owner := public.get_team_owner_id(auth.uid());
  v_norm  := public.normalize_phone(p_phone);
  IF v_norm IS NULL OR length(v_norm) < 7 THEN RAISE EXCEPTION 'INVALID_PHONE'; END IF;

  IF p_branch_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.branches b WHERE b.id = p_branch_id AND b.user_id = v_owner
  ) THEN
    RAISE EXCEPTION 'BRANCH_NOT_FOUND';
  END IF;

  v_new_name := nullif(trim(p_full_name), '');

  SELECT * INTO v_existing FROM public.feedback_customers
   WHERE user_id = v_owner AND normalized_phone = v_norm;

  IF NOT FOUND THEN
    IF NOT public.has_feature_permission(auth.uid(),'call_center_feedback','customers','create') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;
    INSERT INTO public.feedback_customers
      (user_id, display_phone, normalized_phone, full_name, last_known_branch_id)
    VALUES (v_owner, p_phone, v_norm, v_new_name, p_branch_id)
    RETURNING public.feedback_customers.id INTO v_id;

    RETURN QUERY
      SELECT fc.id, fc.display_phone, fc.normalized_phone, fc.full_name,
             fc.last_known_branch_id, fc.do_not_call, TRUE
      FROM public.feedback_customers fc WHERE fc.id = v_id;
    RETURN;
  END IF;

  v_will_update :=
       (v_new_name IS NOT NULL AND v_new_name IS DISTINCT FROM v_existing.full_name)
    OR (p_branch_id IS NOT NULL AND p_branch_id IS DISTINCT FROM v_existing.last_known_branch_id);

  IF v_will_update THEN
    IF NOT public.has_feature_permission(auth.uid(),'call_center_feedback','customers','edit') THEN
      RAISE EXCEPTION 'PERMISSION_DENIED';
    END IF;
    UPDATE public.feedback_customers fc
       SET full_name = COALESCE(v_new_name, fc.full_name),
           last_known_branch_id = COALESCE(p_branch_id, fc.last_known_branch_id),
           updated_at = now()
     WHERE fc.id = v_existing.id;
  END IF;

  RETURN QUERY
    SELECT fc.id, fc.display_phone, fc.normalized_phone, fc.full_name,
           fc.last_known_branch_id, fc.do_not_call, FALSE
    FROM public.feedback_customers fc WHERE fc.id = v_existing.id;
END; $$;

REVOKE ALL ON FUNCTION public.feedback_upsert_customer(text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feedback_upsert_customer(text,text,uuid) TO authenticated;

-- (3) feedback_log_call
CREATE OR REPLACE FUNCTION public.feedback_log_call(
  p_customer_id uuid, p_outcome text,
  p_sentiment text DEFAULT NULL, p_rating int DEFAULT NULL,
  p_complaint_text text DEFAULT NULL, p_suggestion_text text DEFAULT NULL,
  p_note text DEFAULT NULL, p_needs_followup boolean DEFAULT false,
  p_followup_due_at timestamptz DEFAULT NULL, p_related_order_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_owner uuid; v_cust public.feedback_customers%ROWTYPE;
  v_order_phone_norm text; v_name text; v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_feature_permission(auth.uid(),'call_center_feedback','calls','create') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_owner := public.get_team_owner_id(auth.uid());

  SELECT * INTO v_cust FROM public.feedback_customers
   WHERE id = p_customer_id AND user_id = v_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
  IF v_cust.do_not_call THEN RAISE EXCEPTION 'DO_NOT_CALL_ACTIVE'; END IF;

  IF p_outcome NOT IN ('answered','no_answer','busy','wrong_number','callback_requested','refused') THEN
    RAISE EXCEPTION 'INVALID_OUTCOME';
  END IF;
  IF p_sentiment IS NOT NULL
     AND p_sentiment NOT IN ('satisfied','unsatisfied','complaint','suggestion','neutral') THEN
    RAISE EXCEPTION 'INVALID_SENTIMENT';
  END IF;
  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RAISE EXCEPTION 'INVALID_RATING';
  END IF;
  IF p_needs_followup AND p_followup_due_at IS NULL THEN
    RAISE EXCEPTION 'FOLLOWUP_DUE_REQUIRED';
  END IF;

  IF p_related_order_id IS NOT NULL THEN
    SELECT public.normalize_phone(customer_phone) INTO v_order_phone_norm
      FROM public.call_center_orders
     WHERE id = p_related_order_id AND user_id = v_owner;
    IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;
    IF v_order_phone_norm IS DISTINCT FROM v_cust.normalized_phone THEN
      RAISE EXCEPTION 'ORDER_CUSTOMER_MISMATCH';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.feedback_calls
     WHERE customer_id = p_customer_id
       AND called_by = auth.uid()
       AND created_at > now() - interval '60 seconds'
  ) THEN
    RAISE EXCEPTION 'RATE_LIMITED';
  END IF;

  SELECT COALESCE(full_name, display_name) INTO v_name
    FROM public.profiles WHERE id = auth.uid();

  INSERT INTO public.feedback_calls (
    user_id, customer_id, related_order_id, outcome, sentiment, rating,
    complaint_text, suggestion_text, note, needs_followup, followup_due_at,
    called_by, called_by_name
  ) VALUES (
    v_owner, p_customer_id, p_related_order_id, p_outcome, p_sentiment, p_rating,
    nullif(trim(p_complaint_text),''), nullif(trim(p_suggestion_text),''), nullif(trim(p_note),''),
    COALESCE(p_needs_followup,false), p_followup_due_at,
    auth.uid(), v_name
  ) RETURNING id INTO v_id;

  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.feedback_log_call(uuid,text,text,int,text,text,text,boolean,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feedback_log_call(uuid,text,text,int,text,text,text,boolean,timestamptz,uuid) TO authenticated;

-- (4) feedback_enable_do_not_call (enable only)
CREATE OR REPLACE FUNCTION public.feedback_enable_do_not_call(
  p_customer_id uuid, p_reason text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_owner uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  IF NOT public.has_feature_permission(auth.uid(),'call_center_feedback','customers','edit') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'REASON_REQUIRED';
  END IF;
  v_owner := public.get_team_owner_id(auth.uid());

  UPDATE public.feedback_customers
     SET do_not_call = true,
         do_not_call_reason = trim(p_reason),
         do_not_call_at = now(),
         do_not_call_by = auth.uid(),
         updated_at = now()
   WHERE id = p_customer_id AND user_id = v_owner;
  IF NOT FOUND THEN RAISE EXCEPTION 'CUSTOMER_NOT_FOUND'; END IF;
END; $$;

REVOKE ALL ON FUNCTION public.feedback_enable_do_not_call(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.feedback_enable_do_not_call(uuid,text) TO authenticated;
