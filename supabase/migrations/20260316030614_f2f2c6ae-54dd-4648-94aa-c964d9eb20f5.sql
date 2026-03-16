
-- Drop old procurement_items (from procurement_requests system)
DROP TABLE IF EXISTS public.procurement_items CASCADE;

-- Create item_categories table
CREATE TABLE public.item_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  name text NOT NULL,
  icon text,
  color text,
  sort_order int DEFAULT 0
);

ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_item_categories" ON public.item_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_item_categories" ON public.item_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_item_categories" ON public.item_categories FOR UPDATE TO authenticated USING (true);
CREATE POLICY "delete_item_categories" ON public.item_categories FOR DELETE TO authenticated USING (true);

-- Create new procurement_items (master catalog)
CREATE TABLE public.procurement_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id),
  category_id uuid REFERENCES public.item_categories(id),
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'قطعة',
  default_price decimal DEFAULT 0,
  notes text,
  is_active boolean DEFAULT true,
  sort_order int DEFAULT 0
);

ALTER TABLE public.procurement_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "select_procurement_items" ON public.procurement_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "insert_procurement_items" ON public.procurement_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "update_procurement_items" ON public.procurement_items FOR UPDATE TO authenticated USING (true);
CREATE POLICY "delete_procurement_items" ON public.procurement_items FOR DELETE TO authenticated USING (true);

-- Seed categories
INSERT INTO public.item_categories (name, icon, color, sort_order) VALUES
('مواد خام - دقيق وحبوب',  'wheat',        '#C9A84C', 1),
('منتجات ألبان وبيض',      'egg',           '#95A5A6', 2),
('لحوم ومجمدات',           'beef',          '#E74C3C', 3),
('صصوصات وزيوت',           'droplets',      '#E67E22', 4),
('بهارات وتوابل',          'sparkles',      '#9B59B6', 5),
('مشروبات',                'cup-soda',      '#3498DB', 6),
('عبوات ومواد تغليف',      'package',       '#27AE60', 7),
('أدوات مائدة وخدمة',      'utensils',      '#1ABC9C', 8),
('مواد تنظيف',             'spray-can',     '#2ECC71', 9),
('ملابس وحماية',           'shirt',         '#95A5A6', 10);
