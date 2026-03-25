
-- Workshops table
CREATE TABLE public.workshops (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  address TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  total_budget NUMERIC DEFAULT 0,
  start_date DATE DEFAULT CURRENT_DATE,
  expected_end_date DATE,
  actual_end_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Workshop costs table
CREATE TABLE public.workshop_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id UUID NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  cost_type TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL DEFAULT 0,
  cost_date DATE DEFAULT CURRENT_DATE,
  supplier_name TEXT,
  payment_method TEXT DEFAULT 'نقدي',
  receipt_image_url TEXT,
  notes TEXT,
  linked_transaction_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.workshops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workshop_costs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "workshops_select" ON public.workshops FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "workshops_insert" ON public.workshops FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "workshops_update" ON public.workshops FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "workshops_delete" ON public.workshops FOR DELETE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "workshop_costs_select" ON public.workshop_costs FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "workshop_costs_insert" ON public.workshop_costs FOR INSERT TO authenticated
  WITH CHECK (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "workshop_costs_update" ON public.workshop_costs FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "workshop_costs_delete" ON public.workshop_costs FOR DELETE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

-- Indexes
CREATE INDEX idx_workshops_user_id ON public.workshops(user_id);
CREATE INDEX idx_workshop_costs_workshop_id ON public.workshop_costs(workshop_id);
CREATE INDEX idx_workshop_costs_user_id ON public.workshop_costs(user_id);

-- Validation trigger for status
CREATE OR REPLACE FUNCTION public.validate_workshop_status()
  RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('active', 'completed', 'cancelled', 'paused') THEN
    RAISE EXCEPTION 'Invalid workshop status: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_workshop_status_trigger
  BEFORE INSERT OR UPDATE ON public.workshops
  FOR EACH ROW EXECUTE FUNCTION public.validate_workshop_status();
