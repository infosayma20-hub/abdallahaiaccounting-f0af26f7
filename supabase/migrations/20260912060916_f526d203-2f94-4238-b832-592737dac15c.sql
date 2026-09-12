-- ACCOUNT ROLE FOUNDATION V1 (additive, inactive by default)

CREATE TABLE IF NOT EXISTS public.account_system_roles_v1 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('ACCOUNTS_RECEIVABLE','SERVICE_SALES_REVENUE')),
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE RESTRICT,
  notes text,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS account_system_roles_v1_owner_role_uidx
  ON public.account_system_roles_v1 (owner_id, role);
CREATE INDEX IF NOT EXISTS account_system_roles_v1_account_idx
  ON public.account_system_roles_v1 (account_id);

GRANT SELECT ON public.account_system_roles_v1 TO authenticated;
GRANT ALL ON public.account_system_roles_v1 TO service_role;

ALTER TABLE public.account_system_roles_v1 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant can view account system roles" ON public.account_system_roles_v1;
CREATE POLICY "Tenant can view account system roles"
ON public.account_system_roles_v1
FOR SELECT
TO authenticated
USING (owner_id = public.get_team_owner_id(auth.uid()));

-- Validation: hierarchy / tenant / leaf / active / cycle safety
CREATE OR REPLACE FUNCTION public.validate_account_system_role_v1()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  a public.accounts%ROWTYPE;
  v_code text;
  v_parent text;
  v_depth int := 0;
BEGIN
  SELECT * INTO a FROM public.accounts WHERE id = NEW.account_id;
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'account_role: account not found' USING ERRCODE = '23503';
  END IF;

  IF a.user_id IS DISTINCT FROM NEW.owner_id THEN
    RAISE EXCEPTION 'account_role: cross-tenant account is not allowed' USING ERRCODE = '42501';
  END IF;

  IF COALESCE(a.is_active, true) = false THEN
    RAISE EXCEPTION 'account_role: account is inactive' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.accounts c
     WHERE c.user_id = a.user_id
       AND c.parent_code = a.account_code
       AND COALESCE(c.is_active, true) = true
  ) THEN
    RAISE EXCEPTION 'account_role: parent accounts are not postable' USING ERRCODE = '22023';
  END IF;

  IF a.parent_code IS NOT NULL AND a.parent_code = a.account_code THEN
    RAISE EXCEPTION 'account_role: self-parent account rejected' USING ERRCODE = '22023';
  END IF;

  -- cycle guard walking up the hierarchy
  v_code := a.account_code;
  v_parent := a.parent_code;
  WHILE v_parent IS NOT NULL LOOP
    v_depth := v_depth + 1;
    IF v_depth > 20 OR v_parent = a.account_code THEN
      RAISE EXCEPTION 'account_role: cyclic account hierarchy rejected' USING ERRCODE = '22023';
    END IF;
    SELECT p.account_code, p.parent_code INTO v_code, v_parent
      FROM public.accounts p
     WHERE p.user_id = a.user_id AND p.account_code = v_parent;
    EXIT WHEN v_code IS NULL;
  END LOOP;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_account_system_role_v1 ON public.account_system_roles_v1;
CREATE TRIGGER trg_validate_account_system_role_v1
BEFORE INSERT OR UPDATE ON public.account_system_roles_v1
FOR EACH ROW EXECUTE FUNCTION public.validate_account_system_role_v1();

-- Resolver: returns exactly one postable account id or fails closed
CREATE OR REPLACE FUNCTION public.resolve_system_account_role_v1(p_role text, p_owner_id uuid DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_account uuid;
  v_count int;
BEGIN
  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'account_role: tenant could not be resolved' USING ERRCODE = '42501';
  END IF;
  IF p_owner_id IS NOT NULL AND p_owner_id <> v_owner THEN
    RAISE EXCEPTION 'account_role: owner mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_role NOT IN ('ACCOUNTS_RECEIVABLE','SERVICE_SALES_REVENUE') THEN
    RAISE EXCEPTION 'account_role: unsupported role %', p_role USING ERRCODE = '22023';
  END IF;

  SELECT count(*) INTO v_count
    FROM public.account_system_roles_v1 r
    JOIN public.accounts a ON a.id = r.account_id
   WHERE r.owner_id = v_owner AND r.role = p_role
     AND a.user_id = v_owner
     AND COALESCE(a.is_active, true) = true
     AND NOT EXISTS (
       SELECT 1 FROM public.accounts c
        WHERE c.user_id = a.user_id AND c.parent_code = a.account_code
          AND COALESCE(c.is_active, true) = true);

  IF v_count = 0 THEN
    RAISE EXCEPTION 'account_role: role % is not configured for this company', p_role USING ERRCODE = 'P0002';
  ELSIF v_count > 1 THEN
    RAISE EXCEPTION 'account_role: role % is ambiguous for this company', p_role USING ERRCODE = '22023';
  END IF;

  SELECT r.account_id INTO v_account
    FROM public.account_system_roles_v1 r
   WHERE r.owner_id = v_owner AND r.role = p_role;

  RETURN v_account;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_system_account_role_v1(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_system_account_role_v1(text, uuid) TO authenticated, service_role;

-- Customer AR resolution: contact-linked postable account, else company AR role, else fail
CREATE OR REPLACE FUNCTION public.resolve_customer_ar_account_v1(p_contact_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_account uuid;
  v_count int;
BEGIN
  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'account_role: tenant could not be resolved' USING ERRCODE = '42501';
  END IF;

  IF p_contact_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.contacts c WHERE c.id = p_contact_id AND c.user_id = v_owner) THEN
      RAISE EXCEPTION 'account_role: contact does not belong to this company' USING ERRCODE = '42501';
    END IF;

    SELECT count(*) INTO v_count
      FROM public.accounts a
     WHERE a.user_id = v_owner AND a.contact_id = p_contact_id
       AND COALESCE(a.is_active, true) = true
       AND NOT EXISTS (
         SELECT 1 FROM public.accounts c
          WHERE c.user_id = a.user_id AND c.parent_code = a.account_code
            AND COALESCE(c.is_active, true) = true);

    IF v_count = 1 THEN
      SELECT a.id INTO v_account
        FROM public.accounts a
       WHERE a.user_id = v_owner AND a.contact_id = p_contact_id
         AND COALESCE(a.is_active, true) = true
       LIMIT 1;
      RETURN v_account;
    ELSIF v_count > 1 THEN
      RAISE EXCEPTION 'account_role: contact has multiple postable accounts' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN public.resolve_system_account_role_v1('ACCOUNTS_RECEIVABLE', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_customer_ar_account_v1(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resolve_customer_ar_account_v1(uuid) TO authenticated, service_role;

-- Admin-only assignment RPC (no direct table writes for users)
CREATE OR REPLACE FUNCTION public.assign_system_account_role_v1(p_role text, p_account_id uuid, p_notes text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid := public.get_team_owner_id(auth.uid());
  v_id uuid;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'account_role: tenant could not be resolved' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'account_role: only company administrators may assign account roles' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.account_system_roles_v1 (owner_id, role, account_id, notes, assigned_by)
  VALUES (v_owner, p_role, p_account_id, p_notes, auth.uid())
  ON CONFLICT (owner_id, role)
  DO UPDATE SET account_id = EXCLUDED.account_id,
                notes = EXCLUDED.notes,
                assigned_by = EXCLUDED.assigned_by,
                updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_system_account_role_v1(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_system_account_role_v1(text, uuid, text) TO authenticated, service_role;