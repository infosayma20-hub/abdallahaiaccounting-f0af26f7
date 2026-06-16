
-- ════════════════════════════════════════════════════════════════════════
-- Smart Accountant Phase 1: Classification Layer (Zero Ledger Risk)
-- ════════════════════════════════════════════════════════════════════════
-- This migration creates the classification/staging layer for the Smart
-- Accountant. NO ledger writes. NO transactions. Read-only resolver.
--
-- Rules (per v3 audit contract):
--   - Lookup priority: preferred_code → *_code_fallback → *_role
--   - Strict-leaf: parent accounts (even with 1 child) return 'ambiguous'.
--     No auto-collapse. Rationale: deterministic resolver behavior across
--     COA mutations. A new sibling must never silently change R→A.
--   - Resolver is SECURITY INVOKER. RLS on accounts isolates per tenant.
--   - Category save is independent of resolver result. M/A categories
--     are saved and active; resolver only labels their state.
-- ════════════════════════════════════════════════════════════════════════

-- 1) Classification table
CREATE TABLE IF NOT EXISTS public.smart_accountant_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,                          -- SALE, CAPITAL, FABRIC, ...
  name_ar text NOT NULL,
  description_ar text,

  -- Hybrid mapping: role first try, code as fallback
  debit_role text,                             -- nullable; e.g. 'cash', 'raw_materials_inventory'
  debit_code_fallback text,                    -- nullable; e.g. '1110', '1310'
  credit_role text,
  credit_code_fallback text,

  -- Ambiguity storage policy (NOT a posting gate)
  --   'auto_remember'    : user pick is saved as silent default (cash/bank/etc)
  --   'explicit_confirm' : user must consciously confirm every post (sales/capital)
  ambiguity_resolution_policy text NOT NULL DEFAULT 'auto_remember'
    CHECK (ambiguity_resolution_policy IN ('auto_remember','explicit_confirm')),

  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (user_id, code)
);

-- 2) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_accountant_categories TO authenticated;
GRANT ALL ON public.smart_accountant_categories TO service_role;

-- 3) RLS
ALTER TABLE public.smart_accountant_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sa_cat_select_team"
  ON public.smart_accountant_categories FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "sa_cat_insert_team"
  ON public.smart_accountant_categories FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "sa_cat_update_team"
  ON public.smart_accountant_categories FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "sa_cat_delete_team"
  ON public.smart_accountant_categories FOR DELETE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

-- 4) updated_at trigger
CREATE TRIGGER trg_sa_cat_updated_at
  BEFORE UPDATE ON public.smart_accountant_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ════════════════════════════════════════════════════════════════════════
-- 5) Resolver function (read-only)
-- ════════════════════════════════════════════════════════════════════════
-- Returns jsonb:
--   { status: 'resolved'|'ambiguous'|'missing',
--     account_id: uuid|null,
--     account_code: text|null,
--     account_name: text|null,
--     candidates: jsonb[]  -- only when status='ambiguous'
--   }
--
-- Lookup priority (per v3 contract):
--   1) p_preferred_code (explicit override) — must be a leaf
--   2) p_code_fallback  — must be a leaf
--   3) p_role           — must resolve to exactly one leaf
--
-- Strict-leaf rule: a parent account (children count > 0) NEVER auto-resolves,
-- even with a single child. Returns ambiguous with structured candidates.
-- ════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.sa_resolve_account(
  p_user_id uuid,
  p_role text DEFAULT NULL,
  p_code_fallback text DEFAULT NULL,
  p_preferred_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_account record;
  v_kids int;
  v_candidates jsonb;
  v_match_count int;
BEGIN
  -- ── Priority 1: explicit preferred_code override ─────────────────────
  IF p_preferred_code IS NOT NULL AND length(trim(p_preferred_code)) > 0 THEN
    SELECT a.id, a.account_code, a.account_name
      INTO v_account
      FROM public.accounts a
     WHERE a.user_id = p_user_id
       AND a.account_code = p_preferred_code
     LIMIT 1;

    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'status','missing',
        'account_id', NULL,
        'account_code', p_preferred_code,
        'account_name', NULL,
        'source','preferred_code'
      );
    END IF;

    SELECT count(*) INTO v_kids
      FROM public.accounts c
     WHERE c.user_id = p_user_id
       AND c.parent_code = v_account.account_code;

    IF v_kids = 0 THEN
      RETURN jsonb_build_object(
        'status','resolved',
        'account_id', v_account.id,
        'account_code', v_account.account_code,
        'account_name', v_account.account_name,
        'source','preferred_code'
      );
    END IF;

    -- parent → ambiguous with leaf candidates
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id,
             'code', c.account_code,
             'name', c.account_name
           ) ORDER BY c.account_code), '[]'::jsonb)
      INTO v_candidates
      FROM public.accounts c
     WHERE c.user_id = p_user_id
       AND c.parent_code = v_account.account_code
       AND NOT EXISTS (
         SELECT 1 FROM public.accounts cc
         WHERE cc.user_id = p_user_id AND cc.parent_code = c.account_code
       );

    RETURN jsonb_build_object(
      'status','ambiguous',
      'account_id', NULL,
      'account_code', v_account.account_code,
      'account_name', v_account.account_name,
      'candidates', v_candidates,
      'source','preferred_code'
    );
  END IF;

  -- ── Priority 2: code fallback (real path for ~95% of tenants) ────────
  IF p_code_fallback IS NOT NULL AND length(trim(p_code_fallback)) > 0 THEN
    SELECT a.id, a.account_code, a.account_name
      INTO v_account
      FROM public.accounts a
     WHERE a.user_id = p_user_id
       AND a.account_code = p_code_fallback
     LIMIT 1;

    IF NOT FOUND THEN
      -- fall through to role lookup
      NULL;
    ELSE
      SELECT count(*) INTO v_kids
        FROM public.accounts c
       WHERE c.user_id = p_user_id
         AND c.parent_code = v_account.account_code;

      IF v_kids = 0 THEN
        RETURN jsonb_build_object(
          'status','resolved',
          'account_id', v_account.id,
          'account_code', v_account.account_code,
          'account_name', v_account.account_name,
          'source','code_fallback'
        );
      END IF;

      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', c.id,
               'code', c.account_code,
               'name', c.account_name
             ) ORDER BY c.account_code), '[]'::jsonb)
        INTO v_candidates
        FROM public.accounts c
       WHERE c.user_id = p_user_id
         AND c.parent_code = v_account.account_code
         AND NOT EXISTS (
           SELECT 1 FROM public.accounts cc
           WHERE cc.user_id = p_user_id AND cc.parent_code = c.account_code
         );

      RETURN jsonb_build_object(
        'status','ambiguous',
        'account_id', NULL,
        'account_code', v_account.account_code,
        'account_name', v_account.account_name,
        'candidates', v_candidates,
        'source','code_fallback'
      );
    END IF;
  END IF;

  -- ── Priority 3: system_role (last resort) ────────────────────────────
  IF p_role IS NOT NULL AND length(trim(p_role)) > 0 THEN
    SELECT count(*) INTO v_match_count
      FROM public.accounts a
     WHERE a.user_id = p_user_id
       AND a.system_role = p_role
       AND NOT EXISTS (
         SELECT 1 FROM public.accounts c
         WHERE c.user_id = p_user_id AND c.parent_code = a.account_code
       );

    IF v_match_count = 1 THEN
      SELECT a.id, a.account_code, a.account_name
        INTO v_account
        FROM public.accounts a
       WHERE a.user_id = p_user_id
         AND a.system_role = p_role
         AND NOT EXISTS (
           SELECT 1 FROM public.accounts c
           WHERE c.user_id = p_user_id AND c.parent_code = a.account_code
         )
       LIMIT 1;

      RETURN jsonb_build_object(
        'status','resolved',
        'account_id', v_account.id,
        'account_code', v_account.account_code,
        'account_name', v_account.account_name,
        'source','system_role'
      );
    ELSIF v_match_count > 1 THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', a.id,
               'code', a.account_code,
               'name', a.account_name
             ) ORDER BY a.account_code), '[]'::jsonb)
        INTO v_candidates
        FROM public.accounts a
       WHERE a.user_id = p_user_id
         AND a.system_role = p_role
         AND NOT EXISTS (
           SELECT 1 FROM public.accounts c
           WHERE c.user_id = p_user_id AND c.parent_code = a.account_code
         );

      RETURN jsonb_build_object(
        'status','ambiguous',
        'account_id', NULL,
        'account_code', NULL,
        'account_name', NULL,
        'candidates', v_candidates,
        'source','system_role'
      );
    END IF;
  END IF;

  -- Nothing matched on any priority
  RETURN jsonb_build_object(
    'status','missing',
    'account_id', NULL,
    'account_code', p_code_fallback,
    'account_name', NULL,
    'source','none'
  );
END;
$$;

COMMENT ON FUNCTION public.sa_resolve_account(uuid, text, text, text) IS
$cmt$
Smart Accountant account resolver. Read-only.

Lookup priority:
  1. p_preferred_code (explicit override) — leaf required
  2. p_code_fallback  — leaf required
  3. p_role (system_role) — must match exactly one leaf

STRICT-LEAF RULE: A parent account (any children > 0) is NEVER auto-resolved,
even with a single child. Returns 'ambiguous' with structured candidates[].
Rationale: deterministic resolver behavior across COA mutations. A newly
added sibling must never silently flip a previously-resolved category.

SECURITY INVOKER: relies on RLS on public.accounts for tenant isolation.

Returns jsonb:
  { status: 'resolved'|'ambiguous'|'missing',
    account_id: uuid|null,
    account_code: text|null,
    account_name: text|null,
    candidates: jsonb[],   -- present when status='ambiguous'
    source: 'preferred_code'|'code_fallback'|'system_role'|'none' }
$cmt$;

GRANT EXECUTE ON FUNCTION public.sa_resolve_account(uuid, text, text, text) TO authenticated, service_role;
