
ALTER TABLE public.pos_expenses
  ADD COLUMN IF NOT EXISTS expense_kind text NOT NULL DEFAULT 'account',
  ADD COLUMN IF NOT EXISTS account_code text,
  ADD COLUMN IF NOT EXISTS employee_id uuid,
  ADD COLUMN IF NOT EXISTS advance_id uuid,
  ADD COLUMN IF NOT EXISTS manager_user_id uuid,
  ADD COLUMN IF NOT EXISTS transaction_id uuid,
  ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'cash';

DO $$ BEGIN
  ALTER TABLE public.pos_expenses
    ADD CONSTRAINT pos_expenses_kind_chk
    CHECK (expense_kind IN ('account','employee_advance','employee_loan','employee_repayment'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_pos_expenses_shift ON public.pos_expenses(shift_id);
CREATE INDEX IF NOT EXISTS idx_pos_expenses_employee ON public.pos_expenses(employee_id);
CREATE INDEX IF NOT EXISTS idx_pos_expenses_account_code ON public.pos_expenses(user_id, account_code);
