
-- Create product categories enum
CREATE TYPE public.product_category AS ENUM (
  'بضاعة عامة',
  'مواد خام',
  'مواد تعبئة',
  'قطع غيار',
  'أخرى'
);

-- Create stock movement type enum
CREATE TYPE public.stock_movement_type AS ENUM (
  'وارد',
  'صادر',
  'تعديل يدوي'
);

-- Create products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  category product_category NOT NULL DEFAULT 'بضاعة عامة',
  sku TEXT,
  buy_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  sell_price NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_quantity NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'قطعة',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create stock movements table
CREATE TABLE public.stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  movement_type stock_movement_type NOT NULL,
  quantity NUMERIC(12,2) NOT NULL,
  reference_note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- Products RLS policies
CREATE POLICY "Users can view their own products"
ON public.products FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own products"
ON public.products FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own products"
ON public.products FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own products"
ON public.products FOR DELETE
USING (auth.uid() = user_id);

-- Stock movements RLS policies
CREATE POLICY "Users can view their own stock movements"
ON public.stock_movements FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own stock movements"
ON public.stock_movements FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at on products
CREATE TRIGGER update_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
