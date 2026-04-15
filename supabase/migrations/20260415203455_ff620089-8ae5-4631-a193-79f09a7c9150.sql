
-- جدول إرساليات المبيعات
CREATE TABLE public.delivery_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  delivery_number text UNIQUE,
  contact_id uuid REFERENCES public.contacts(id),
  contact_name text,
  delivery_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'issued', 'converted')),
  linked_invoice_id uuid REFERENCES public.invoices(id),
  invoice_number text,
  converted_at timestamptz,
  currency text DEFAULT 'شيكل',
  exchange_rate numeric DEFAULT 1,
  subtotal numeric DEFAULT 0,
  discount numeric DEFAULT 0,
  vat_amount numeric DEFAULT 0,
  total_amount numeric DEFAULT 0,
  notes text,
  driver_name text,
  vehicle_number text,
  delivery_address text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- بنود الإرسالية
CREATE TABLE public.delivery_note_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_note_id uuid NOT NULL REFERENCES public.delivery_notes(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  product_name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit text DEFAULT 'قطعة',
  unit_price numeric DEFAULT 0,
  total numeric DEFAULT 0,
  notes text,
  sort_order int DEFAULT 0
);

-- فهارس
CREATE INDEX idx_delivery_notes_user ON public.delivery_notes(user_id);
CREATE INDEX idx_delivery_notes_contact ON public.delivery_notes(contact_id);
CREATE INDEX idx_delivery_notes_status ON public.delivery_notes(status);
CREATE INDEX idx_delivery_note_items_note ON public.delivery_note_items(delivery_note_id);

-- RLS
ALTER TABLE public.delivery_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_note_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own delivery notes"
  ON public.delivery_notes FOR ALL
  TO authenticated
  USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users manage own delivery note items"
  ON public.delivery_note_items FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.delivery_notes dn
      WHERE dn.id = delivery_note_id
      AND public.is_team_member(auth.uid(), dn.user_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.delivery_notes dn
      WHERE dn.id = delivery_note_id
      AND public.is_team_member(auth.uid(), dn.user_id)
    )
  );

-- ترقيم تلقائي
CREATE OR REPLACE FUNCTION public.generate_delivery_note_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
  v_year TEXT;
BEGIN
  IF NEW.delivery_number IS NOT NULL AND NEW.delivery_number != '' THEN
    RETURN NEW;
  END IF;
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.delivery_notes
  WHERE user_id = NEW.user_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  NEW.delivery_number := 'DN-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_delivery_note_number
  BEFORE INSERT ON public.delivery_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_delivery_note_number();

-- تحديث updated_at
CREATE TRIGGER update_delivery_notes_updated_at
  BEFORE UPDATE ON public.delivery_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
