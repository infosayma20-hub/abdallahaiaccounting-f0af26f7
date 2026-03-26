
-- Add new columns to workshop_costs table for professional cost tracking
ALTER TABLE public.workshop_costs 
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS quantity NUMERIC DEFAULT 1,
  ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'piece',
  ADD COLUMN IF NOT EXISTS unit_price NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waste_percentage NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waste_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT 'preparation',
  ADD COLUMN IF NOT EXISTS invoice_number TEXT,
  ADD COLUMN IF NOT EXISTS receipt_url TEXT;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_workshop_costs_category ON public.workshop_costs (workshop_id, category);
CREATE INDEX IF NOT EXISTS idx_workshop_costs_phase ON public.workshop_costs (workshop_id, phase);
