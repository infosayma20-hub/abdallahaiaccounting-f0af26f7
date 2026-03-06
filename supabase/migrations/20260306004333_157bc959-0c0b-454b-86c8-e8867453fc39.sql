
-- Modifier Groups
CREATE TABLE IF NOT EXISTS public.modifier_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  selection_type TEXT DEFAULT 'single' CHECK (selection_type IN ('single', 'multiple')),
  is_required BOOLEAN DEFAULT false,
  min_select INTEGER DEFAULT 0,
  max_select INTEGER DEFAULT 10,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.modifier_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own modifier_groups" ON public.modifier_groups
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id))
  WITH CHECK (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

-- Modifier Options
CREATE TABLE IF NOT EXISTS public.modifier_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES public.modifier_groups(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  extra_price DECIMAL(8,2) DEFAULT 0,
  is_default BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  color TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.modifier_options ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own modifier_options" ON public.modifier_options
  FOR ALL TO authenticated
  USING (group_id IN (SELECT id FROM public.modifier_groups WHERE user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id)))
  WITH CHECK (group_id IN (SELECT id FROM public.modifier_groups WHERE user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id)));

-- Product-Modifier Group link
CREATE TABLE IF NOT EXISTS public.product_modifier_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.products(id) ON DELETE CASCADE NOT NULL,
  group_id UUID REFERENCES public.modifier_groups(id) ON DELETE CASCADE NOT NULL,
  sort_order INTEGER DEFAULT 0,
  UNIQUE(product_id, group_id)
);

ALTER TABLE public.product_modifier_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own product_modifier_groups" ON public.product_modifier_groups
  FOR ALL TO authenticated
  USING (product_id IN (SELECT id FROM public.products WHERE user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id)))
  WITH CHECK (product_id IN (SELECT id FROM public.products WHERE user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id)));

-- Order Item Modifiers
CREATE TABLE IF NOT EXISTS public.order_item_modifiers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  order_line_id UUID NOT NULL,
  modifier_group_id UUID REFERENCES public.modifier_groups(id),
  modifier_option_id UUID REFERENCES public.modifier_options(id),
  option_name TEXT NOT NULL,
  group_name TEXT,
  extra_price DECIMAL(8,2) DEFAULT 0,
  quantity INTEGER DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.order_item_modifiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own order_item_modifiers" ON public.order_item_modifiers
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);
