
CREATE OR REPLACE FUNCTION public.user_can_access(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
    AND (
      ur.role IN ('super_admin', 'admin', 'accountant_senior')
      OR (ur.role = 'accountant_sales' AND _module IN ('sales', 'contacts', 'invoices', 'orders', 'cheques', 'transactions', 'accounts', 'currencies', 'reports'))
      OR (ur.role = 'accountant_purchases' AND _module IN ('purchases', 'contacts', 'inventory', 'products', 'stock', 'cheques', 'transactions', 'accounts', 'currencies', 'reports'))
      OR (ur.role = 'cashier' AND _module IN ('pos', 'products', 'contacts'))
      OR (ur.role = 'employee' AND _module IN ('employee_self'))
      OR (ur.role = 'hr_manager' AND _module IN ('hr', 'employees', 'attendance', 'payroll', 'leaves'))
      OR (ur.role::text = 'store_tracker' AND _module IN ('orders', 'order_reports'))
    )
  )
  OR NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id
  )
$$;
