
-- ============================================
-- CRM MODULE: Phase 1 (MVP + Activities)
-- ============================================

-- ENUMS
DO $$ BEGIN
  CREATE TYPE crm_lead_status AS ENUM ('new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm_opportunity_stage AS ENUM ('new', 'contacted', 'qualified', 'proposal', 'negotiation', 'won', 'lost', 'on_hold');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm_priority AS ENUM ('low', 'medium', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm_activity_type AS ENUM ('call', 'whatsapp', 'meeting', 'visit', 'email', 'quote_sent', 'collection_reminder', 'internal_review', 'note');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE crm_activity_status AS ENUM ('pending', 'completed', 'cancelled', 'overdue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================
-- 1. LEADS
-- ============================================
CREATE TABLE IF NOT EXISTS public.crm_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  
  -- Basic info
  title TEXT NOT NULL,
  contact_name TEXT,
  company_name TEXT,
  phone TEXT,
  mobile TEXT,
  whatsapp TEXT,
  email TEXT,
  city TEXT,
  region TEXT,
  industry TEXT,
  
  -- Source tracking
  source TEXT,                   -- 'website', 'whatsapp', 'facebook', 'referral', 'walk_in', 'campaign', 'manual', etc.
  source_details TEXT,
  campaign TEXT,
  
  -- Sales info
  estimated_value NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'شيكل',
  probability INTEGER DEFAULT 0 CHECK (probability >= 0 AND probability <= 100),
  interested_products TEXT,
  
  -- Assignment
  assigned_to UUID,              -- profiles.user_id
  sales_team TEXT,
  priority crm_priority DEFAULT 'medium',
  tags TEXT[] DEFAULT '{}',
  
  -- Status
  status crm_lead_status DEFAULT 'new',
  lost_reason TEXT,
  
  -- Linkages
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  converted_opportunity_id UUID,
  converted_at TIMESTAMPTZ,
  
  -- Tracking
  notes TEXT,
  next_activity_date DATE,
  last_activity_date TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_leads_user ON public.crm_leads(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON public.crm_leads(user_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_leads_assigned ON public.crm_leads(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_leads_contact ON public.crm_leads(contact_id);

ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members manage leads"
  ON public.crm_leads FOR ALL
  USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- ============================================
-- 2. OPPORTUNITIES (Pipeline)
-- ============================================
CREATE TABLE IF NOT EXISTS public.crm_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  
  -- Basic
  title TEXT NOT NULL,
  description TEXT,
  
  -- Linkage
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  customer_name TEXT,
  
  -- Financials
  expected_value NUMERIC DEFAULT 0,
  currency TEXT DEFAULT 'شيكل',
  probability INTEGER DEFAULT 50 CHECK (probability >= 0 AND probability <= 100),
  weighted_value NUMERIC GENERATED ALWAYS AS (expected_value * probability / 100.0) STORED,
  
  -- Pipeline
  stage crm_opportunity_stage DEFAULT 'new',
  stage_order INTEGER DEFAULT 0,
  expected_close_date DATE,
  actual_close_date DATE,
  
  -- Assignment
  assigned_to UUID,
  sales_team TEXT,
  priority crm_priority DEFAULT 'medium',
  tags TEXT[] DEFAULT '{}',
  
  -- Win/Loss
  won_at TIMESTAMPTZ,
  lost_at TIMESTAMPTZ,
  lost_reason TEXT,
  
  -- Conversion
  converted_invoice_id UUID,
  converted_at TIMESTAMPTZ,
  
  -- Tracking
  notes TEXT,
  next_activity_date DATE,
  last_activity_date TIMESTAMPTZ,
  stage_changed_at TIMESTAMPTZ DEFAULT now(),
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_opp_user ON public.crm_opportunities(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_opp_stage ON public.crm_opportunities(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_crm_opp_assigned ON public.crm_opportunities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_crm_opp_contact ON public.crm_opportunities(contact_id);
CREATE INDEX IF NOT EXISTS idx_crm_opp_lead ON public.crm_opportunities(lead_id);

ALTER TABLE public.crm_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members manage opportunities"
  ON public.crm_opportunities FOR ALL
  USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- ============================================
-- 3. ACTIVITIES
-- ============================================
CREATE TABLE IF NOT EXISTS public.crm_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  
  -- Type & content
  activity_type crm_activity_type DEFAULT 'call',
  title TEXT NOT NULL,
  description TEXT,
  
  -- Linkage (one of these)
  lead_id UUID REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE CASCADE,
  
  -- Scheduling
  scheduled_at TIMESTAMPTZ,
  due_date DATE,
  duration_minutes INTEGER,
  
  -- Assignment
  assigned_to UUID,
  
  -- Status
  status crm_activity_status DEFAULT 'pending',
  completed_at TIMESTAMPTZ,
  completion_notes TEXT,
  outcome TEXT,
  
  -- Priority
  priority crm_priority DEFAULT 'medium',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_act_user ON public.crm_activities(user_id);
CREATE INDEX IF NOT EXISTS idx_crm_act_status ON public.crm_activities(user_id, status);
CREATE INDEX IF NOT EXISTS idx_crm_act_due ON public.crm_activities(user_id, due_date) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_crm_act_lead ON public.crm_activities(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_act_opp ON public.crm_activities(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_crm_act_contact ON public.crm_activities(contact_id);

ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members manage activities"
  ON public.crm_activities FOR ALL
  USING (public.is_team_member(auth.uid(), user_id))
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- ============================================
-- 4. STAGE HISTORY (for analytics)
-- ============================================
CREATE TABLE IF NOT EXISTS public.crm_opportunity_stage_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  opportunity_id UUID NOT NULL REFERENCES public.crm_opportunities(id) ON DELETE CASCADE,
  from_stage crm_opportunity_stage,
  to_stage crm_opportunity_stage NOT NULL,
  changed_by UUID,
  duration_in_previous_stage_seconds INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_crm_stage_hist_opp ON public.crm_opportunity_stage_history(opportunity_id);
CREATE INDEX IF NOT EXISTS idx_crm_stage_hist_user ON public.crm_opportunity_stage_history(user_id);

ALTER TABLE public.crm_opportunity_stage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members view stage history"
  ON public.crm_opportunity_stage_history FOR SELECT
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Team members insert stage history"
  ON public.crm_opportunity_stage_history FOR INSERT
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

-- ============================================
-- TRIGGERS
-- ============================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.crm_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_crm_leads_updated ON public.crm_leads;
CREATE TRIGGER trg_crm_leads_updated BEFORE UPDATE ON public.crm_leads
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_opp_updated ON public.crm_opportunities;
CREATE TRIGGER trg_crm_opp_updated BEFORE UPDATE ON public.crm_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

DROP TRIGGER IF EXISTS trg_crm_act_updated ON public.crm_activities;
CREATE TRIGGER trg_crm_act_updated BEFORE UPDATE ON public.crm_activities
  FOR EACH ROW EXECUTE FUNCTION public.crm_set_updated_at();

-- Track stage changes
CREATE OR REPLACE FUNCTION public.crm_track_stage_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_duration INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.stage IS DISTINCT FROM NEW.stage THEN
    v_duration := EXTRACT(EPOCH FROM (now() - OLD.stage_changed_at))::INTEGER;
    
    INSERT INTO public.crm_opportunity_stage_history (
      user_id, opportunity_id, from_stage, to_stage,
      changed_by, duration_in_previous_stage_seconds
    ) VALUES (
      NEW.user_id, NEW.id, OLD.stage, NEW.stage,
      auth.uid(), v_duration
    );
    
    NEW.stage_changed_at := now();
    
    -- Auto-set won/lost timestamps
    IF NEW.stage = 'won' AND OLD.stage != 'won' THEN
      NEW.won_at := now();
      NEW.actual_close_date := COALESCE(NEW.actual_close_date, CURRENT_DATE);
    ELSIF NEW.stage = 'lost' AND OLD.stage != 'lost' THEN
      NEW.lost_at := now();
      NEW.actual_close_date := COALESCE(NEW.actual_close_date, CURRENT_DATE);
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_crm_opp_stage_change ON public.crm_opportunities;
CREATE TRIGGER trg_crm_opp_stage_change BEFORE UPDATE ON public.crm_opportunities
  FOR EACH ROW EXECUTE FUNCTION public.crm_track_stage_change();

-- Update last_activity_date on parent when activity completes
CREATE OR REPLACE FUNCTION public.crm_update_parent_last_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' THEN
    IF NEW.lead_id IS NOT NULL THEN
      UPDATE public.crm_leads SET last_activity_date = now() WHERE id = NEW.lead_id;
    END IF;
    IF NEW.opportunity_id IS NOT NULL THEN
      UPDATE public.crm_opportunities SET last_activity_date = now() WHERE id = NEW.opportunity_id;
    END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_crm_act_parent_update ON public.crm_activities;
CREATE TRIGGER trg_crm_act_parent_update AFTER INSERT OR UPDATE ON public.crm_activities
  FOR EACH ROW EXECUTE FUNCTION public.crm_update_parent_last_activity();
