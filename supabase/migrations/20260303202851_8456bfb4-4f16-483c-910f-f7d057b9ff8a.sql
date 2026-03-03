
-- المرحلة 1ب: الدوال المساعدة + سياسات RLS

-- 1. دالة التحقق من صلاحية الوصول حسب الدور والموديول
CREATE OR REPLACE FUNCTION public.user_can_access(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
    AND (
      ur.role IN ('super_admin', 'admin', 'accountant_senior')
      OR (ur.role = 'accountant_sales' AND _module IN ('sales', 'contacts', 'invoices', 'orders', 'cheques', 'transactions', 'accounts', 'currencies', 'reports'))
      OR (ur.role = 'accountant_purchases' AND _module IN ('purchases', 'contacts', 'inventory', 'products', 'stock', 'cheques', 'transactions', 'accounts', 'currencies', 'reports'))
      OR (ur.role = 'cashier' AND _module IN ('pos', 'products'))
      OR (ur.role = 'employee' AND _module IN ('employee_self'))
      OR (ur.role = 'hr_manager' AND _module IN ('hr', 'employees', 'attendance', 'payroll', 'leaves'))
    )
  )
  OR NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id
  )
$$;

-- 2. دالة لمعرفة owner_id (صاحب البيانات)
CREATE OR REPLACE FUNCTION public.get_team_owner_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT COALESCE(
    (SELECT p.invited_by FROM public.profiles p WHERE p.user_id = _user_id AND p.invited_by IS NOT NULL),
    _user_id
  )
$$;

-- 3. دالة للتحقق من عضوية الفريق
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid, _data_owner_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT _data_owner_id = _user_id
    OR _data_owner_id = public.get_team_owner_id(_user_id)
$$;

-- ===== تحديث سياسات RLS =====

-- == transactions ==
DROP POLICY IF EXISTS "Users can view their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can create their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can update their own transactions" ON public.transactions;
DROP POLICY IF EXISTS "Users can delete their own transactions" ON public.transactions;

CREATE POLICY "Team can view transactions" ON public.transactions FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can create transactions" ON public.transactions FOR INSERT TO authenticated
WITH CHECK (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'transactions'));

CREATE POLICY "Team can update transactions" ON public.transactions FOR UPDATE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'transactions'));

CREATE POLICY "Team can delete transactions" ON public.transactions FOR DELETE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'accountant_senior')));

-- == accounts ==
DROP POLICY IF EXISTS "Users can view their own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can create their own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can update their own accounts" ON public.accounts;
DROP POLICY IF EXISTS "Users can delete their own accounts" ON public.accounts;

CREATE POLICY "Team can view accounts" ON public.accounts FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can create accounts" ON public.accounts FOR INSERT TO authenticated
WITH CHECK (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'accounts'));

CREATE POLICY "Team can update accounts" ON public.accounts FOR UPDATE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'accounts'));

CREATE POLICY "Team can delete accounts" ON public.accounts FOR DELETE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));

-- == contacts ==
DROP POLICY IF EXISTS "Users can view their own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can create their own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can update their own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Users can delete their own contacts" ON public.contacts;

CREATE POLICY "Team can view contacts" ON public.contacts FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can create contacts" ON public.contacts FOR INSERT TO authenticated
WITH CHECK (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'contacts'));

CREATE POLICY "Team can update contacts" ON public.contacts FOR UPDATE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'contacts'));

CREATE POLICY "Team can delete contacts" ON public.contacts FOR DELETE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));

-- == cheques ==
DROP POLICY IF EXISTS "Users can view their own cheques" ON public.cheques;
DROP POLICY IF EXISTS "Users can create their own cheques" ON public.cheques;
DROP POLICY IF EXISTS "Users can update their own cheques" ON public.cheques;
DROP POLICY IF EXISTS "Users can delete their own cheques" ON public.cheques;

CREATE POLICY "Team can view cheques" ON public.cheques FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can create cheques" ON public.cheques FOR INSERT TO authenticated
WITH CHECK (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'cheques'));

CREATE POLICY "Team can update cheques" ON public.cheques FOR UPDATE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'cheques'));

CREATE POLICY "Team can delete cheques" ON public.cheques FOR DELETE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));

-- == products ==
DROP POLICY IF EXISTS "Users can view their own products" ON public.products;
DROP POLICY IF EXISTS "Users can create their own products" ON public.products;
DROP POLICY IF EXISTS "Users can update their own products" ON public.products;
DROP POLICY IF EXISTS "Users can delete their own products" ON public.products;

CREATE POLICY "Team can view products" ON public.products FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can create products" ON public.products FOR INSERT TO authenticated
WITH CHECK (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'products'));

CREATE POLICY "Team can update products" ON public.products FOR UPDATE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'products'));

CREATE POLICY "Team can delete products" ON public.products FOR DELETE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));

-- == orders ==
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can create their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can update their own orders" ON public.orders;
DROP POLICY IF EXISTS "Users can delete their own orders" ON public.orders;

CREATE POLICY "Team can view orders" ON public.orders FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can create orders" ON public.orders FOR INSERT TO authenticated
WITH CHECK (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'sales'));

CREATE POLICY "Team can update orders" ON public.orders FOR UPDATE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'sales'));

CREATE POLICY "Team can delete orders" ON public.orders FOR DELETE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));

-- == employees ==
DROP POLICY IF EXISTS "Users can view their own employees" ON public.employees;
DROP POLICY IF EXISTS "Users can create their own employees" ON public.employees;
DROP POLICY IF EXISTS "Users can update their own employees" ON public.employees;
DROP POLICY IF EXISTS "Users can delete their own employees" ON public.employees;

CREATE POLICY "Team can view employees" ON public.employees FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can manage employees" ON public.employees FOR INSERT TO authenticated
WITH CHECK (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'hr'));

CREATE POLICY "Team can update employees" ON public.employees FOR UPDATE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'hr'));

CREATE POLICY "Team can delete employees" ON public.employees FOR DELETE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin') OR public.has_role(auth.uid(), 'hr_manager')));

-- == currencies ==
DROP POLICY IF EXISTS "Users can view their own currencies" ON public.currencies;
DROP POLICY IF EXISTS "Users can create their own currencies" ON public.currencies;
DROP POLICY IF EXISTS "Users can update their own currencies" ON public.currencies;
DROP POLICY IF EXISTS "Users can delete their own currencies" ON public.currencies;

CREATE POLICY "Team can view currencies" ON public.currencies FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can manage currencies" ON public.currencies FOR INSERT TO authenticated
WITH CHECK (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'currencies'));

CREATE POLICY "Team can update currencies" ON public.currencies FOR UPDATE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'currencies'));

CREATE POLICY "Team can delete currencies" ON public.currencies FOR DELETE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));

-- == exchange_rates ==
DROP POLICY IF EXISTS "Users can view their own rates" ON public.exchange_rates;
DROP POLICY IF EXISTS "Users can create their own rates" ON public.exchange_rates;
DROP POLICY IF EXISTS "Users can update their own rates" ON public.exchange_rates;
DROP POLICY IF EXISTS "Users can delete their own rates" ON public.exchange_rates;

CREATE POLICY "Team can view exchange_rates" ON public.exchange_rates FOR SELECT TO authenticated
USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can manage exchange_rates" ON public.exchange_rates FOR INSERT TO authenticated
WITH CHECK (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'currencies'));

CREATE POLICY "Team can update exchange_rates" ON public.exchange_rates FOR UPDATE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(), 'currencies'));

CREATE POLICY "Team can delete exchange_rates" ON public.exchange_rates FOR DELETE TO authenticated
USING (public.is_team_member(auth.uid(), user_id) AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin')));
