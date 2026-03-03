
-- Create activity_log table for team notifications
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  actor_id uuid NOT NULL,
  actor_name text NOT NULL DEFAULT 'مستخدم',
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  entity_label text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

-- Team members can view activity for their team's data
CREATE POLICY "Team can view activity"
  ON public.activity_log FOR SELECT
  USING (is_team_member(auth.uid(), user_id));

-- Authenticated users can insert activity
CREATE POLICY "Authenticated can insert activity"
  ON public.activity_log FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- Enable realtime for activity_log
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;

-- Enable realtime for cheques (for status change notifications)
ALTER PUBLICATION supabase_realtime ADD TABLE public.cheques;

-- Create index for performance
CREATE INDEX idx_activity_log_user_created ON public.activity_log(user_id, created_at DESC);
CREATE INDEX idx_activity_log_actor ON public.activity_log(actor_id);
