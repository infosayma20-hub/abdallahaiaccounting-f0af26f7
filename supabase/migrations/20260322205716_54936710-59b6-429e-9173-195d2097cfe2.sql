
-- Add branch_id to cash_boxes for direct branch linking
ALTER TABLE public.cash_boxes ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL;

-- Create index for quick lookup
CREATE INDEX IF NOT EXISTS idx_cash_boxes_branch_id ON public.cash_boxes(branch_id);
