ALTER TABLE public.qamar_orders 
ADD COLUMN IF NOT EXISTS sync_type text DEFAULT 'new',
ADD COLUMN IF NOT EXISTS source_key text,
ADD COLUMN IF NOT EXISTS agent_id text,
ADD COLUMN IF NOT EXISTS agent_name text,
ADD COLUMN IF NOT EXISTS all_notes text,
ADD COLUMN IF NOT EXISTS production_notes text,
ADD COLUMN IF NOT EXISTS delivery jsonb DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS synced_at timestamptz;