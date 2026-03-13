
-- Add offline sync columns to pos_orders
ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS was_offline BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS local_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_status VARCHAR(20) DEFAULT 'synced';

-- Create pos_sync_log table
CREATE TABLE IF NOT EXISTS public.pos_sync_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  device_id TEXT,
  offline_started_at TIMESTAMPTZ,
  online_restored_at TIMESTAMPTZ,
  offline_duration_minutes INTEGER,
  transactions_count INTEGER DEFAULT 0,
  synced_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS on pos_sync_log
ALTER TABLE public.pos_sync_log ENABLE ROW LEVEL SECURITY;

-- RLS: users can only see their own sync logs
CREATE POLICY "Users can view own sync logs"
  ON public.pos_sync_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Users can insert own sync logs"
  ON public.pos_sync_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
