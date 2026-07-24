
-- 1) marketing_campaigns
CREATE TABLE public.marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  year INTEGER NOT NULL,
  season TEXT NOT NULL, -- ramadan|tawjihi|winter|eid|opening|other
  start_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'historical', -- historical|active|planned|archived
  source TEXT NOT NULL DEFAULT 'imported',   -- imported|live_pos
  pos_category_ids UUID[] DEFAULT '{}'::uuid[],
  notes TEXT,
  color TEXT,
  source_file TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT ALL ON public.marketing_campaigns TO service_role;

-- 2) marketing_campaign_sales
CREATE TABLE public.marketing_campaign_sales (
  id BIGSERIAL PRIMARY KEY,
  campaign_id UUID NOT NULL REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  sale_date DATE NOT NULL,
  sale_datetime TIMESTAMPTZ,
  invoice_no TEXT,
  doc_type TEXT,
  category_ar TEXT,
  item_name TEXT NOT NULL,
  variant TEXT,
  qty_dine_in NUMERIC(14,3) NOT NULL DEFAULT 0,
  qty_take_out NUMERIC(14,3) NOT NULL DEFAULT 0,
  qty_total NUMERIC(14,3) GENERATED ALWAYS AS (COALESCE(qty_dine_in,0) + COALESCE(qty_take_out,0)) STORED,
  unit_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'NIS',
  customer_name TEXT,
  branch_name TEXT,
  source_file TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaign_sales TO authenticated;
GRANT ALL ON public.marketing_campaign_sales TO service_role;

CREATE INDEX idx_mcs_campaign ON public.marketing_campaign_sales(campaign_id);
CREATE INDEX idx_mcs_date ON public.marketing_campaign_sales(sale_date);
CREATE INDEX idx_mcs_branch ON public.marketing_campaign_sales(branch_name);
CREATE INDEX idx_mcs_item ON public.marketing_campaign_sales(item_name);
CREATE INDEX idx_mcs_camp_date_branch ON public.marketing_campaign_sales(campaign_id, sale_date, branch_name);

-- 3) Visibility helper (super_admin/admin OR whitelisted email)
CREATE OR REPLACE FUNCTION public.can_view_marketing_campaigns()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND lower(u.email) IN (
          'malakybroast@gmail.com',
          'mosaab@malaky.com',
          'kamal@malaky.com'
        )
    );
$$;

GRANT EXECUTE ON FUNCTION public.can_view_marketing_campaigns() TO authenticated;

-- 4) RLS
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaign_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "campaigns_view_authorized"
  ON public.marketing_campaigns FOR SELECT TO authenticated
  USING (public.can_view_marketing_campaigns());

CREATE POLICY "campaigns_manage_super_admin"
  ON public.marketing_campaigns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "campaign_sales_view_authorized"
  ON public.marketing_campaign_sales FOR SELECT TO authenticated
  USING (public.can_view_marketing_campaigns());

CREATE POLICY "campaign_sales_manage_super_admin"
  ON public.marketing_campaign_sales FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::app_role));

-- 5) updated_at trigger
CREATE TRIGGER trg_marketing_campaigns_updated
  BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
