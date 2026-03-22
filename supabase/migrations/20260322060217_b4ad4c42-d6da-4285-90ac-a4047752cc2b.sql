
-- Accountant permissions table
CREATE TABLE public.accountant_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  accountant_auth_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  -- السندات
  can_create_receipt BOOLEAN DEFAULT true,
  can_create_payment BOOLEAN DEFAULT true,
  can_create_journal BOOLEAN DEFAULT true,
  can_edit_vouchers BOOLEAN DEFAULT true,
  can_delete_vouchers BOOLEAN DEFAULT false,
  -- الفواتير
  can_create_sale_invoice BOOLEAN DEFAULT true,
  can_create_purchase_invoice BOOLEAN DEFAULT true,
  can_edit_invoices BOOLEAN DEFAULT true,
  can_delete_invoices BOOLEAN DEFAULT false,
  -- جهات الاتصال
  can_manage_customers BOOLEAN DEFAULT true,
  can_manage_suppliers BOOLEAN DEFAULT true,
  can_view_balances BOOLEAN DEFAULT true,
  -- الحسابات
  can_manage_accounts BOOLEAN DEFAULT true,
  can_view_ledger BOOLEAN DEFAULT true,
  can_view_trial_balance BOOLEAN DEFAULT true,
  can_view_account_statement BOOLEAN DEFAULT true,
  -- المنتجات والمخزون
  can_manage_products BOOLEAN DEFAULT true,
  can_manage_inventory BOOLEAN DEFAULT true,
  -- الشيكات والبنوك
  can_manage_cheques BOOLEAN DEFAULT true,
  can_manage_banks BOOLEAN DEFAULT true,
  can_manage_cash_boxes BOOLEAN DEFAULT true,
  -- التقارير
  can_view_profit_loss BOOLEAN DEFAULT true,
  can_view_balance_sheet BOOLEAN DEFAULT true,
  can_view_reports BOOLEAN DEFAULT true,
  can_export_data BOOLEAN DEFAULT true,
  -- الطلبيات
  can_manage_orders BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.accountant_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage accountant permissions" ON public.accountant_permissions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid());

-- HR Manager permissions table
CREATE TABLE public.hr_manager_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  hr_auth_id UUID NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  -- الموظفين
  can_add_employees BOOLEAN DEFAULT true,
  can_edit_employees BOOLEAN DEFAULT true,
  can_delete_employees BOOLEAN DEFAULT false,
  can_view_salary_info BOOLEAN DEFAULT true,
  -- الحضور
  can_manage_attendance BOOLEAN DEFAULT true,
  can_edit_attendance BOOLEAN DEFAULT true,
  can_manage_branches BOOLEAN DEFAULT true,
  -- الإجازات
  can_approve_leaves BOOLEAN DEFAULT true,
  can_manage_leave_policy BOOLEAN DEFAULT true,
  can_manage_holidays BOOLEAN DEFAULT true,
  -- الرواتب
  can_process_payroll BOOLEAN DEFAULT true,
  can_approve_payroll BOOLEAN DEFAULT false,
  can_manage_deductions BOOLEAN DEFAULT true,
  can_manage_advances BOOLEAN DEFAULT true,
  can_manage_loans BOOLEAN DEFAULT true,
  -- الطلبات
  can_approve_requests BOOLEAN DEFAULT true,
  can_manage_forms BOOLEAN DEFAULT true,
  -- التقارير
  can_view_hr_reports BOOLEAN DEFAULT true,
  can_export_hr_data BOOLEAN DEFAULT true,
  -- الإعدادات
  can_manage_hr_settings BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.hr_manager_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can manage HR permissions" ON public.hr_manager_permissions
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid());

-- Add accountant_senior and hr_manager to app_role enum if not exists
DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant_senior';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant_sales';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant_purchases';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
