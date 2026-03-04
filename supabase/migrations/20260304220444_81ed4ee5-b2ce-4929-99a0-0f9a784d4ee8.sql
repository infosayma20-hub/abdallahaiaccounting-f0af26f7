
CREATE TABLE public.company_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  
  -- Company Info
  company_name TEXT,
  logo_url TEXT,
  address TEXT,
  city TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  tax_number TEXT,
  commercial_register TEXT,
  
  -- Currency & Market
  base_currency TEXT DEFAULT 'ILS',
  extra_currencies JSONB DEFAULT '["USD","JOD"]',
  exchange_rate_source TEXT DEFAULT 'auto',
  calendar_type TEXT DEFAULT 'gregorian',
  fiscal_year_start INTEGER DEFAULT 1,
  
  -- Default Accounts
  default_revenue_account TEXT DEFAULT '4100',
  default_expense_account TEXT DEFAULT '5100',
  default_cash_account TEXT DEFAULT '1110',
  default_bank_account TEXT DEFAULT '1120',
  default_receivable_account TEXT DEFAULT '1130',
  default_payable_account TEXT DEFAULT '2100',
  
  -- Tax
  vat_enabled BOOLEAN DEFAULT true,
  vat_rate DECIMAL DEFAULT 16,
  vat_inclusive BOOLEAN DEFAULT false,
  vat_sales_account TEXT,
  vat_purchases_account TEXT,
  income_tax_enabled BOOLEAN DEFAULT false,
  income_tax_rate DECIMAL DEFAULT 5,
  
  -- Document Numbering
  invoice_prefix TEXT DEFAULT 'INV',
  receipt_prefix TEXT DEFAULT 'REC',
  payment_prefix TEXT DEFAULT 'PAY',
  journal_prefix TEXT DEFAULT 'JV',
  purchase_order_prefix TEXT DEFAULT 'PO',
  reset_numbering_yearly BOOLEAN DEFAULT true,
  
  -- Period Locking
  period_lock_mode TEXT DEFAULT 'auto',
  last_locked_period TEXT,
  
  -- Invoice Settings
  default_payment_terms TEXT DEFAULT 'cash',
  default_invoice_currency TEXT DEFAULT 'ILS',
  default_invoice_language TEXT DEFAULT 'ar',
  invoice_default_notes TEXT DEFAULT 'شكراً لتعاملكم معنا',
  show_bank_on_invoice BOOLEAN DEFAULT true,
  show_tax_on_invoice BOOLEAN DEFAULT true,
  allow_invoice_edit_after_approval BOOLEAN DEFAULT false,
  allow_discount BOOLEAN DEFAULT true,
  max_discount_percent DECIMAL DEFAULT 20,
  e_invoice_enabled BOOLEAN DEFAULT false,
  
  -- POS Settings
  pos_name TEXT DEFAULT 'نقطة البيع الرئيسية',
  pos_branch_id UUID,
  pos_payment_methods JSONB DEFAULT '["cash","network","transfer","credit"]',
  pos_require_shift BOOLEAN DEFAULT true,
  pos_default_opening_balance DECIMAL DEFAULT 500,
  pos_deficit_alert BOOLEAN DEFAULT true,
  pos_deficit_threshold DECIMAL DEFAULT 50,
  pos_receipt_size TEXT DEFAULT '80mm',
  pos_auto_print BOOLEAN DEFAULT true,
  pos_show_tax BOOLEAN DEFAULT true,
  pos_receipt_copies INTEGER DEFAULT 1,
  pos_auto_update_stock BOOLEAN DEFAULT true,
  pos_warn_out_of_stock BOOLEAN DEFAULT true,
  pos_prevent_zero_stock BOOLEAN DEFAULT false,
  
  -- Print & Templates
  primary_color TEXT DEFAULT '#22C55E',
  invoice_font TEXT DEFAULT 'classic',
  paper_size TEXT DEFAULT 'A4',
  show_logo_on_invoice BOOLEAN DEFAULT true,
  show_address_on_invoice BOOLEAN DEFAULT true,
  invoice_footer TEXT DEFAULT 'شكراً لتعاملكم معنا',
  
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID
);

-- RLS
ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own settings"
  ON public.company_settings FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users can update own settings"
  ON public.company_settings FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can insert own settings"
  ON public.company_settings FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_company_settings_updated_at
  BEFORE UPDATE ON public.company_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
