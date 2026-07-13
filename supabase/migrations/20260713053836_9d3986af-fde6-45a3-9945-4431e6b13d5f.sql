CREATE TABLE public.bop_pinpad_transactions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data_owner_id UUID NOT NULL,
  terminal_id   UUID NOT NULL REFERENCES public.bop_pinpad_terminals(id) ON DELETE RESTRICT,
  branch_id     UUID,
  pos_terminal_id UUID,
  op_type       TEXT NOT NULL CHECK (op_type IN ('SALE','SALE_CB','LOAN','VOID','RETURN','QUERY','BATCH','BATCH_TIME','QR')),
  receipt_no    TEXT,
  amount        NUMERIC(14,2),
  currency      TEXT CHECK (currency IN ('ILS','USD','JOD')),
  resp_code     TEXT,
  auth_code     TEXT,
  seq           TEXT,
  stan          TEXT,
  card_masked   TEXT,
  card_type     TEXT,
  entry_mode    TEXT,
  aid           TEXT,
  datim         TEXT,
  is_success    BOOLEAN NOT NULL DEFAULT false,
  error_msg     TEXT,
  duration_ms   INTEGER,
  requested_by  UUID,
  raw_response  JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bop_pinpad_tx_owner_time ON public.bop_pinpad_transactions(data_owner_id, created_at DESC);
CREATE INDEX idx_bop_pinpad_tx_terminal   ON public.bop_pinpad_transactions(terminal_id, created_at DESC);
CREATE INDEX idx_bop_pinpad_tx_receipt    ON public.bop_pinpad_transactions(data_owner_id, receipt_no) WHERE receipt_no IS NOT NULL;
CREATE INDEX idx_bop_pinpad_tx_seq        ON public.bop_pinpad_transactions(terminal_id, seq) WHERE seq IS NOT NULL;

GRANT SELECT, INSERT ON public.bop_pinpad_transactions TO authenticated;
GRANT ALL ON public.bop_pinpad_transactions TO service_role;

ALTER TABLE public.bop_pinpad_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pinpad_tx_read_same_owner"
  ON public.bop_pinpad_transactions
  FOR SELECT
  TO authenticated
  USING (data_owner_id = public.resolve_effective_owner_id(auth.uid()));

CREATE POLICY "pinpad_tx_insert_same_owner"
  ON public.bop_pinpad_transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    data_owner_id = public.resolve_effective_owner_id(auth.uid())
    AND (requested_by IS NULL OR requested_by = auth.uid())
  );

-- Immutable: no UPDATE / DELETE policies granted.

COMMENT ON TABLE public.bop_pinpad_transactions IS
  'Immutable audit log for every X990 PinPad call. Required by BOP integration agreement. Card PAN is never stored — only masked.';