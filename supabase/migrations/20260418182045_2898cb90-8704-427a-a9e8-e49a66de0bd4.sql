-- Favorite apps per user (for Apps Launcher ⭐ system)
CREATE TABLE public.user_favorite_apps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  app_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, app_id)
);

CREATE INDEX idx_user_favorite_apps_user ON public.user_favorite_apps(user_id);

ALTER TABLE public.user_favorite_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own favorite apps"
ON public.user_favorite_apps FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can add their own favorite apps"
ON public.user_favorite_apps FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own favorite apps"
ON public.user_favorite_apps FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can remove their own favorite apps"
ON public.user_favorite_apps FOR DELETE
USING (auth.uid() = user_id);

-- Realtime support so favorites sync across tabs/devices
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_favorite_apps;