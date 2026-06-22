-- Add 20 new accountant permission columns (safe: all have DEFAULT, no breakage)
ALTER TABLE public.accountant_permissions
  -- Notes / reversals
  ADD COLUMN IF NOT EXISTS can_create_credit_note      boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_create_debit_note       boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_create_reverse_entry    boolean DEFAULT false,
  -- Sales / invoicing extras
  ADD COLUMN IF NOT EXISTS can_manage_quotations       boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_manage_recurring_invoices boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_manage_delivery_notes   boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_process_returns         boolean DEFAULT true,
  -- Inventory
  ADD COLUMN IF NOT EXISTS can_transfer_stock          boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_manage_warehouses       boolean DEFAULT true,
  -- Purchases / imports
  ADD COLUMN IF NOT EXISTS can_manage_import_shipments boolean DEFAULT true,
  -- Accounting sensitive
  ADD COLUMN IF NOT EXISTS can_close_fiscal_period     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_opening_balances boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_cost_centers     boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_manage_fixed_assets     boolean DEFAULT true,
  -- Tax
  ADD COLUMN IF NOT EXISTS can_manage_vat              boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_submit_vat              boolean DEFAULT false,
  -- Banking / treasury
  ADD COLUMN IF NOT EXISTS can_transfer_cash           boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_endorse_cheques         boolean DEFAULT true,
  -- Reports
  ADD COLUMN IF NOT EXISTS can_view_cash_flow          boolean DEFAULT true,
  -- AI drafts (Haseeb)
  ADD COLUMN IF NOT EXISTS can_approve_ai_drafts       boolean DEFAULT false,
  -- Multi-currency settings
  ADD COLUMN IF NOT EXISTS can_manage_currencies       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_manage_exchange_rates   boolean DEFAULT false;

COMMENT ON COLUMN public.accountant_permissions.can_close_fiscal_period IS 'Sensitive: allows closing/reopening fiscal periods';
COMMENT ON COLUMN public.accountant_permissions.can_manage_opening_balances IS 'Sensitive: edits historical opening balances';
COMMENT ON COLUMN public.accountant_permissions.can_create_reverse_entry IS 'Sensitive: IFRS reverse entries';
COMMENT ON COLUMN public.accountant_permissions.can_submit_vat IS 'Sensitive: submits VAT to tax authority';
COMMENT ON COLUMN public.accountant_permissions.can_approve_ai_drafts IS 'Sensitive: posts AI-generated drafts to GL';