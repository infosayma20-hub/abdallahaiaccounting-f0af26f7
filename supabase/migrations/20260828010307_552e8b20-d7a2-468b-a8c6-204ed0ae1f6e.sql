ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS local_id text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS local_id text;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS local_id text;

CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_local_id_uidx ON public.contacts (user_id, local_id) WHERE local_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS accounts_user_local_id_uidx ON public.accounts (user_id, local_id) WHERE local_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS employees_user_local_id_uidx ON public.employees (user_id, local_id) WHERE local_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_contact_offline(
  p_user_id uuid,
  p_payload jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_id uuid;
  v_name text := nullif(trim(p_payload->>'contact_name'), '');
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params: idempotency key');
  END IF;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params: contact_name');
  END IF;

  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL OR v_owner <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'permission denied');
  END IF;

  SELECT id INTO v_id FROM public.contacts
   WHERE user_id = p_user_id AND local_id = p_idempotency_key;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'id', v_id, 'duplicate', true);
  END IF;

  SELECT id INTO v_id FROM public.contacts
   WHERE user_id = p_user_id AND contact_name = v_name AND coalesce(is_archived, false) = false
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    UPDATE public.contacts SET local_id = coalesce(local_id, p_idempotency_key) WHERE id = v_id;
    RETURN jsonb_build_object('success', true, 'id', v_id, 'duplicate', true);
  END IF;

  INSERT INTO public.contacts (
    user_id, contact_name, contact_type, phone, email, address, tax_number,
    notes, contact_class, credit_limit, payment_terms_days, is_active, source, local_id
  ) VALUES (
    p_user_id,
    v_name,
    coalesce(nullif(p_payload->>'contact_type', ''), 'زبون'),
    nullif(p_payload->>'phone', ''),
    nullif(p_payload->>'email', ''),
    nullif(p_payload->>'address', ''),
    nullif(p_payload->>'tax_number', ''),
    nullif(p_payload->>'notes', ''),
    nullif(p_payload->>'contact_class', ''),
    nullif(p_payload->>'credit_limit', '')::numeric,
    nullif(p_payload->>'payment_terms_days', '')::integer,
    coalesce((p_payload->>'is_active')::boolean, true),
    coalesce(nullif(p_payload->>'source', ''), 'offline'),
    p_idempotency_key
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_account_offline(
  p_user_id uuid,
  p_payload jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_id uuid;
  v_code text := nullif(trim(p_payload->>'account_code'), '');
  v_name text := nullif(trim(p_payload->>'account_name'), '');
  v_type text := nullif(trim(p_payload->>'account_type'), '');
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params: idempotency key');
  END IF;
  IF v_code IS NULL OR v_name IS NULL OR v_type IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params: account fields');
  END IF;

  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL OR v_owner <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'permission denied');
  END IF;

  SELECT id INTO v_id FROM public.accounts
   WHERE user_id = p_user_id AND local_id = p_idempotency_key;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'id', v_id, 'duplicate', true);
  END IF;

  SELECT id INTO v_id FROM public.accounts
   WHERE user_id = p_user_id AND account_code = v_code;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not allowed: كود الحساب مستخدم مسبقاً');
  END IF;

  INSERT INTO public.accounts (
    user_id, account_code, account_name, account_type, parent_code,
    currency, notes, description_ar, is_active, local_id
  ) VALUES (
    p_user_id, v_code, v_name, v_type,
    nullif(p_payload->>'parent_code', ''),
    coalesce(nullif(p_payload->>'currency', ''), 'ILS'),
    nullif(p_payload->>'notes', ''),
    nullif(p_payload->>'description_ar', ''),
    coalesce((p_payload->>'is_active')::boolean, true),
    p_idempotency_key
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_employee_offline(
  p_user_id uuid,
  p_payload jsonb,
  p_idempotency_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_id uuid;
  v_name text := nullif(trim(p_payload->>'full_name'), '');
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) < 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params: idempotency key');
  END IF;
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid params: full_name');
  END IF;

  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL OR v_owner <> p_user_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'permission denied');
  END IF;

  SELECT id INTO v_id FROM public.employees
   WHERE user_id = p_user_id AND local_id = p_idempotency_key;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'id', v_id, 'duplicate', true);
  END IF;

  INSERT INTO public.employees (
    user_id, full_name, id_number, phone, email, position, department,
    start_date, salary_type, base_salary, hourly_rate,
    work_days_per_week, work_hours_per_day, annual_leave_days, sick_leave_days,
    branch_id, notes, is_active, local_id
  ) VALUES (
    p_user_id, v_name,
    nullif(p_payload->>'id_number', ''),
    nullif(p_payload->>'phone', ''),
    nullif(p_payload->>'email', ''),
    nullif(p_payload->>'position', ''),
    nullif(p_payload->>'department', ''),
    coalesce(nullif(p_payload->>'start_date', '')::date, CURRENT_DATE),
    coalesce(nullif(p_payload->>'salary_type', ''), 'monthly'),
    coalesce(nullif(p_payload->>'base_salary', '')::numeric, 0),
    coalesce(nullif(p_payload->>'hourly_rate', '')::numeric, 0),
    coalesce(nullif(p_payload->>'work_days_per_week', '')::numeric, 6),
    coalesce(nullif(p_payload->>'work_hours_per_day', '')::numeric, 8),
    coalesce(nullif(p_payload->>'annual_leave_days', '')::numeric, 14),
    coalesce(nullif(p_payload->>'sick_leave_days', '')::numeric, 14),
    nullif(p_payload->>'branch_id', '')::uuid,
    nullif(p_payload->>'notes', ''),
    coalesce((p_payload->>'is_active')::boolean, true),
    p_idempotency_key
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('success', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.create_contact_offline(uuid, jsonb, text) FROM public;
REVOKE ALL ON FUNCTION public.create_account_offline(uuid, jsonb, text) FROM public;
REVOKE ALL ON FUNCTION public.create_employee_offline(uuid, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_contact_offline(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_account_offline(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_employee_offline(uuid, jsonb, text) TO authenticated;