-- Allow accountant-role users (with can_manage_products) to create/update products for their team owner
CREATE POLICY "Accountants can create products"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_team_member((SELECT auth.uid()), user_id)
  AND EXISTS (
    SELECT 1 FROM public.accountant_permissions ap
    WHERE ap.accountant_auth_id = (SELECT auth.uid())
      AND ap.is_active = true
      AND ap.can_manage_products = true
      AND ap.user_id = products.user_id
  )
);

CREATE POLICY "Accountants can update products"
ON public.products
FOR UPDATE
TO authenticated
USING (
  public.is_team_member((SELECT auth.uid()), user_id)
  AND EXISTS (
    SELECT 1 FROM public.accountant_permissions ap
    WHERE ap.accountant_auth_id = (SELECT auth.uid())
      AND ap.is_active = true
      AND ap.can_manage_products = true
      AND ap.user_id = products.user_id
  )
)
WITH CHECK (
  public.is_team_member((SELECT auth.uid()), user_id)
  AND EXISTS (
    SELECT 1 FROM public.accountant_permissions ap
    WHERE ap.accountant_auth_id = (SELECT auth.uid())
      AND ap.is_active = true
      AND ap.can_manage_products = true
      AND ap.user_id = products.user_id
  )
);
