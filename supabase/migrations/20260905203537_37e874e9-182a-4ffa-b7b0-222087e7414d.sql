ALTER TABLE public.accountant_permissions
  ADD COLUMN IF NOT EXISTS can_view_all_warehouses_stock boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS can_manage_scoped_master_data boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.accountant_permissions.can_view_all_warehouses_stock IS
  'View stock of every warehouse (read-only). Editing stays limited by user_scope_access.';
COMMENT ON COLUMN public.accountant_permissions.can_manage_scoped_master_data IS
  'Create customers/suppliers/products intended for the user''s own warehouse scope.';