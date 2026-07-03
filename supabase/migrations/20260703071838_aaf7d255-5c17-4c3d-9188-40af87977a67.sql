
-- =========================================================================
-- SAFE DOCUMENTATION-ONLY MIGRATION
-- No data changes. No policy changes. No permission changes. No FK changes.
-- Only adds COMMENT ON COLUMN metadata + one optional helper function.
-- =========================================================================

DO $$
DECLARE
  r RECORD;
  has_fk BOOLEAN;
  ref_table TEXT;
BEGIN
  -- ---------- user_id columns ----------
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'user_id'
      AND t.table_type = 'BASE TABLE'
  LOOP
    SELECT cf.relname INTO ref_table
    FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
    JOIN pg_class cf ON cf.oid = con.confrelid
    WHERE con.contype = 'f'
      AND con.connamespace = 'public'::regnamespace
      AND con.conrelid = ('public.' || quote_ident(r.table_name))::regclass
      AND a.attname = 'user_id'
    LIMIT 1;

    IF ref_table IS NOT NULL THEN
      EXECUTE format(
        'COMMENT ON COLUMN public.%I.user_id IS %L',
        r.table_name,
        'AUTH USER ID — references auth.users.id. Represents an individual authenticated user (not a tenant).'
      );
    ELSE
      EXECUTE format(
        'COMMENT ON COLUMN public.%I.user_id IS %L',
        r.table_name,
        'TENANT OWNER ID (dataOwnerId) — represents the company/tenant that owns this row. Despite the column name, this is NOT the acting user; it is the tenant scope used by RLS for multi-tenant isolation. Historical naming — kept for backward compatibility.'
      );
    END IF;
    ref_table := NULL;
  END LOOP;

  -- ---------- company_id columns ----------
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'company_id'
      AND t.table_type = 'BASE TABLE'
  LOOP
    SELECT cf.relname INTO ref_table
    FROM pg_constraint con
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
    JOIN pg_class cf ON cf.oid = con.confrelid
    WHERE con.contype = 'f'
      AND con.connamespace = 'public'::regnamespace
      AND con.conrelid = ('public.' || quote_ident(r.table_name))::regclass
      AND a.attname = 'company_id'
    LIMIT 1;

    IF ref_table = 'pos_companies' THEN
      EXECUTE format(
        'COMMENT ON COLUMN public.%I.company_id IS %L',
        r.table_name,
        'POS COMPANY ID — references public.pos_companies.id (POS universe). This is a SEPARATE identifier space from the accounting companies table. Do not join to public.companies.'
      );
    ELSIF ref_table = 'companies' THEN
      EXECUTE format(
        'COMMENT ON COLUMN public.%I.company_id IS %L',
        r.table_name,
        'COMPANY ID — references public.companies.id (accounting/main company registry).'
      );
    ELSE
      EXECUTE format(
        'COMMENT ON COLUMN public.%I.company_id IS %L',
        r.table_name,
        'COMPANY ID — unconstrained; historically points to public.companies.id. Verify usage before joining.'
      );
    END IF;
    ref_table := NULL;
  END LOOP;

  -- ---------- auth_user_id columns ----------
  FOR r IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'auth_user_id'
      AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.auth_user_id IS %L',
      r.table_name,
      'AUTH USER LINK — references auth.users.id. Used to link an internal record (employee, POS user, portal user) to a Supabase Auth login account.'
    );
  END LOOP;

  -- ---------- owner_id columns ----------
  FOR r IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'owner_id'
      AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.owner_id IS %L',
      r.table_name,
      'ENTITY OWNER — references auth.users.id. Represents the owning user/account of this entity (e.g., company owner). Used together with user_id (tenant) in some tables.'
    );
  END LOOP;

  -- ---------- created_by columns ----------
  FOR r IN
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'created_by'
      AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format(
      'COMMENT ON COLUMN public.%I.created_by IS %L',
      r.table_name,
      'AUDIT — user who created this row. Informational only; NOT used for RLS tenant isolation.'
    );
  END LOOP;
END $$;

-- =========================================================================
-- Optional helper function — future-facing, not wired into any policy today.
-- Safe to add: no policy references it, so nothing changes at runtime.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.get_current_tenant_owner_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Resolves the tenant (dataOwnerId) for the currently authenticated user.
  -- 1) If user IS a tenant owner, return their own auth uid.
  -- 2) Else resolve via profiles.company_id -> companies.owner_id.
  SELECT COALESCE(
    (SELECT c.owner_id FROM public.companies c WHERE c.owner_id = auth.uid() LIMIT 1),
    (SELECT c.owner_id
       FROM public.profiles p
       JOIN public.companies c ON c.id = p.company_id
      WHERE p.user_id = auth.uid()
      LIMIT 1)
  );
$$;

COMMENT ON FUNCTION public.get_current_tenant_owner_id() IS
'Returns the tenant owner id (dataOwnerId) for the currently authenticated user. Future-facing helper — not referenced by any existing RLS policy. Safe to adopt gradually in new policies.';

GRANT EXECUTE ON FUNCTION public.get_current_tenant_owner_id() TO authenticated, service_role;
