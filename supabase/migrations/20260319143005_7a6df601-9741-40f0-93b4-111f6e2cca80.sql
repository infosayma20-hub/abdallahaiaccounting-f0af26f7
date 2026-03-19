
-- Per-cashier POS UI preferences (category layout, icon sizes, product arrangement)
CREATE TABLE public.pos_user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preference_key TEXT NOT NULL,
  preference_value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(auth_user_id, preference_key)
);

ALTER TABLE public.pos_user_preferences ENABLE ROW LEVEL SECURITY;

-- Each user can only read/write their own preferences
CREATE POLICY "Users can manage own preferences"
  ON public.pos_user_preferences
  FOR ALL
  TO authenticated
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Add must_change_password flag to pos_users
ALTER TABLE public.pos_users ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT true;
