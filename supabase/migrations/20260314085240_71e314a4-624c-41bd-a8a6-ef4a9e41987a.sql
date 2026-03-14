
-- Add advanced permission columns to company_settings
ALTER TABLE public.company_settings
  ADD COLUMN IF NOT EXISTS can_edit_posted BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_delete_posted BOOLEAN DEFAULT FALSE;

-- Create document edit history table
CREATE TABLE IF NOT EXISTS public.document_edit_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL,
  document_type VARCHAR(30) NOT NULL,
  old_data JSONB,
  new_data JSONB,
  changes JSONB,
  edit_reason TEXT,
  edited_by UUID NOT NULL,
  edited_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL
);

-- Enable RLS
ALTER TABLE public.document_edit_history ENABLE ROW LEVEL SECURITY;

-- RLS policy: users can see their own edit history
CREATE POLICY "Users can view own edit history"
  ON public.document_edit_history FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "Users can insert own edit history"
  ON public.document_edit_history FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id = public.get_team_owner_id(auth.uid()));
