
-- Add portal-related columns to tasks table
ALTER TABLE public.tasks 
  ADD COLUMN IF NOT EXISTS created_by_portal boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_by_name text,
  ADD COLUMN IF NOT EXISTS portal_company_id uuid;

-- Enable realtime for tasks table
ALTER PUBLICATION supabase_realtime ADD TABLE public.tasks;
