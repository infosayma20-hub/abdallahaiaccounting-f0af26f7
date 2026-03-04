-- POS multi-tenant access: employees/cashiers operate on owner data safely
-- 1) POS Categories: team can read, admins manage
DROP POLICY IF EXISTS "Users can view own categories" ON public.pos_categories;
DROP POLICY IF EXISTS "Users can insert own categories" ON public.pos_categories;
DROP POLICY IF EXISTS "Users can update own categories" ON public.pos_categories;
DROP POLICY IF EXISTS "Users can delete own categories" ON public.pos_categories;

CREATE POLICY "Team can view POS categories"
ON public.pos_categories
FOR SELECT
TO authenticated
USING (
  is_team_member(auth.uid(), user_id)
  AND user_can_access(auth.uid(), 'pos')
);

CREATE POLICY "Admins can create POS categories"
ON public.pos_categories
FOR INSERT
TO authenticated
WITH CHECK (
  is_team_member(auth.uid(), user_id)
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
);

CREATE POLICY "Admins can update POS categories"
ON public.pos_categories
FOR UPDATE
TO authenticated
USING (
  is_team_member(auth.uid(), user_id)
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
)
WITH CHECK (
  is_team_member(auth.uid(), user_id)
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
);

CREATE POLICY "Admins can delete POS categories"
ON public.pos_categories
FOR DELETE
TO authenticated
USING (
  is_team_member(auth.uid(), user_id)
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
);

-- 2) Products: keep team view, restrict create/update/delete to admins only
DROP POLICY IF EXISTS "Team can create products" ON public.products;
DROP POLICY IF EXISTS "Team can update products" ON public.products;
DROP POLICY IF EXISTS "Team can delete products" ON public.products;
DROP POLICY IF EXISTS "Users can insert their own products" ON public.products;

CREATE POLICY "Admins can create products"
ON public.products
FOR INSERT
TO authenticated
WITH CHECK (
  is_team_member(auth.uid(), user_id)
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
);

CREATE POLICY "Admins can update products"
ON public.products
FOR UPDATE
TO authenticated
USING (
  is_team_member(auth.uid(), user_id)
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
)
WITH CHECK (
  is_team_member(auth.uid(), user_id)
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
);

CREATE POLICY "Admins can delete products"
ON public.products
FOR DELETE
TO authenticated
USING (
  is_team_member(auth.uid(), user_id)
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
);

-- 3) POS Companies: team can read, admins manage
DROP POLICY IF EXISTS "Users manage own companies" ON public.pos_companies;

CREATE POLICY "Team can view POS companies"
ON public.pos_companies
FOR SELECT
TO authenticated
USING (is_team_member(auth.uid(), user_id));

CREATE POLICY "Admins can manage POS companies"
ON public.pos_companies
FOR ALL
TO authenticated
USING (
  is_team_member(auth.uid(), user_id)
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
)
WITH CHECK (
  is_team_member(auth.uid(), user_id)
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
);

-- 4) POS Terminals: team can read, admins manage
DROP POLICY IF EXISTS "Users manage own terminals" ON public.pos_terminals;

CREATE POLICY "Team can view POS terminals"
ON public.pos_terminals
FOR SELECT
TO authenticated
USING (is_team_member(auth.uid(), user_id));

CREATE POLICY "Admins can manage POS terminals"
ON public.pos_terminals
FOR ALL
TO authenticated
USING (
  is_team_member(auth.uid(), user_id)
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
)
WITH CHECK (
  is_team_member(auth.uid(), user_id)
  AND (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'super_admin'))
);

-- 5) POS Sessions: team POS users can create/read/update their owner sessions
DROP POLICY IF EXISTS "Users manage own sessions" ON public.pos_sessions;

CREATE POLICY "Team can manage POS sessions"
ON public.pos_sessions
FOR ALL
TO authenticated
USING (
  is_team_member(auth.uid(), user_id)
  AND user_can_access(auth.uid(), 'pos')
)
WITH CHECK (
  is_team_member(auth.uid(), user_id)
  AND user_can_access(auth.uid(), 'pos')
);

-- 6) POS Orders: team POS users can create/read/update owner orders
DROP POLICY IF EXISTS "Users manage own orders" ON public.pos_orders;

CREATE POLICY "Team can manage POS orders"
ON public.pos_orders
FOR ALL
TO authenticated
USING (
  is_team_member(auth.uid(), user_id)
  AND user_can_access(auth.uid(), 'pos')
)
WITH CHECK (
  is_team_member(auth.uid(), user_id)
  AND user_can_access(auth.uid(), 'pos')
);

-- 7) POS Order lines
DROP POLICY IF EXISTS "Users manage own order lines" ON public.pos_order_lines;

CREATE POLICY "Team can manage POS order lines"
ON public.pos_order_lines
FOR ALL
TO authenticated
USING (
  is_team_member(auth.uid(), user_id)
  AND user_can_access(auth.uid(), 'pos')
)
WITH CHECK (
  is_team_member(auth.uid(), user_id)
  AND user_can_access(auth.uid(), 'pos')
);

-- 8) POS Payments
DROP POLICY IF EXISTS "Users manage own payments" ON public.pos_payments;

CREATE POLICY "Team can manage POS payments"
ON public.pos_payments
FOR ALL
TO authenticated
USING (
  is_team_member(auth.uid(), user_id)
  AND user_can_access(auth.uid(), 'pos')
)
WITH CHECK (
  is_team_member(auth.uid(), user_id)
  AND user_can_access(auth.uid(), 'pos')
);