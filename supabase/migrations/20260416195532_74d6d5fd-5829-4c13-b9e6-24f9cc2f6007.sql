-- ═══════════════════════════════════════════════════════
-- 1. WARRANTY POLICIES — سياسة الكفالة لكل صنف
-- ═══════════════════════════════════════════════════════
CREATE TABLE public.warranty_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  duration_months INTEGER NOT NULL DEFAULT 12 CHECK (duration_months > 0),
  has_serial BOOLEAN NOT NULL DEFAULT false,
  warranty_type TEXT NOT NULL DEFAULT 'replacement' 
    CHECK (warranty_type IN ('replacement', 'repair', 'refund', 'case_by_case')),
  supplier_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  supplier_covers NUMERIC(5,2) NOT NULL DEFAULT 0 
    CHECK (supplier_covers >= 0 AND supplier_covers <= 100),
  terms TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

CREATE INDEX idx_warranty_policies_user ON public.warranty_policies(user_id);
CREATE INDEX idx_warranty_policies_product ON public.warranty_policies(product_id);
CREATE INDEX idx_warranty_policies_supplier ON public.warranty_policies(supplier_id);

ALTER TABLE public.warranty_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view warranty policies" ON public.warranty_policies
  FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can manage warranty policies" ON public.warranty_policies
  FOR ALL TO authenticated
  USING (is_team_member(auth.uid(), user_id))
  WITH CHECK (is_team_member(auth.uid(), user_id));

-- ═══════════════════════════════════════════════════════
-- 2. WARRANTY CARDS — بطاقة كفالة لكل وحدة مباعة
-- ═══════════════════════════════════════════════════════
CREATE TABLE public.warranty_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  card_number TEXT NOT NULL,
  invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  invoice_item_id UUID REFERENCES public.invoice_items(id) ON DELETE SET NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  policy_id UUID REFERENCES public.warranty_policies(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  contact_name TEXT,
  serial_number TEXT,
  quantity NUMERIC(15,3) NOT NULL DEFAULT 1,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE NOT NULL,
  duration_months INTEGER NOT NULL DEFAULT 12,
  status TEXT NOT NULL DEFAULT 'active' 
    CHECK (status IN ('active', 'expired', 'claimed', 'void')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, card_number)
);

CREATE INDEX idx_warranty_cards_user ON public.warranty_cards(user_id);
CREATE INDEX idx_warranty_cards_invoice ON public.warranty_cards(invoice_id);
CREATE INDEX idx_warranty_cards_product ON public.warranty_cards(product_id);
CREATE INDEX idx_warranty_cards_contact ON public.warranty_cards(contact_id);
CREATE INDEX idx_warranty_cards_serial ON public.warranty_cards(serial_number) WHERE serial_number IS NOT NULL;
CREATE INDEX idx_warranty_cards_status ON public.warranty_cards(user_id, status);
CREATE INDEX idx_warranty_cards_end_date ON public.warranty_cards(end_date) WHERE status = 'active';

ALTER TABLE public.warranty_cards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view warranty cards" ON public.warranty_cards
  FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can manage warranty cards" ON public.warranty_cards
  FOR ALL TO authenticated
  USING (is_team_member(auth.uid(), user_id))
  WITH CHECK (is_team_member(auth.uid(), user_id));

-- ═══════════════════════════════════════════════════════
-- 3. WARRANTY SUPPLIER CLAIMS — مطالبة الشركة الأم
-- ═══════════════════════════════════════════════════════
CREATE TABLE public.warranty_supplier_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  claim_number TEXT NOT NULL,
  supplier_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE RESTRICT,
  supplier_name TEXT,
  claim_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_cost NUMERIC(15,3) NOT NULL DEFAULT 0,
  supplier_coverage_amount NUMERIC(15,3) NOT NULL DEFAULT 0,
  our_cost NUMERIC(15,3) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'approved', 'rejected', 'partial')),
  resolution_date DATE,
  notes TEXT,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, claim_number)
);

CREATE INDEX idx_supplier_claims_user ON public.warranty_supplier_claims(user_id);
CREATE INDEX idx_supplier_claims_supplier ON public.warranty_supplier_claims(supplier_id);
CREATE INDEX idx_supplier_claims_status ON public.warranty_supplier_claims(user_id, status);

ALTER TABLE public.warranty_supplier_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view supplier claims" ON public.warranty_supplier_claims
  FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can manage supplier claims" ON public.warranty_supplier_claims
  FOR ALL TO authenticated
  USING (is_team_member(auth.uid(), user_id))
  WITH CHECK (is_team_member(auth.uid(), user_id));

-- ═══════════════════════════════════════════════════════
-- 4. WARRANTY CLAIMS — مطالبات العملاء
-- ═══════════════════════════════════════════════════════
CREATE TABLE public.warranty_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  claim_number TEXT NOT NULL,
  warranty_card_id UUID NOT NULL REFERENCES public.warranty_cards(id) ON DELETE RESTRICT,
  claim_date DATE NOT NULL DEFAULT CURRENT_DATE,
  issue_description TEXT NOT NULL,
  claim_type TEXT NOT NULL DEFAULT 'repair' 
    CHECK (claim_type IN ('replacement', 'repair', 'refund')),
  resolution TEXT 
    CHECK (resolution IS NULL OR resolution IN ('replacement', 'repair', 'refund', 'rejected')),
  resolution_date DATE,
  resolution_notes TEXT,
  cost NUMERIC(15,3) NOT NULL DEFAULT 0,
  supplier_claim_id UUID REFERENCES public.warranty_supplier_claims(id) ON DELETE SET NULL,
  replacement_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'open' 
    CHECK (status IN ('open', 'in_progress', 'resolved', 'rejected')),
  attachments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, claim_number)
);

CREATE INDEX idx_warranty_claims_user ON public.warranty_claims(user_id);
CREATE INDEX idx_warranty_claims_card ON public.warranty_claims(warranty_card_id);
CREATE INDEX idx_warranty_claims_supplier_claim ON public.warranty_claims(supplier_claim_id);
CREATE INDEX idx_warranty_claims_status ON public.warranty_claims(user_id, status);
CREATE INDEX idx_warranty_claims_date ON public.warranty_claims(user_id, claim_date DESC);

ALTER TABLE public.warranty_claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view warranty claims" ON public.warranty_claims
  FOR SELECT TO authenticated
  USING (is_team_member(auth.uid(), user_id));

CREATE POLICY "Team can manage warranty claims" ON public.warranty_claims
  FOR ALL TO authenticated
  USING (is_team_member(auth.uid(), user_id))
  WITH CHECK (is_team_member(auth.uid(), user_id));

-- ═══════════════════════════════════════════════════════
-- TRIGGERS: ترقيم تلقائي + تواريخ + حالات
-- ═══════════════════════════════════════════════════════

-- توليد رقم بطاقة كفالة (WC-2026-0001)
CREATE OR REPLACE FUNCTION public.generate_warranty_card_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_year TEXT;
BEGIN
  IF NEW.card_number IS NOT NULL AND NEW.card_number != '' THEN
    RETURN NEW;
  END IF;

  v_year := EXTRACT(YEAR FROM NOW())::TEXT;

  SELECT COUNT(*) + 1 INTO v_count
  FROM public.warranty_cards
  WHERE user_id = NEW.user_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());

  NEW.card_number := 'WC-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_warranty_card_number
BEFORE INSERT ON public.warranty_cards
FOR EACH ROW EXECUTE FUNCTION public.generate_warranty_card_number();

-- حساب تلقائي لتاريخ انتهاء الكفالة
CREATE OR REPLACE FUNCTION public.compute_warranty_end_date()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.end_date IS NULL OR NEW.end_date = NEW.start_date THEN
    NEW.end_date := NEW.start_date + (NEW.duration_months || ' months')::INTERVAL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_warranty_end_date
BEFORE INSERT OR UPDATE OF start_date, duration_months ON public.warranty_cards
FOR EACH ROW EXECUTE FUNCTION public.compute_warranty_end_date();

-- توليد رقم مطالبة عميل (WCL-2026-0001)
CREATE OR REPLACE FUNCTION public.generate_warranty_claim_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_year TEXT;
BEGIN
  IF NEW.claim_number IS NOT NULL AND NEW.claim_number != '' THEN
    RETURN NEW;
  END IF;
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.warranty_claims
  WHERE user_id = NEW.user_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  NEW.claim_number := 'WCL-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_warranty_claim_number
BEFORE INSERT ON public.warranty_claims
FOR EACH ROW EXECUTE FUNCTION public.generate_warranty_claim_number();

-- توليد رقم مطالبة الشركة الأم (WSC-2026-0001)
CREATE OR REPLACE FUNCTION public.generate_supplier_claim_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_year TEXT;
BEGIN
  IF NEW.claim_number IS NOT NULL AND NEW.claim_number != '' THEN
    RETURN NEW;
  END IF;
  v_year := EXTRACT(YEAR FROM NOW())::TEXT;
  SELECT COUNT(*) + 1 INTO v_count
  FROM public.warranty_supplier_claims
  WHERE user_id = NEW.user_id
    AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  NEW.claim_number := 'WSC-' || v_year || '-' || LPAD(v_count::TEXT, 4, '0');
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_supplier_claim_number
BEFORE INSERT ON public.warranty_supplier_claims
FOR EACH ROW EXECUTE FUNCTION public.generate_supplier_claim_number();

-- updated_at triggers
CREATE TRIGGER trg_warranty_policies_updated_at
BEFORE UPDATE ON public.warranty_policies
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_warranty_cards_updated_at
BEFORE UPDATE ON public.warranty_cards
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_warranty_claims_updated_at
BEFORE UPDATE ON public.warranty_claims
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_supplier_claims_updated_at
BEFORE UPDATE ON public.warranty_supplier_claims
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- عند إنشاء مطالبة، حدّث حالة البطاقة إلى claimed
CREATE OR REPLACE FUNCTION public.update_warranty_card_on_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('resolved', 'in_progress') THEN
    UPDATE public.warranty_cards
    SET status = 'claimed'
    WHERE id = NEW.warranty_card_id AND status = 'active';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_card_status_on_claim
AFTER INSERT OR UPDATE OF status ON public.warranty_claims
FOR EACH ROW EXECUTE FUNCTION public.update_warranty_card_on_claim();