
-- Custom statuses table for qamar orders
CREATE TABLE public.qamar_order_statuses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  color TEXT DEFAULT '#6B7280',
  sort_order INT DEFAULT 0,
  effect TEXT DEFAULT 'none', -- none, ready_invoice, invoiced, paid, cancelled, returned
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.qamar_order_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages statuses" ON public.qamar_order_statuses
  FOR ALL USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- Add linked_invoice_id and paid_amount to qamar_orders
ALTER TABLE public.qamar_orders ADD COLUMN IF NOT EXISTS linked_invoice_id UUID;
ALTER TABLE public.qamar_orders ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMPTZ;
ALTER TABLE public.qamar_orders ADD COLUMN IF NOT EXISTS invoice_number TEXT;

-- Insert default statuses for the Qamar user
INSERT INTO public.qamar_order_statuses (user_id, name, color, sort_order, effect, is_default) VALUES
  ('ccdbcaa5-a585-4d84-a559-a4fc94a6075b', 'جديد', '#3B82F6', 1, 'none', true),
  ('ccdbcaa5-a585-4d84-a559-a4fc94a6075b', 'مؤكد', '#8B5CF6', 2, 'none', false),
  ('ccdbcaa5-a585-4d84-a559-a4fc94a6075b', 'قيد التصنيع', '#F59E0B', 3, 'none', false),
  ('ccdbcaa5-a585-4d84-a559-a4fc94a6075b', 'جاهز للشحن', '#6366F1', 4, 'none', false),
  ('ccdbcaa5-a585-4d84-a559-a4fc94a6075b', 'تم الشحن', '#A855F7', 5, 'none', false),
  ('ccdbcaa5-a585-4d84-a559-a4fc94a6075b', 'تم التسليم', '#22C55E', 6, 'ready_invoice', false),
  ('ccdbcaa5-a585-4d84-a559-a4fc94a6075b', 'جاهز للفوترة', '#EAB308', 7, 'ready_invoice', false),
  ('ccdbcaa5-a585-4d84-a559-a4fc94a6075b', 'مفوتر', '#F97316', 8, 'invoiced', false),
  ('ccdbcaa5-a585-4d84-a559-a4fc94a6075b', 'مدفوع جزئياً', '#10B981', 9, 'paid', false),
  ('ccdbcaa5-a585-4d84-a559-a4fc94a6075b', 'مدفوع كاملاً', '#059669', 10, 'paid', false),
  ('ccdbcaa5-a585-4d84-a559-a4fc94a6075b', 'ملغي', '#EF4444', 11, 'cancelled', false),
  ('ccdbcaa5-a585-4d84-a559-a4fc94a6075b', 'مرتجع', '#DC2626', 12, 'returned', false);

CREATE INDEX idx_qamar_order_statuses_user ON public.qamar_order_statuses(user_id);
