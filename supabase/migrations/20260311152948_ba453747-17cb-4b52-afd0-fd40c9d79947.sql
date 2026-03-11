ALTER TABLE public.pos_user_permissions 
  ADD COLUMN IF NOT EXISTS can_view_invoice_history boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_edit_invoices boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS require_manager_for_invoices boolean NOT NULL DEFAULT true;