
-- Sparta CRM module — uses existing is_sparta_holding_*() helpers & company_id like sparta_customers

CREATE TABLE IF NOT EXISTS public.sparta_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.sparta_holding_id(),
  name text NOT NULL,
  company text,
  phone text,
  email text,
  source text,
  status text NOT NULL DEFAULT 'new',
  notes text,
  assigned_to uuid,
  converted_customer_id uuid REFERENCES public.sparta_customers(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_leads TO authenticated;
GRANT ALL ON public.sparta_leads TO service_role;
ALTER TABLE public.sparta_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sparta_leads_select" ON public.sparta_leads FOR SELECT TO authenticated
  USING (public.is_sparta_holding_member(auth.uid()) AND company_id = public.sparta_holding_id());
CREATE POLICY "sparta_leads_insert" ON public.sparta_leads FOR INSERT TO authenticated
  WITH CHECK (public.is_sparta_holding_member(auth.uid()) AND company_id = public.sparta_holding_id());
CREATE POLICY "sparta_leads_update" ON public.sparta_leads FOR UPDATE TO authenticated
  USING (public.is_sparta_holding_member(auth.uid()) AND company_id = public.sparta_holding_id());
CREATE POLICY "sparta_leads_delete" ON public.sparta_leads FOR DELETE TO authenticated
  USING (public.is_sparta_holding_admin(auth.uid()) AND company_id = public.sparta_holding_id());

CREATE TABLE IF NOT EXISTS public.sparta_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.sparta_holding_id(),
  title text NOT NULL,
  customer_id uuid REFERENCES public.sparta_customers(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.sparta_leads(id) ON DELETE SET NULL,
  expected_value numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  probability int NOT NULL DEFAULT 30 CHECK (probability BETWEEN 0 AND 100),
  stage text NOT NULL DEFAULT 'prospect',
  expected_close_date date,
  assigned_to uuid,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_opportunities TO authenticated;
GRANT ALL ON public.sparta_opportunities TO service_role;
ALTER TABLE public.sparta_opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sparta_opps_select" ON public.sparta_opportunities FOR SELECT TO authenticated
  USING (public.is_sparta_holding_member(auth.uid()) AND company_id = public.sparta_holding_id());
CREATE POLICY "sparta_opps_insert" ON public.sparta_opportunities FOR INSERT TO authenticated
  WITH CHECK (public.is_sparta_holding_member(auth.uid()) AND company_id = public.sparta_holding_id());
CREATE POLICY "sparta_opps_update" ON public.sparta_opportunities FOR UPDATE TO authenticated
  USING (public.is_sparta_holding_member(auth.uid()) AND company_id = public.sparta_holding_id());
CREATE POLICY "sparta_opps_delete" ON public.sparta_opportunities FOR DELETE TO authenticated
  USING (public.is_sparta_holding_admin(auth.uid()) AND company_id = public.sparta_holding_id());

CREATE TABLE IF NOT EXISTS public.sparta_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL DEFAULT public.sparta_holding_id(),
  kind text NOT NULL,
  subject text NOT NULL,
  body text,
  due_at timestamptz,
  done_at timestamptz,
  lead_id uuid REFERENCES public.sparta_leads(id) ON DELETE CASCADE,
  opportunity_id uuid REFERENCES public.sparta_opportunities(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.sparta_customers(id) ON DELETE CASCADE,
  assigned_to uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_activities TO authenticated;
GRANT ALL ON public.sparta_activities TO service_role;
ALTER TABLE public.sparta_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sparta_act_select" ON public.sparta_activities FOR SELECT TO authenticated
  USING (public.is_sparta_holding_member(auth.uid()) AND company_id = public.sparta_holding_id());
CREATE POLICY "sparta_act_insert" ON public.sparta_activities FOR INSERT TO authenticated
  WITH CHECK (public.is_sparta_holding_member(auth.uid()) AND company_id = public.sparta_holding_id());
CREATE POLICY "sparta_act_update" ON public.sparta_activities FOR UPDATE TO authenticated
  USING (public.is_sparta_holding_member(auth.uid()) AND company_id = public.sparta_holding_id());
CREATE POLICY "sparta_act_delete" ON public.sparta_activities FOR DELETE TO authenticated
  USING (public.is_sparta_holding_member(auth.uid()) AND company_id = public.sparta_holding_id());

CREATE OR REPLACE FUNCTION public.sparta_crm_touch_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_sparta_leads_touch ON public.sparta_leads;
CREATE TRIGGER trg_sparta_leads_touch BEFORE UPDATE ON public.sparta_leads
  FOR EACH ROW EXECUTE FUNCTION public.sparta_crm_touch_updated_at();
DROP TRIGGER IF EXISTS trg_sparta_opps_touch ON public.sparta_opportunities;
CREATE TRIGGER trg_sparta_opps_touch BEFORE UPDATE ON public.sparta_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.sparta_crm_touch_updated_at();
DROP TRIGGER IF EXISTS trg_sparta_act_touch ON public.sparta_activities;
CREATE TRIGGER trg_sparta_act_touch BEFORE UPDATE ON public.sparta_activities
  FOR EACH ROW EXECUTE FUNCTION public.sparta_crm_touch_updated_at();

CREATE OR REPLACE FUNCTION public.sparta_convert_lead(p_lead_id uuid, p_create_opportunity boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_lead public.sparta_leads%ROWTYPE;
  v_customer_id uuid;
  v_opp_id uuid;
  v_holding uuid;
BEGIN
  v_holding := public.sparta_holding_id();
  IF NOT public.is_sparta_holding_member(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO v_lead FROM public.sparta_leads WHERE id = p_lead_id AND company_id = v_holding FOR UPDATE;
  IF v_lead.id IS NULL THEN RAISE EXCEPTION 'lead_not_found'; END IF;

  IF v_lead.converted_customer_id IS NOT NULL THEN
    v_customer_id := v_lead.converted_customer_id;
  ELSE
    INSERT INTO public.sparta_customers (company_id, name, phone, email, notes, created_by)
    VALUES (v_holding, COALESCE(NULLIF(v_lead.company,''), v_lead.name), v_lead.phone, v_lead.email, v_lead.notes, auth.uid())
    RETURNING id INTO v_customer_id;
  END IF;

  IF p_create_opportunity THEN
    INSERT INTO public.sparta_opportunities (company_id, title, customer_id, lead_id, assigned_to, created_by)
    VALUES (v_holding, 'فرصة - ' || COALESCE(NULLIF(v_lead.company,''), v_lead.name), v_customer_id, v_lead.id, v_lead.assigned_to, auth.uid())
    RETURNING id INTO v_opp_id;
  END IF;

  UPDATE public.sparta_leads SET status='converted', converted_customer_id=v_customer_id WHERE id=p_lead_id;
  RETURN jsonb_build_object('customer_id', v_customer_id, 'opportunity_id', v_opp_id);
END $$;
GRANT EXECUTE ON FUNCTION public.sparta_convert_lead(uuid, boolean) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_sparta_leads_status ON public.sparta_leads (company_id, status);
CREATE INDEX IF NOT EXISTS idx_sparta_opps_stage ON public.sparta_opportunities (company_id, stage);
CREATE INDEX IF NOT EXISTS idx_sparta_act_due ON public.sparta_activities (company_id, due_at) WHERE done_at IS NULL;
