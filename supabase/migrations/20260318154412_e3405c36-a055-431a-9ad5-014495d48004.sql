
-- ══════════════════════════════════════
-- Travel Finance Module — Full Schema
-- ══════════════════════════════════════

-- 1. Service Types
CREATE TABLE public.travel_service_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name_ar varchar NOT NULL,
  name_en varchar,
  type varchar NOT NULL,
  icon varchar,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now()
);

-- 2. Suppliers
CREATE TABLE public.travel_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name varchar NOT NULL,
  type varchar,
  country varchar,
  currency varchar DEFAULT 'ILS',
  commission_rate decimal DEFAULT 0,
  payment_terms varchar,
  contact_name varchar,
  contact_phone varchar,
  contact_email varchar,
  balance decimal DEFAULT 0,
  notes text,
  is_active boolean DEFAULT true,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- 3. Bookings (core)
CREATE TABLE public.travel_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  booking_number varchar,
  customer_id uuid REFERENCES public.contacts(id),
  customer_name varchar,
  customer_phone varchar,
  pax_count int DEFAULT 1,
  service_type varchar NOT NULL,
  travel_date date,
  return_date date,
  booking_date date DEFAULT CURRENT_DATE,
  destination varchar,
  origin varchar DEFAULT 'فلسطين',
  cost_price decimal NOT NULL DEFAULT 0,
  cost_currency varchar DEFAULT 'ILS',
  cost_exchange_rate decimal DEFAULT 1,
  cost_price_ils decimal DEFAULT 0,
  selling_price decimal NOT NULL DEFAULT 0,
  selling_currency varchar DEFAULT 'ILS',
  amount_paid decimal DEFAULT 0,
  payment_status varchar DEFAULT 'unpaid',
  supplier_id uuid REFERENCES public.travel_suppliers(id),
  supplier_ref varchar,
  supplier_paid boolean DEFAULT false,
  supplier_paid_date date,
  commission_type varchar DEFAULT 'included',
  commission_rate decimal DEFAULT 0,
  commission_amount decimal DEFAULT 0,
  status varchar DEFAULT 'confirmed',
  cancellation_penalty decimal DEFAULT 0,
  refund_amount decimal DEFAULT 0,
  notes text,
  internal_notes text,
  linked_transaction_id uuid,
  created_by uuid,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- 4. Passengers
CREATE TABLE public.travel_booking_passengers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid REFERENCES public.travel_bookings(id) ON DELETE CASCADE,
  full_name varchar NOT NULL,
  passport_number varchar,
  nationality varchar,
  date_of_birth date,
  gender varchar,
  ticket_number varchar,
  notes text
);

-- 5. Booking Payments
CREATE TABLE public.travel_booking_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  booking_id uuid REFERENCES public.travel_bookings(id) ON DELETE CASCADE,
  amount decimal NOT NULL,
  currency varchar DEFAULT 'ILS',
  exchange_rate decimal DEFAULT 1,
  amount_ils decimal,
  payment_method varchar,
  payment_date date DEFAULT CURRENT_DATE,
  received_by uuid,
  cash_box_id uuid,
  notes text,
  receipt_number varchar,
  linked_transaction_id uuid,
  created_at timestamp DEFAULT now()
);

-- 6. Packages
CREATE TABLE public.travel_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name varchar NOT NULL,
  type varchar,
  destination varchar,
  duration_nights int,
  max_pax int,
  cost_per_person decimal DEFAULT 0,
  selling_price_per_person decimal DEFAULT 0,
  includes text[],
  excludes text[],
  valid_from date,
  valid_to date,
  is_active boolean DEFAULT true,
  image_url varchar,
  description text,
  terms text,
  created_at timestamp DEFAULT now(),
  updated_at timestamp DEFAULT now()
);

-- 7. Supplier Settlements
CREATE TABLE public.travel_supplier_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  supplier_id uuid REFERENCES public.travel_suppliers(id),
  settlement_date date DEFAULT CURRENT_DATE,
  amount decimal NOT NULL,
  currency varchar DEFAULT 'ILS',
  payment_method varchar,
  bank_account_id uuid,
  booking_ids uuid[],
  notes text,
  reference varchar,
  linked_transaction_id uuid,
  created_at timestamp DEFAULT now()
);

-- ══════════════════════════════════════
-- RLS
-- ══════════════════════════════════════
ALTER TABLE public.travel_service_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_booking_passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_booking_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.travel_supplier_settlements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "team_travel_service_types" ON public.travel_service_types FOR ALL USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "team_travel_suppliers" ON public.travel_suppliers FOR ALL USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "team_travel_bookings" ON public.travel_bookings FOR ALL USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "team_travel_booking_passengers" ON public.travel_booking_passengers FOR ALL USING (
  EXISTS (SELECT 1 FROM public.travel_bookings b WHERE b.id = booking_id AND public.is_team_member(auth.uid(), b.user_id))
);
CREATE POLICY "team_travel_booking_payments" ON public.travel_booking_payments FOR ALL USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "team_travel_packages" ON public.travel_packages FOR ALL USING (public.is_team_member(auth.uid(), user_id));
CREATE POLICY "team_travel_supplier_settlements" ON public.travel_supplier_settlements FOR ALL USING (public.is_team_member(auth.uid(), user_id));

-- ══════════════════════════════════════
-- Triggers
-- ══════════════════════════════════════

-- Auto booking number
CREATE OR REPLACE FUNCTION public.generate_travel_booking_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count INTEGER; v_year TEXT;
BEGIN
  IF NEW.booking_number IS NOT NULL AND NEW.booking_number != '' THEN RETURN NEW; END IF;
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COUNT(*) + 1 INTO v_count FROM public.travel_bookings WHERE user_id = NEW.user_id AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  NEW.booking_number := 'TRV-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_travel_booking_number BEFORE INSERT ON public.travel_bookings FOR EACH ROW EXECUTE FUNCTION public.generate_travel_booking_number();

-- Auto cost_price_ils calculation
CREATE OR REPLACE FUNCTION public.calculate_travel_cost_ils()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.cost_price_ils := NEW.cost_price * COALESCE(NEW.cost_exchange_rate, 1);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_travel_cost_ils BEFORE INSERT OR UPDATE ON public.travel_bookings FOR EACH ROW EXECUTE FUNCTION public.calculate_travel_cost_ils();

-- Updated_at trigger for bookings
CREATE TRIGGER trg_travel_bookings_updated BEFORE UPDATE ON public.travel_bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_travel_suppliers_updated BEFORE UPDATE ON public.travel_suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_travel_packages_updated BEFORE UPDATE ON public.travel_packages FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
