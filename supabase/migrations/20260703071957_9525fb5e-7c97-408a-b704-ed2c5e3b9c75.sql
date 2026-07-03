
-- =========================================================================
-- PHASE 2: SAFE DOCUMENTATION VIEWS + OPTIONAL HELPERS
-- No table data, no policies, no grants changed on existing objects.
-- =========================================================================

-- ---------- 1) Identity column dictionary ----------
CREATE OR REPLACE VIEW public.v_identity_column_dictionary AS
SELECT
  c.table_name,
  c.column_name,
  CASE c.column_name
    WHEN 'user_id' THEN
      CASE WHEN EXISTS (
        SELECT 1 FROM pg_constraint con
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
        WHERE con.contype='f' AND con.connamespace='public'::regnamespace
          AND con.conrelid = ('public.'||quote_ident(c.table_name))::regclass
          AND a.attname='user_id'
      ) THEN 'AUTH USER' ELSE 'TENANT OWNER (dataOwnerId)' END
    WHEN 'company_id' THEN
      COALESCE((
        SELECT cf.relname FROM pg_constraint con
        JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = ANY(con.conkey)
        JOIN pg_class cf ON cf.oid = con.confrelid
        WHERE con.contype='f' AND con.connamespace='public'::regnamespace
          AND con.conrelid = ('public.'||quote_ident(c.table_name))::regclass
          AND a.attname='company_id' LIMIT 1
      ), 'COMPANY (unconstrained)')
    WHEN 'auth_user_id' THEN 'AUTH USER LINK'
    WHEN 'owner_id' THEN 'ENTITY OWNER'
    WHEN 'created_by' THEN 'AUDIT (not RLS)'
  END AS role_meaning,
  c.is_nullable,
  c.data_type
FROM information_schema.columns c
JOIN information_schema.tables t
  ON t.table_schema=c.table_schema AND t.table_name=c.table_name
WHERE c.table_schema='public'
  AND t.table_type='BASE TABLE'
  AND c.column_name IN ('user_id','company_id','owner_id','auth_user_id','created_by')
ORDER BY c.table_name, c.column_name;

COMMENT ON VIEW public.v_identity_column_dictionary IS
'Read-only documentation view: explains the meaning of each identity/ownership column across the schema. Safe for developers to query.';

GRANT SELECT ON public.v_identity_column_dictionary TO authenticated, service_role;

-- ---------- 2) Tenant scope map (which column carries the tenant) ----------
CREATE OR REPLACE VIEW public.v_tenant_scope_map AS
WITH cols AS (
  SELECT c.table_name, c.column_name
  FROM information_schema.columns c
  JOIN information_schema.tables t
    ON t.table_schema=c.table_schema AND t.table_name=c.table_name
  WHERE c.table_schema='public'
    AND t.table_type='BASE TABLE'
    AND c.column_name IN ('user_id','company_id','owner_id')
)
SELECT
  table_name,
  MAX(CASE WHEN column_name='user_id' THEN 'user_id' END)     AS has_user_id,
  MAX(CASE WHEN column_name='company_id' THEN 'company_id' END) AS has_company_id,
  MAX(CASE WHEN column_name='owner_id' THEN 'owner_id' END)   AS has_owner_id,
  COALESCE(
    MAX(CASE WHEN column_name='user_id' THEN 'user_id' END),
    MAX(CASE WHEN column_name='owner_id' THEN 'owner_id' END),
    MAX(CASE WHEN column_name='company_id' THEN 'company_id' END)
  ) AS effective_tenant_column
FROM cols
GROUP BY table_name
ORDER BY table_name;

COMMENT ON VIEW public.v_tenant_scope_map IS
'Read-only: identifies the effective tenant/owner column for each table. Priority: user_id > owner_id > company_id (matches the historical dataOwnerId convention).';

GRANT SELECT ON public.v_tenant_scope_map TO authenticated, service_role;

-- ---------- 3) Optional helper: is the current user a tenant owner? ----------
CREATE OR REPLACE FUNCTION public.is_tenant_owner(_tenant_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND auth.uid() = _tenant_owner_id;
$$;

COMMENT ON FUNCTION public.is_tenant_owner(uuid) IS
'Helper: returns true when the currently authenticated user equals the given tenant owner id. Not wired into any existing policy — safe to adopt in new code only.';

GRANT EXECUTE ON FUNCTION public.is_tenant_owner(uuid) TO authenticated, service_role;
