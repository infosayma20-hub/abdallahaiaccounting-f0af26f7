
-- Delivery apps (configurable list of delivery platforms)
CREATE TABLE public.delivery_apps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📱',
  is_active BOOLEAN DEFAULT true,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.delivery_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own delivery apps"
ON public.delivery_apps FOR ALL TO authenticated
USING (public.is_team_member(auth.uid(), user_id))
WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- Call center dispatched orders
CREATE TABLE public.call_center_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  source_app TEXT DEFAULT 'مباشر',
  target_branch_id UUID REFERENCES public.branches(id),
  target_branch_name TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  delivery_type TEXT DEFAULT 'delivery' CHECK (delivery_type IN ('delivery', 'pickup')),
  delivery_address TEXT,
  payment_method TEXT DEFAULT 'cash' CHECK (payment_method IN ('cash', 'visa')),
  items JSONB NOT NULL DEFAULT '[]',
  total NUMERIC DEFAULT 0,
  order_note TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'completed', 'cancelled')),
  dispatched_by UUID,
  dispatched_by_name TEXT,
  accepted_by UUID,
  accepted_at TIMESTAMPTZ,
  session_id UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.call_center_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members manage call center orders"
ON public.call_center_orders FOR ALL TO authenticated
USING (public.is_team_member(auth.uid(), user_id))
WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- Enable realtime for instant notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_center_orders;

-- Insert default delivery apps for the restaurant
INSERT INTO public.delivery_apps (user_id, name, icon, display_order) VALUES
('0b08eba6-c81a-4f6c-b371-e6e324016e73', 'Wheels', '🛵', 1),
('0b08eba6-c81a-4f6c-b371-e6e324016e73', 'Yummy', '🍔', 2),
('0b08eba6-c81a-4f6c-b371-e6e324016e73', 'FoodOnTime', '⏰', 3),
('0b08eba6-c81a-4f6c-b371-e6e324016e73', 'طلب مباشر', '📞', 4);
