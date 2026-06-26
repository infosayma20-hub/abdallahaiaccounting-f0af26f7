
-- 1) Company settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS qr_menu_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS qr_menu_mode text DEFAULT 'dine_in',
  ADD COLUMN IF NOT EXISTS qr_menu_welcome_message text,
  ADD COLUMN IF NOT EXISTS qr_menu_require_phone boolean DEFAULT false;

-- 2) Public slugs (account-level on profiles + per-branch)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_slug text;
CREATE UNIQUE INDEX IF NOT EXISTS profiles_public_slug_key ON public.profiles(public_slug) WHERE public_slug IS NOT NULL;

ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS qr_menu_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS public_slug text;
CREATE UNIQUE INDEX IF NOT EXISTS branches_user_slug_key ON public.branches(user_id, public_slug) WHERE public_slug IS NOT NULL;

-- 3) Visibility toggles
ALTER TABLE public.pos_categories ADD COLUMN IF NOT EXISTS show_in_qr_menu boolean DEFAULT true;
ALTER TABLE public.products       ADD COLUMN IF NOT EXISTS show_in_qr_menu boolean DEFAULT true;

-- 4) Orders inbox (tenancy by user_id = account owner)
CREATE TABLE IF NOT EXISTS public.qr_menu_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id  uuid NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  table_id   uuid REFERENCES public.restaurant_tables(id) ON DELETE SET NULL,
  customer_name text,
  customer_phone text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  reject_reason text,
  pos_order_id uuid,
  short_number int,
  source_ip text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz,
  accepted_by uuid,
  CONSTRAINT qr_menu_orders_status_chk CHECK (status IN ('pending','accepted','rejected','converted','cancelled'))
);

CREATE INDEX IF NOT EXISTS qr_menu_orders_branch_status_idx ON public.qr_menu_orders(branch_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS qr_menu_orders_user_idx ON public.qr_menu_orders(user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qr_menu_orders TO authenticated;
GRANT INSERT ON public.qr_menu_orders TO anon;
GRANT ALL ON public.qr_menu_orders TO service_role;

ALTER TABLE public.qr_menu_orders ENABLE ROW LEVEL SECURITY;

-- Anon can insert ONLY if the target branch + settings have QR menu enabled
CREATE POLICY "Anon can submit qr orders to enabled branches"
ON public.qr_menu_orders FOR INSERT TO anon
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.branches b
    JOIN public.company_settings cs ON cs.user_id = b.user_id
    WHERE b.id = qr_menu_orders.branch_id
      AND b.user_id = qr_menu_orders.user_id
      AND b.qr_menu_enabled = true
      AND cs.qr_menu_enabled = true
  )
);

-- Authenticated: account owner only
CREATE POLICY "Owner can view qr orders"
ON public.qr_menu_orders FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Owner can update qr orders"
ON public.qr_menu_orders FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owner can delete qr orders"
ON public.qr_menu_orders FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.qr_menu_orders_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_qr_menu_orders_touch ON public.qr_menu_orders;
CREATE TRIGGER trg_qr_menu_orders_touch
BEFORE UPDATE ON public.qr_menu_orders
FOR EACH ROW EXECUTE FUNCTION public.qr_menu_orders_touch_updated_at();

-- Realtime
ALTER TABLE public.qr_menu_orders REPLICA IDENTITY FULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'qr_menu_orders'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.qr_menu_orders';
  END IF;
END $$;

-- Public resolver (security definer, bypasses RLS for slug → ids lookup)
CREATE OR REPLACE FUNCTION public.qr_menu_resolve(_account_slug text, _branch_slug text)
RETURNS TABLE(user_id uuid, branch_id uuid, branch_name text, account_name text, welcome_message text, require_phone boolean, mode text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, b.id, b.name, COALESCE(p.company_name, p.full_name, ''), cs.qr_menu_welcome_message, cs.qr_menu_require_phone, cs.qr_menu_mode
  FROM profiles p
  JOIN branches b ON b.user_id = p.id
  JOIN company_settings cs ON cs.user_id = p.id
  WHERE p.public_slug = _account_slug
    AND b.public_slug = _branch_slug
    AND b.qr_menu_enabled = true
    AND cs.qr_menu_enabled = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.qr_menu_resolve(text, text) TO anon, authenticated;

-- Public menu reader
CREATE OR REPLACE FUNCTION public.qr_menu_get_menu(_user_id uuid, _branch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ok boolean;
  _result jsonb;
BEGIN
  SELECT EXISTS(
    SELECT 1 FROM branches b
    JOIN company_settings cs ON cs.user_id = b.user_id
    WHERE b.id = _branch_id AND b.user_id = _user_id
      AND b.qr_menu_enabled AND cs.qr_menu_enabled
  ) INTO _ok;
  IF NOT _ok THEN RETURN '{"error":"not_available"}'::jsonb; END IF;

  SELECT jsonb_build_object(
    'categories', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name, 'sort_order', sort_order) ORDER BY sort_order NULLS LAST, name)
      FROM pos_categories
      WHERE user_id = _user_id
        AND COALESCE(show_in_qr_menu, true) = true
        AND COALESCE(is_active, true) = true
    ), '[]'::jsonb),
    'products', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', id,
        'name', name,
        'price', sell_price,
        'image_url', image_url,
        'category_id', pos_category_id,
        'description', description
      ) ORDER BY pos_sort_order NULLS LAST, name)
      FROM products
      WHERE user_id = _user_id
        AND COALESCE(show_in_qr_menu, true) = true
        AND COALESCE(is_pos_available, true) = true
        AND pos_category_id IS NOT NULL
    ), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END $$;

GRANT EXECUTE ON FUNCTION public.qr_menu_get_menu(uuid, uuid) TO anon, authenticated;
