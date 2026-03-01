
-- Create POS categories table (like Odoo's pos.category)
CREATE TABLE public.pos_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#6B7280',
  display_order INTEGER NOT NULL DEFAULT 0,
  parent_id UUID REFERENCES public.pos_categories(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pos_categories ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own categories" ON public.pos_categories FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own categories" ON public.pos_categories FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own categories" ON public.pos_categories FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own categories" ON public.pos_categories FOR DELETE USING (auth.uid() = user_id);

-- Add category_id to products table to link products to POS categories
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS pos_category_id UUID REFERENCES public.pos_categories(id) ON DELETE SET NULL;

-- Create index for performance
CREATE INDEX idx_pos_categories_user ON public.pos_categories(user_id);
CREATE INDEX idx_products_pos_category ON public.products(pos_category_id);
