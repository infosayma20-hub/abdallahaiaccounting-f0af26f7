UPDATE public.pos_user_permissions
SET can_edit_invoices = false,
    edit_cancel_invoices = false,
    can_cancel_invoices = false
WHERE pos_user_id IN (
  SELECT id FROM public.pos_users
  WHERE user_id = (SELECT id FROM auth.users WHERE email = 'malakybroast@gmail.com')
    AND role = 'cashier'
);