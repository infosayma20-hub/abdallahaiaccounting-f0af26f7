CREATE TABLE public.bop_pinpad_terminals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  data_owner_id UUID NOT NULL,
  company_id UUID NULL,
  branch_id UUID NULL,
  pos_terminal_id UUID NULL,
  label TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 7800,
  merchant_id TEXT NULL,
  outlet_no TEXT NULL,
  pos_code TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT NULL,
  last_batch_at TIMESTAMPTZ NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bop_pinpad_terminals_port_ck  CHECK (port BETWEEN 1 AND 65535),
  CONSTRAINT bop_pinpad_terminals_ip_ck    CHECK (length(btrim(ip_address)) > 0),
  CONSTRAINT bop_pinpad_terminals_label_ck CHECK (length(btrim(label)) > 0)
);

CREATE INDEX idx_bop_pinpad_owner    ON public.bop_pinpad_terminals(data_owner_id);
CREATE INDEX idx_bop_pinpad_branch   ON public.bop_pinpad_terminals(branch_id)       WHERE branch_id IS NOT NULL;
CREATE INDEX idx_bop_pinpad_terminal ON public.bop_pinpad_terminals(pos_terminal_id) WHERE pos_terminal_id IS NOT NULL;
CREATE UNIQUE INDEX uq_bop_pinpad_owner_ip_port ON public.bop_pinpad_terminals(data_owner_id, ip_address, port);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bop_pinpad_terminals TO authenticated;
GRANT ALL ON public.bop_pinpad_terminals TO service_role;

ALTER TABLE public.bop_pinpad_terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bop_pinpad_admin_manage"
  ON public.bop_pinpad_terminals
  FOR ALL
  TO authenticated
  USING (
    data_owner_id = public.resolve_effective_owner_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    )
  )
  WITH CHECK (
    data_owner_id = public.resolve_effective_owner_id(auth.uid())
    AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR public.has_role(auth.uid(), 'super_admin'::app_role)
      OR public.has_role(auth.uid(), 'supervisor'::app_role)
    )
  );

CREATE POLICY "bop_pinpad_tenant_read_active"
  ON public.bop_pinpad_terminals
  FOR SELECT
  TO authenticated
  USING (
    data_owner_id = public.resolve_effective_owner_id(auth.uid())
    AND is_active = true
  );

CREATE TRIGGER update_bop_pinpad_terminals_updated_at
  BEFORE UPDATE ON public.bop_pinpad_terminals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE  public.bop_pinpad_terminals IS 'Bank of Palestine X990 PinPad terminals per branch/POS terminal. Protocol details live in Print Bridge (per NDA).';
COMMENT ON COLUMN public.bop_pinpad_terminals.ip_address IS 'LAN IP of the X990 device (must be reachable from the cashier PC running Print Bridge).';
COMMENT ON COLUMN public.bop_pinpad_terminals.port         IS 'TCP port on the X990 device. Default 7800 per BOP integration guide.';