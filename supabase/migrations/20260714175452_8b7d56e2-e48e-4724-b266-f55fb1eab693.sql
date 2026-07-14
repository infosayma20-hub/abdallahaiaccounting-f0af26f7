
CREATE TABLE public.pos_shift_foreign_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.pos_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  currency text NOT NULL CHECK (currency IN ('JOD','USD')),
  foreign_amount numeric(14,2) NOT NULL CHECK (foreign_amount <> 0),
  exchange_rate numeric(14,6) NOT NULL CHECK (exchange_rate > 0),
  ils_equivalent numeric(14,2) GENERATED ALWAYS AS (foreign_amount * exchange_rate) STORED,
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pos_shift_fadj_session ON public.pos_shift_foreign_adjustments(session_id);
CREATE INDEX idx_pos_shift_fadj_owner ON public.pos_shift_foreign_adjustments(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_shift_foreign_adjustments TO authenticated;
GRANT ALL ON public.pos_shift_foreign_adjustments TO service_role;

ALTER TABLE public.pos_shift_foreign_adjustments ENABLE ROW LEVEL SECURITY;

-- Owner (tenant), admin, and senior accountant can do everything within their tenant.
CREATE POLICY admin_accountant_full_fadj
ON public.pos_shift_foreign_adjustments
FOR ALL
TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'accountant_senior'::app_role)
)
WITH CHECK (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'accountant_senior'::app_role)
);

-- Cashier who owns the underlying shift can view (read-only) their own shift adjustments.
CREATE POLICY cashier_reads_own_fadj
ON public.pos_shift_foreign_adjustments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.pos_sessions s
    WHERE s.id = pos_shift_foreign_adjustments.session_id
      AND s.cashier_auth_user_id = auth.uid()
  )
);

CREATE TRIGGER trg_pos_shift_fadj_updated_at
BEFORE UPDATE ON public.pos_shift_foreign_adjustments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
