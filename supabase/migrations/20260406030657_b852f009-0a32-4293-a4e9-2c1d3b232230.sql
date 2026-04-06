
-- Create qamar_orders table
CREATE TABLE public.qamar_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  reference_number TEXT,
  customer_name TEXT NOT NULL DEFAULT 'عميل',
  customer_phone TEXT,
  customer_city TEXT,
  customer_address TEXT,
  subtotal NUMERIC(10,2) DEFAULT 0,
  discount NUMERIC(10,2) DEFAULT 0,
  shipping_cost NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) DEFAULT 0,
  source TEXT,
  source_key TEXT,
  payment_method TEXT,
  payment_status TEXT DEFAULT 'pending',
  amount_paid NUMERIC(10,2) DEFAULT 0,
  customer_notes TEXT,
  production_notes TEXT,
  all_notes TEXT,
  agent_name TEXT,
  agent_id TEXT,
  priority TEXT DEFAULT 'normal',
  status TEXT DEFAULT 'new',
  type TEXT DEFAULT 'sales_order',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create qamar_order_items table
CREATE TABLE public.qamar_order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.qamar_orders(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL DEFAULT 'منتج',
  product_id TEXT,
  price NUMERIC(10,2) DEFAULT 0,
  quantity INT DEFAULT 1,
  line_total NUMERIC(10,2) DEFAULT 0,
  note TEXT,
  product_image TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.qamar_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qamar_order_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for qamar_orders
CREATE POLICY "Owner can view qamar orders" ON public.qamar_orders
  FOR SELECT USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Owner can update qamar orders" ON public.qamar_orders
  FOR UPDATE USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Owner can delete qamar orders" ON public.qamar_orders
  FOR DELETE USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Service role can insert qamar orders" ON public.qamar_orders
  FOR INSERT WITH CHECK (true);

-- RLS policies for qamar_order_items
CREATE POLICY "Owner can view qamar order items" ON public.qamar_order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.qamar_orders o WHERE o.id = order_id AND public.is_team_member(auth.uid(), o.user_id))
  );

CREATE POLICY "Service role can insert qamar order items" ON public.qamar_order_items
  FOR INSERT WITH CHECK (true);

-- Indexes
CREATE INDEX idx_qamar_orders_user_id ON public.qamar_orders(user_id);
CREATE INDEX idx_qamar_orders_status ON public.qamar_orders(status);
CREATE INDEX idx_qamar_order_items_order_id ON public.qamar_order_items(order_id);
