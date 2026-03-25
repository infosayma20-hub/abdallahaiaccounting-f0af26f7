
-- Add contact linking to workshops
ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id);
ALTER TABLE public.workshop_costs ADD COLUMN IF NOT EXISTS supplier_contact_id UUID REFERENCES public.contacts(id);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_workshops_contact_id ON public.workshops(contact_id);
CREATE INDEX IF NOT EXISTS idx_workshop_costs_supplier ON public.workshop_costs(supplier_contact_id);
