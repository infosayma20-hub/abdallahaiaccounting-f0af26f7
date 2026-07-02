
-- ============================================================
-- POS Shift Audit — Phase 1 (safe scaffolding, no behavior change on approve)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pos_shift_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,                    -- data owner (tenant)
  session_id uuid NOT NULL REFERENCES public.pos_sessions(id) ON DELETE CASCADE,
  terminal_id uuid,
  cashier_name text,
  cashier_auth_user_id uuid,
  cashier_employee_id uuid,
  opened_at timestamptz,
  closed_at timestamptz,

  -- Variances per currency (positive = surplus, negative = shortage)
  variance_ils numeric NOT NULL DEFAULT 0,
  variance_usd numeric NOT NULL DEFAULT 0,
  variance_jod numeric NOT NULL DEFAULT 0,
  variance_total_ils numeric NOT NULL DEFAULT 0,

  expected_cash_ils numeric,
  actual_cash_ils numeric,

  -- Workflow
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','void')),
  -- Resolution decision chosen by accountant (Phase 2 will expand options).
  -- Default 'employee_wallet' = current behavior.
  resolution_type text NOT NULL DEFAULT 'employee_wallet'
    CHECK (resolution_type IN (
      'employee_wallet',      -- current: posted on employee account
      'company_expense',      -- Phase 2: shortage as company expense
      'company_revenue',      -- Phase 2: surplus as company revenue
      'employee_fine',        -- Phase 2: surplus also fined on employee
      'split',                -- Phase 2: partial
      'deferred'              -- keep pending for later review
    )),
  resolution_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  accountant_notes text,

  approved_by uuid,
  approved_at timestamptz,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pos_shift_audits_session_unique UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS idx_pos_shift_audits_user_status
  ON public.pos_shift_audits (user_id, status, closed_at DESC);
CREATE INDEX IF NOT EXISTS idx_pos_shift_audits_cashier
  ON public.pos_shift_audits (cashier_auth_user_id);

-- Grants (roles-based; RLS still applies)
GRANT SELECT, INSERT, UPDATE ON public.pos_shift_audits TO authenticated;
GRANT ALL ON public.pos_shift_audits TO service_role;

ALTER TABLE public.pos_shift_audits ENABLE ROW LEVEL SECURITY;

-- Cashier can read their own audit rows
CREATE POLICY "cashier_reads_own_audit"
ON public.pos_shift_audits
FOR SELECT
TO authenticated
USING (
  cashier_auth_user_id = auth.uid()
  OR user_id = auth.uid()
);

-- Admin / accountant_senior of the tenant can read/insert/update
CREATE POLICY "admin_accountant_full_audit"
ON public.pos_shift_audits
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'accountant_senior')
)
WITH CHECK (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'accountant_senior')
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_pos_shift_audits_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pos_shift_audits_touch ON public.pos_shift_audits;
CREATE TRIGGER trg_pos_shift_audits_touch
BEFORE UPDATE ON public.pos_shift_audits
FOR EACH ROW EXECUTE FUNCTION public.tg_pos_shift_audits_touch();


-- ============================================================
-- RPC: approve_pos_shift_audit
--   Phase 1: only supports resolution_type = 'employee_wallet'
--   (mirrors current 3 inserts done previously in POSPage.tsx).
--   Other resolution_types return NOT_IMPLEMENTED_YET so we
--   can safely wire the UI without accidentally posting a
--   wrong journal.
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_pos_shift_audit(
  p_audit_id uuid,
  p_resolution_type text DEFAULT NULL,
  p_resolution_payload jsonb DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_audit pos_shift_audits%ROWTYPE;
  v_session pos_sessions%ROWTYPE;
  v_resolution text;
  v_variance_ils numeric;
  v_abs numeric;
  v_is_shortage boolean;
  v_emp_id uuid;
  v_emp_name text;
  v_contact_id uuid;
  v_ref text;
  v_now timestamptz := now();
BEGIN
  -- Auth: admin or accountant_senior only
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'accountant_senior')
  ) THEN
    RAISE EXCEPTION 'NOT_AUTHORIZED_TO_APPROVE_SHIFT_AUDIT' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_audit FROM pos_shift_audits WHERE id = p_audit_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'AUDIT_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  IF v_audit.status = 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'ALREADY_APPROVED');
  END IF;

  v_resolution := COALESCE(p_resolution_type, v_audit.resolution_type, 'employee_wallet');

  -- Phase 1 support gate
  IF v_resolution <> 'employee_wallet' AND v_resolution <> 'deferred' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'NOT_IMPLEMENTED_YET',
      'message', 'هذا الخيار سيتوفر في المرحلة 2 (الإيراد/المخالفة/التسوية الجزئية)'
    );
  END IF;

  IF v_resolution = 'deferred' THEN
    UPDATE pos_shift_audits
       SET resolution_type = 'deferred',
           resolution_payload = COALESCE(p_resolution_payload, resolution_payload),
           accountant_notes = COALESCE(p_notes, accountant_notes)
     WHERE id = p_audit_id;
    RETURN jsonb_build_object('success', true, 'status', 'deferred');
  END IF;

  -- ---------- employee_wallet: replicate legacy behavior ----------
  SELECT * INTO v_session FROM pos_sessions WHERE id = v_audit.session_id;

  v_variance_ils := COALESCE(v_audit.variance_total_ils, 0);
  v_abs := ABS(v_variance_ils);
  v_is_shortage := v_variance_ils < 0;
  v_ref := 'SHIFT-' || substr(v_audit.session_id::text, 1, 8);

  IF v_abs > 0 AND v_audit.cashier_auth_user_id IS NOT NULL THEN
    SELECT id, full_name INTO v_emp_id, v_emp_name
      FROM employees
     WHERE auth_user_id = v_audit.cashier_auth_user_id
       AND is_active = true
     LIMIT 1;

    IF v_emp_id IS NOT NULL THEN
      SELECT id INTO v_contact_id
        FROM contacts
       WHERE user_id = v_audit.user_id
         AND contact_name = v_emp_name
       LIMIT 1;

      -- 1) HR deduction
      INSERT INTO employee_deductions(
        user_id, employee_id, deduction_type, amount, description,
        deduction_date, notes
      ) VALUES (
        v_audit.user_id, v_emp_id,
        CASE WHEN v_is_shortage THEN 'عجز صندوق' ELSE 'فائض صندوق' END,
        v_abs,
        (CASE WHEN v_is_shortage THEN 'عجز' ELSE 'فائض' END)
          || ' وردية POS - ' || COALESCE(v_audit.cashier_name, '') ||
          ' - معتمد ' || to_char(v_now, 'YYYY-MM-DD'),
        v_now::date,
        'جلسة: ' || v_audit.session_id::text || ' | تدقيق: ' || p_audit_id::text
      );

      -- 2) Accounting entry
      INSERT INTO transactions(
        user_id, transaction_date, description,
        debit_account_code, credit_account_code,
        amount, currency, transaction_type,
        contact_id, reference, idempotency_key
      ) VALUES (
        v_audit.user_id, v_now::date,
        (CASE WHEN v_is_shortage THEN 'عجز' ELSE 'فائض' END)
          || ' صندوق - ' || COALESCE(v_audit.cashier_name, ''),
        CASE WHEN v_is_shortage THEN '1130' ELSE '1110' END,
        CASE WHEN v_is_shortage THEN '1110' ELSE '1130' END,
        v_abs, 'شيكل',
        CASE WHEN v_is_shortage THEN 'cash_shortage' ELSE 'cash_surplus' END,
        v_contact_id, v_ref,
        'SHIFT-VAR-' || v_audit.session_id::text
      )
      ON CONFLICT (idempotency_key) DO NOTHING;

      -- 3) Employee financial movement
      INSERT INTO employee_financial_movements(
        user_id, employee_id, source_type, source_id,
        source_reference, reference_number, category, description,
        amount, movement_type, status, movement_date,
        salary_month, salary_year, created_by, notes
      ) VALUES (
        v_audit.user_id, v_emp_id, 'pos_shortage', v_audit.session_id,
        v_ref, v_ref,
        CASE WHEN v_is_shortage THEN 'cash_shortage' ELSE 'cash_surplus' END,
        (CASE WHEN v_is_shortage THEN 'عجز' ELSE 'فائض' END)
          || ' صندوق - وردية ' || to_char(COALESCE(v_audit.opened_at, v_now), 'YYYY-MM-DD'),
        v_abs,
        CASE WHEN v_is_shortage THEN 'debit' ELSE 'credit' END,
        'approved', v_now::date,
        extract(month FROM v_now)::int,
        extract(year  FROM v_now)::int,
        auth.uid(),
        'اعتمدت من المحاسب. ' || COALESCE(p_notes, '')
      );
    END IF;
  END IF;

  UPDATE pos_shift_audits
     SET status = 'approved',
         resolution_type = 'employee_wallet',
         resolution_payload = COALESCE(p_resolution_payload, resolution_payload),
         accountant_notes = COALESCE(p_notes, accountant_notes),
         approved_by = auth.uid(),
         approved_at = v_now
   WHERE id = p_audit_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'approved',
    'variance_ils', v_variance_ils,
    'employee_id', v_emp_id
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.approve_pos_shift_audit(uuid, text, jsonb, text) TO authenticated;
