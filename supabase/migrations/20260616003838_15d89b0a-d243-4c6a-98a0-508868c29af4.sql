
CREATE OR REPLACE FUNCTION public.sa_resolve_account(
  p_role           text,
  p_fallback_code  text,
  p_data_owner_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_acc record;
  v_kids int;
  v_source text;
  v_candidates jsonb;
BEGIN
  IF p_data_owner_id IS NULL THEN
    RETURN jsonb_build_object('status','missing','account_id',NULL,'account_code',NULL,
                              'account_name',NULL,'candidates','[]'::jsonb,'source','no_tenant');
  END IF;

  -- Priority 1: code-first
  IF p_fallback_code IS NOT NULL AND length(trim(p_fallback_code)) > 0 THEN
    SELECT a.id, a.account_code, a.account_name
      INTO v_acc
      FROM public.accounts a
     WHERE a.user_id = p_data_owner_id
       AND a.account_code = p_fallback_code
     LIMIT 1;
    v_source := 'code_fallback';
  END IF;

  -- Priority 2: system_role
  IF v_acc.id IS NULL AND p_role IS NOT NULL AND length(trim(p_role)) > 0 THEN
    SELECT a.id, a.account_code, a.account_name
      INTO v_acc
      FROM public.accounts a
     WHERE a.user_id = p_data_owner_id
       AND a.system_role::text = p_role
     ORDER BY a.account_code
     LIMIT 1;
    v_source := 'system_role';
  END IF;

  IF v_acc.id IS NULL THEN
    RETURN jsonb_build_object(
      'status','missing','account_id',NULL,
      'account_code', p_fallback_code,
      'account_name',NULL,'candidates','[]'::jsonb,
      'source', COALESCE(v_source,'none')
    );
  END IF;

  SELECT count(*) INTO v_kids
    FROM public.accounts c
   WHERE c.user_id = p_data_owner_id
     AND c.parent_code = v_acc.account_code;

  IF v_kids = 0 THEN
    RETURN jsonb_build_object(
      'status','resolved',
      'account_id', v_acc.id,
      'account_code', v_acc.account_code,
      'account_name', v_acc.account_name,
      'candidates','[]'::jsonb,
      'source', v_source
    );
  END IF;

  WITH RECURSIVE descendants AS (
    SELECT a.id, a.account_code, a.account_name
      FROM public.accounts a
     WHERE a.user_id = p_data_owner_id
       AND a.parent_code = v_acc.account_code
    UNION ALL
    SELECT ch.id, ch.account_code, ch.account_name
      FROM public.accounts ch
      JOIN descendants d ON ch.parent_code = d.account_code
     WHERE ch.user_id = p_data_owner_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'account_id',   d.id,
           'account_code', d.account_code,
           'account_name', d.account_name
         ) ORDER BY d.account_code), '[]'::jsonb)
    INTO v_candidates
    FROM descendants d
   WHERE NOT EXISTS (
     SELECT 1 FROM public.accounts cc
      WHERE cc.user_id = p_data_owner_id
        AND cc.parent_code = d.account_code
   );

  RETURN jsonb_build_object(
    'status','ambiguous','account_id',NULL,
    'account_code', v_acc.account_code,
    'account_name', v_acc.account_name,
    'candidates', v_candidates,
    'source', v_source
  );
END;
$$;

COMMENT ON FUNCTION public.sa_resolve_account(text,text,uuid) IS
$c$Smart-Accountant strict-leaf resolver.
Lookup priority: fallback_code → system_role.
SECURITY INVOKER — tenant isolation enforced via RLS on public.accounts (no explicit
is_team_member guard needed since the caller cannot read accounts they have no RLS access to).
STRICT-LEAF rule: a parent with ANY children (incl. exactly one) returns status=ambiguous
with candidates[] = all leaf descendants. NO single-child collapse — rationale: "single
child" is a transient state, not structural; adding a sibling via the COA module would
silently flip the resolver from resolved→ambiguous with no code/seed change. Concrete risk
example: 3100 (Capital) whose only child is 3150 (Statutory Reserve) — a collapse would
silently misclassify owner capital as a reserve.$c$;
