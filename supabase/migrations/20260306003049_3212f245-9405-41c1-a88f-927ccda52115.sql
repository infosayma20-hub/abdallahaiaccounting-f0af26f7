
-- بيانات العملاء المجمّعة
CREATE TABLE IF NOT EXISTS public.pos_customers (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL,
  name          TEXT,
  whatsapp      TEXT,
  email         TEXT,
  gender        TEXT CHECK (gender IN ('male','female','other')),
  age_group     TEXT CHECK (age_group IN ('below_16','16_24','25_34','35_44','45_54','above_55')),
  nationality   TEXT,
  total_visits    INTEGER DEFAULT 0,
  total_spent     DECIMAL(12,2) DEFAULT 0,
  total_discounts DECIMAL(12,2) DEFAULT 0,
  last_visit      TIMESTAMPTZ,
  marketing_consent BOOLEAN DEFAULT false,
  consent_date      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, whatsapp),
  UNIQUE(user_id, email)
);

ALTER TABLE public.pos_customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own pos_customers" ON public.pos_customers
  FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- استبيانات رضا العملاء
CREATE TABLE IF NOT EXISTS public.customer_surveys (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID NOT NULL,
  order_id        UUID REFERENCES public.pos_orders(id),
  customer_id     UUID REFERENCES public.pos_customers(id),
  cashier_user_id UUID,
  survey_token    TEXT UNIQUE NOT NULL,
  overall_rating    INTEGER CHECK (overall_rating BETWEEN 1 AND 5),
  service_rating    INTEGER CHECK (service_rating BETWEEN 1 AND 5),
  product_rating    INTEGER CHECK (product_rating BETWEEN 1 AND 5),
  recommend         BOOLEAN,
  comment           TEXT,
  survey_gender     TEXT,
  survey_age_group  TEXT,
  survey_nationality TEXT,
  status          TEXT DEFAULT 'sent' CHECK (status IN ('sent','opened','completed','expired')),
  sent_at         TIMESTAMPTZ DEFAULT NOW(),
  opened_at       TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.customer_surveys ENABLE ROW LEVEL SECURITY;

-- Owners can read their surveys
CREATE POLICY "Users can read own surveys" ON public.customer_surveys
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users can insert surveys" ON public.customer_surveys
  FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- Public can update survey by token (for anonymous survey submission)
CREATE POLICY "Anyone can complete survey by token" ON public.customer_surveys
  FOR UPDATE TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Add columns to pos_orders
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS pos_customer_id UUID REFERENCES public.pos_customers(id),
  ADD COLUMN IF NOT EXISTS customer_discount_pct DECIMAL(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS digital_receipt_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS survey_sent BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS survey_token TEXT;
