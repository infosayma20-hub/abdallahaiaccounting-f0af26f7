
-- ============================================================
-- Smart Accountant — Phase 2: drafts + post RPC (dry-run capable)
-- ============================================================

-- 1) Drafts table (per-tenant)
CREATE TABLE public.smart_accountant_drafts (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL,
  category_code           text NOT NULL REFERENCES public.smart_accountant_categories(code),
  description             text NOT NULL,
  amount                  numeric NOT NULL CHECK (amount > 0),
  currency                text NOT NULL DEFAULT 'شيكل',
  foreign_amount          numeric,
  exchange_rate           numeric,
  transaction_date        date NOT NULL DEFAULT CURRENT_DATE,
  contact_id              uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  workshop_id             uuid REFERENCES public.workshops(id) ON DELETE SET NULL,
  cost_center_id          uuid REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  reference               text,
  notes                   text,
  -- chosen accounts (filled when ambiguity is resolved by user)
  debit_account_id        uuid REFERENCES public.accounts(id) ON DELETE RESTRICT,
  credit_account_id       uuid REFERENCES public.accounts(id) ON DELETE RESTRICT,
  -- resolver output cache (for UI replay)
  debit_resolver_state    jsonb,
  credit_resolver_state   jsonb,
  -- workflow
  status                  text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','ready','posted','cancelled')),
  posted_transaction_id   uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  posted_at               timestamptz,
  -- provenance (for AI agent traceability)
  source                  text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','voice','text','ai')),
  source_text             text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sa_drafts_user_status ON public.smart_accountant_drafts(user_id, status);
CREATE INDEX idx_sa_drafts_category    ON public.smart_accountant_drafts(category_code);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.smart_accountant_drafts TO authenticated;
GRANT ALL ON public.smart_accountant_drafts TO service_role;

ALTER TABLE public.smart_accountant_drafts ENABLE ROW LEVEL SECURITY;

CREATE POLICY sad_team_select ON public.smart_accountant_drafts
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY sad_team_insert ON public.smart_accountant_drafts
  FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE POLICY sad_team_update ON public.smart_accountant_drafts
  FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- Block delete on posted drafts; team can delete others
CREATE POLICY sad_team_delete ON public.smart_accountant_drafts
  FOR DELETE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id) AND status <> 'posted');

CREATE TRIGGER trg_sad_updated_at
  BEFORE UPDATE ON public.smart_accountant_drafts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Post RPC (dry-run capable)
CREATE OR REPLACE FUNCTION public.sa_post_journal_voucher(
  p_draft_id uuid,
  p_dry_run  boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_draft   record;
  v_caller  uuid := auth.uid();
  v_d_acc   record;
  v_c_acc   record;
  v_d_kids  int;
  v_c_kids  int;
  v_idem    text;
  v_tx_id   uuid;
  v_payload jsonb;
  v_cat     record;
BEGIN
  -- Load draft
  SELECT * INTO v_draft FROM public.smart_accountant_drafts WHERE id = p_draft_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'draft_not_found', 'draft_id', p_draft_id);
  END IF;

  -- Authorization: caller must be team member (skip when no auth context = service_role/test)
  IF v_caller IS NOT NULL AND NOT public.is_team_member(v_caller, v_draft.user_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  -- Status guard
  IF v_draft.status <> 'ready' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status',
                              'current_status', v_draft.status,
                              'expected', 'ready');
  END IF;

  -- Both accounts must be chosen
  IF v_draft.debit_account_id IS NULL OR v_draft.credit_account_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'accounts_missing');
  END IF;

  -- Load accounts and verify tenant match
  SELECT id, user_id, account_code, account_name
    INTO v_d_acc FROM public.accounts WHERE id = v_draft.debit_account_id;
  SELECT id, user_id, account_code, account_name
    INTO v_c_acc FROM public.accounts WHERE id = v_draft.credit_account_id;

  IF v_d_acc.user_id IS DISTINCT FROM v_draft.user_id
     OR v_c_acc.user_id IS DISTINCT FROM v_draft.user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cross_tenant_account');
  END IF;

  -- Strict-leaf: neither side may be a parent account
  SELECT count(*) INTO v_d_kids FROM public.accounts
    WHERE user_id = v_draft.user_id AND parent_code = v_d_acc.account_code;
  SELECT count(*) INTO v_c_kids FROM public.accounts
    WHERE user_id = v_draft.user_id AND parent_code = v_c_acc.account_code;

  IF v_d_kids > 0 OR v_c_kids > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'parent_account_forbidden',
                              'debit_is_parent',  v_d_kids > 0,
                              'credit_is_parent', v_c_kids > 0);
  END IF;

  -- Load category for posting metadata
  SELECT * INTO v_cat FROM public.smart_accountant_categories WHERE code = v_draft.category_code;

  v_idem := 'sa_draft:' || p_draft_id::text;

  -- Build the payload
  v_payload := jsonb_build_object(
    'user_id',             v_draft.user_id,
    'transaction_date',    v_draft.transaction_date,
    'description',         v_draft.description,
    'debit_account_code',  v_d_acc.account_code,
    'credit_account_code', v_c_acc.account_code,
    'account_id_debit',    v_d_acc.id,
    'account_id_credit',   v_c_acc.id,
    'amount',              v_draft.amount,
    'currency',            v_draft.currency,
    'foreign_amount',      v_draft.foreign_amount,
    'exchange_rate',       v_draft.exchange_rate,
    'transaction_type',    'قيد يومية',
    'reference',           COALESCE(v_draft.reference, 'SA-' || substr(p_draft_id::text, 1, 8)),
    'notes',               v_draft.notes,
    'contact_id',          v_draft.contact_id,
    'workshop_id',         v_draft.workshop_id,
    'cost_center_id',      v_draft.cost_center_id,
    'idempotency_key',     v_idem,
    'category_code',       v_draft.category_code,
    'posting_target',      v_cat.posting_target
  );

  -- Dry-run: validate only, return what would be posted
  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'ok', true,
      'dry_run', true,
      'would_post', v_payload,
      'idempotency_key', v_idem
    );
  END IF;

  -- Live posting (Phase 3 path)
  -- Idempotency check (defense in depth alongside unique index)
  SELECT id INTO v_tx_id FROM public.transactions WHERE idempotency_key = v_idem LIMIT 1;
  IF v_tx_id IS NOT NULL THEN
    -- Already posted → return existing
    UPDATE public.smart_accountant_drafts
       SET status = 'posted',
           posted_transaction_id = v_tx_id,
           posted_at = COALESCE(posted_at, now())
     WHERE id = p_draft_id AND status <> 'posted';
    RETURN jsonb_build_object('ok', true, 'dry_run', false, 'idempotent_hit', true,
                              'transaction_id', v_tx_id);
  END IF;

  INSERT INTO public.transactions (
    user_id, transaction_date, description,
    debit_account_code, credit_account_code,
    account_id_debit, account_id_credit,
    amount, currency, foreign_amount, exchange_rate,
    transaction_type, reference, notes,
    contact_id, workshop_id, cost_center_id,
    idempotency_key
  ) VALUES (
    v_draft.user_id, v_draft.transaction_date, v_draft.description,
    v_d_acc.account_code, v_c_acc.account_code,
    v_d_acc.id, v_c_acc.id,
    v_draft.amount, v_draft.currency, v_draft.foreign_amount, v_draft.exchange_rate,
    'قيد يومية',
    COALESCE(v_draft.reference, 'SA-' || substr(p_draft_id::text, 1, 8)),
    v_draft.notes,
    v_draft.contact_id, v_draft.workshop_id, v_draft.cost_center_id,
    v_idem
  ) RETURNING id INTO v_tx_id;

  UPDATE public.smart_accountant_drafts
     SET status = 'posted',
         posted_transaction_id = v_tx_id,
         posted_at = now()
   WHERE id = p_draft_id;

  RETURN jsonb_build_object(
    'ok', true,
    'dry_run', false,
    'transaction_id', v_tx_id,
    'idempotency_key', v_idem
  );
END;
$$;

COMMENT ON FUNCTION public.sa_post_journal_voucher(uuid, boolean) IS
$c$Phase 2 RPC: posts a 'ready' smart-accountant draft into transactions as a single
balanced JV row. SECURITY DEFINER (needs to write transactions while preserving the
caller's identity check via is_team_member). Defaults to p_dry_run=true — Phase 2
exercises the dry-run path only; live posting becomes active in Phase 3.
Guards: status=ready, both account_ids present, same tenant, strict-leaf (no parent
account postable), idempotency via key 'sa_draft:'||draft_id.$c$;

GRANT EXECUTE ON FUNCTION public.sa_post_journal_voucher(uuid, boolean) TO authenticated;
