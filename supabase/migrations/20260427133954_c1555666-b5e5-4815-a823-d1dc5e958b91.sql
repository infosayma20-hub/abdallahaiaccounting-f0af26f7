-- إضافة workshop_id لجدول الفواتير (مستوى الفاتورة)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS workshop_id uuid NULL REFERENCES public.workshops(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_workshop_id
  ON public.invoices(workshop_id) WHERE workshop_id IS NOT NULL;

-- إضافة workshop_id لجدول بنود الفاتورة (مستوى البند - يتجاوز الافتراضي)
ALTER TABLE public.invoice_items
  ADD COLUMN IF NOT EXISTS workshop_id uuid NULL REFERENCES public.workshops(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_items_workshop_id
  ON public.invoice_items(workshop_id) WHERE workshop_id IS NOT NULL;