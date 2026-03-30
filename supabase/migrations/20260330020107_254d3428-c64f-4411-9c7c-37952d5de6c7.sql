
CREATE TABLE public.workshop_material_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  material_type TEXT NOT NULL,
  material_category TEXT,
  quantity DECIMAL NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'piece',
  unit_cost DECIMAL NOT NULL DEFAULT 0,
  total_value DECIMAL NOT NULL DEFAULT 0,
  source_workshop_id UUID REFERENCES public.workshops(id) ON DELETE SET NULL,
  source_cost_id UUID,
  supplier_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  supplier_name TEXT,
  status TEXT NOT NULL DEFAULT 'available',
  target_workshop_id UUID REFERENCES public.workshops(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.workshop_material_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own inventory"
  ON public.workshop_material_inventory
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
