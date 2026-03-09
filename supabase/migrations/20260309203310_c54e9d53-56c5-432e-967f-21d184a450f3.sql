
-- Add last_notified_at to subscriptions
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_notified_at timestamptz;

-- Create notification_log table
CREATE TABLE public.notification_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL, -- 'expiry_7days' | 'expiry_3days' | 'expiry_1day' | 'expired'
  channel text NOT NULL DEFAULT 'in_app', -- 'in_app' | 'email' | 'whatsapp'
  sent_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  title text,
  body text,
  path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications
CREATE POLICY "Users can read own notifications"
  ON public.notification_log FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users can update own notifications"
  ON public.notification_log FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role can insert notifications (from edge functions)
CREATE POLICY "Service role can insert notifications"
  ON public.notification_log FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
