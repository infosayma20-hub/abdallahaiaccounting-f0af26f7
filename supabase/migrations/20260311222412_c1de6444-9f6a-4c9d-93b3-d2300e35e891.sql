-- Drop existing restrictive policies for products
DROP POLICY IF EXISTS "Admins can create products" ON public.products;
DROP POLICY IF EXISTS "Admins can update products" ON public.products;
DROP POLICY IF EXISTS "Admins can delete products" ON public.products;

-- Drop existing restrictive policies for pos_categories
DROP POLICY IF EXISTS "Admins can create POS categories" ON public.pos_categories;
DROP POLICY IF EXISTS "Admins can update POS categories" ON public.pos_categories;
DROP POLICY IF EXISTS "Admins can delete POS categories" ON public.pos_categories;

-- Recreate policies allowing admin OR cashier to manage products
CREATE POLICY "Team managers can create products" ON public.products
FOR INSERT TO authenticated
WITH CHECK (
  is_team_member(auth.uid(), user_id) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'cashier'::app_role)
  )
);

CREATE POLICY "Team managers can update products" ON public.products
FOR UPDATE TO authenticated
USING (
  is_team_member(auth.uid(), user_id) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'cashier'::app_role)
  )
)
WITH CHECK (
  is_team_member(auth.uid(), user_id) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'cashier'::app_role)
  )
);

CREATE POLICY "Team managers can delete products" ON public.products
FOR DELETE TO authenticated
USING (
  is_team_member(auth.uid(), user_id) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'cashier'::app_role)
  )
);

-- Recreate policies allowing admin OR cashier to manage pos_categories
CREATE POLICY "Team managers can create POS categories" ON public.pos_categories
FOR INSERT TO authenticated
WITH CHECK (
  is_team_member(auth.uid(), user_id) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'cashier'::app_role)
  )
);

CREATE POLICY "Team managers can update POS categories" ON public.pos_categories
FOR UPDATE TO authenticated
USING (
  is_team_member(auth.uid(), user_id) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'cashier'::app_role)
  )
)
WITH CHECK (
  is_team_member(auth.uid(), user_id) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'cashier'::app_role)
  )
);

CREATE POLICY "Team managers can delete POS categories" ON public.pos_categories
FOR DELETE TO authenticated
USING (
  is_team_member(auth.uid(), user_id) AND (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'super_admin'::app_role) OR
    has_role(auth.uid(), 'cashier'::app_role)
  )
);