-- Add warranty fields to products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS has_warranty boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS warranty_duration integer,
  ADD COLUMN IF NOT EXISTS warranty_unit text DEFAULT 'months',
  ADD COLUMN IF NOT EXISTS warranty_type text,
  ADD COLUMN IF NOT EXISTS warranty_notes text;

COMMENT ON COLUMN public.products.has_warranty IS 'هل المنتج عليه كفالة';
COMMENT ON COLUMN public.products.warranty_duration IS 'مدة الكفالة (رقم)';
COMMENT ON COLUMN public.products.warranty_unit IS 'وحدة المدة: days/months/years';
COMMENT ON COLUMN public.products.warranty_type IS 'نوع الكفالة: company/supplier/store';
COMMENT ON COLUMN public.products.warranty_notes IS 'ملاحظات الكفالة';