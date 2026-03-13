
-- Role permissions table for fine-grained access control matrix
CREATE TABLE public.role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  module TEXT NOT NULL,
  can_read BOOLEAN NOT NULL DEFAULT false,
  can_write BOOLEAN NOT NULL DEFAULT false,
  can_delete BOOLEAN NOT NULL DEFAULT false,
  can_approve BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(role, module)
);

-- Enable RLS
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- Only admins can manage permissions
CREATE POLICY "Admins can manage permissions"
  ON public.role_permissions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- Authenticated users can read permissions
CREATE POLICY "Authenticated users can read permissions"
  ON public.role_permissions
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed default permissions for each role
-- admin: full access
INSERT INTO public.role_permissions (role, module, can_read, can_write, can_delete, can_approve) VALUES
  ('admin', 'finance', true, true, true, true),
  ('admin', 'sales', true, true, true, true),
  ('admin', 'purchases', true, true, true, true),
  ('admin', 'inventory', true, true, true, true),
  ('admin', 'hr', true, true, true, true),
  ('admin', 'reports', true, true, true, true),
  ('admin', 'settings', true, true, true, true);

-- accountant_senior: all financial modules, no delete
INSERT INTO public.role_permissions (role, module, can_read, can_write, can_delete, can_approve) VALUES
  ('accountant_senior', 'finance', true, true, false, true),
  ('accountant_senior', 'sales', true, true, false, true),
  ('accountant_senior', 'purchases', true, true, false, true),
  ('accountant_senior', 'inventory', true, true, false, false),
  ('accountant_senior', 'hr', false, false, false, false),
  ('accountant_senior', 'reports', true, true, false, false),
  ('accountant_senior', 'settings', true, false, false, false);

-- cashier: POS only
INSERT INTO public.role_permissions (role, module, can_read, can_write, can_delete, can_approve) VALUES
  ('cashier', 'finance', false, false, false, false),
  ('cashier', 'sales', true, true, false, false),
  ('cashier', 'purchases', false, false, false, false),
  ('cashier', 'inventory', true, false, false, false),
  ('cashier', 'hr', false, false, false, false),
  ('cashier', 'reports', false, false, false, false),
  ('cashier', 'settings', false, false, false, false);

-- supervisor: inventory + reports
INSERT INTO public.role_permissions (role, module, can_read, can_write, can_delete, can_approve) VALUES
  ('supervisor', 'finance', false, false, false, false),
  ('supervisor', 'sales', true, false, false, false),
  ('supervisor', 'purchases', true, true, false, false),
  ('supervisor', 'inventory', true, true, true, true),
  ('supervisor', 'hr', false, false, false, false),
  ('supervisor', 'reports', true, true, false, false),
  ('supervisor', 'settings', false, false, false, false);

-- accountant_sales: customers + invoices + read only
INSERT INTO public.role_permissions (role, module, can_read, can_write, can_delete, can_approve) VALUES
  ('accountant_sales', 'finance', true, false, false, false),
  ('accountant_sales', 'sales', true, true, false, false),
  ('accountant_sales', 'purchases', false, false, false, false),
  ('accountant_sales', 'inventory', true, false, false, false),
  ('accountant_sales', 'hr', false, false, false, false),
  ('accountant_sales', 'reports', true, false, false, false),
  ('accountant_sales', 'settings', false, false, false, false);
