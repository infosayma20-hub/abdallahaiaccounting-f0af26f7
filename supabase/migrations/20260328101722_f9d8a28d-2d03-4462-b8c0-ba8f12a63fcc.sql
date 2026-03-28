
-- 1. إضافة أعمدة جديدة لجدول travel_bookings
ALTER TABLE public.travel_bookings
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id),
  ADD COLUMN IF NOT EXISTS supplier_contact_id UUID REFERENCES public.contacts(id),
  ADD COLUMN IF NOT EXISTS currency_id UUID REFERENCES public.currencies(id),
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID,
  ADD COLUMN IF NOT EXISTS profit_margin NUMERIC(5,2);

-- 2. إضافة أعمدة جديدة لجدول travel_booking_passengers
ALTER TABLE public.travel_booking_passengers
  ADD COLUMN IF NOT EXISTS passenger_index INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS full_name_en TEXT,
  ADD COLUMN IF NOT EXISTS passport_issue_date DATE,
  ADD COLUMN IF NOT EXISTS national_id TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS mahram_name TEXT,
  ADD COLUMN IF NOT EXISTS room_type TEXT,
  ADD COLUMN IF NOT EXISTS user_id UUID;

-- 3. إضافة أعمدة جديدة لجدول travel_booking_payments
ALTER TABLE public.travel_booking_payments
  ADD COLUMN IF NOT EXISTS payment_direction TEXT DEFAULT 'received',
  ADD COLUMN IF NOT EXISTS reference_number TEXT,
  ADD COLUMN IF NOT EXISTS bank_name TEXT,
  ADD COLUMN IF NOT EXISTS account_id UUID,
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID;

-- 4. إنشاء جدول بنود التكلفة التفصيلية
CREATE TABLE IF NOT EXISTS public.travel_booking_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.travel_bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL DEFAULT '',
  supplier_contact_id UUID REFERENCES public.contacts(id),
  city TEXT,
  check_in_date DATE,
  check_out_date DATE,
  nights INTEGER,
  quantity INTEGER DEFAULT 1,
  unit_cost NUMERIC(15,3) DEFAULT 0,
  unit_price NUMERIC(15,3) DEFAULT 0,
  currency_id UUID REFERENCES public.currencies(id),
  exchange_rate NUMERIC(10,4) DEFAULT 1,
  total_cost NUMERIC(15,3) GENERATED ALWAYS AS (COALESCE(quantity, 1) * COALESCE(unit_cost, 0)) STORED,
  total_price NUMERIC(15,3) GENERATED ALWAYS AS (COALESCE(quantity, 1) * COALESCE(unit_price, 0)) STORED,
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. إنشاء جدول عملات السفر
CREATE TABLE IF NOT EXISTS public.travel_currencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  currency_code TEXT NOT NULL,
  currency_name_ar TEXT NOT NULL,
  symbol TEXT,
  exchange_rate NUMERIC(10,4) DEFAULT 1,
  is_default BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. إنشاء جدول مستندات السفر
CREATE TABLE IF NOT EXISTS public.travel_booking_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID REFERENCES public.travel_bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  document_type TEXT DEFAULT 'other',
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Trigger لتوليد رقم الحجز التلقائي TRV-YYYY-XXXX
CREATE OR REPLACE FUNCTION public.generate_travel_booking_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
  v_year TEXT;
BEGIN
  IF NEW.booking_number IS NOT NULL AND NEW.booking_number != '' THEN
    RETURN NEW;
  END IF;
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.travel_bookings
  WHERE user_id = NEW.user_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  NEW.booking_number := 'TRV-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_travel_booking_number ON public.travel_bookings;
CREATE TRIGGER trg_travel_booking_number
  BEFORE INSERT ON public.travel_bookings
  FOR EACH ROW EXECUTE FUNCTION public.generate_travel_booking_number();

-- 8. RLS Policies
ALTER TABLE public.travel_booking_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_booking_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "travel_booking_items_select" ON public.travel_booking_items
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "travel_booking_items_insert" ON public.travel_booking_items
  FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "travel_booking_items_update" ON public.travel_booking_items
  FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "travel_booking_items_delete" ON public.travel_booking_items
  FOR DELETE TO authenticated USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "travel_currencies_select" ON public.travel_currencies
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "travel_currencies_insert" ON public.travel_currencies
  FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "travel_currencies_update" ON public.travel_currencies
  FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "travel_currencies_delete" ON public.travel_currencies
  FOR DELETE TO authenticated USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "travel_booking_documents_select" ON public.travel_booking_documents
  FOR SELECT TO authenticated USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "travel_booking_documents_insert" ON public.travel_booking_documents
  FOR INSERT TO authenticated WITH CHECK (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "travel_booking_documents_update" ON public.travel_booking_documents
  FOR UPDATE TO authenticated USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "travel_booking_documents_delete" ON public.travel_booking_documents
  FOR DELETE TO authenticated USING (public.is_team_member(auth.uid(), user_id));

-- 9. Storage bucket لمستندات السفر
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('travel-documents', 'travel-documents', true, 10485760)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "travel_docs_upload_v2" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'travel-documents');
CREATE POLICY "travel_docs_read_v2" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'travel-documents');
CREATE POLICY "travel_docs_delete_v2" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'travel-documents');
