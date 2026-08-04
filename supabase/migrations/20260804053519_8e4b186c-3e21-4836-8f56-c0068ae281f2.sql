ALTER TABLE public.malaki_portal_settings
  ADD COLUMN IF NOT EXISTS portal_profile text,
  ADD COLUMN IF NOT EXISTS hidden_sections jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.malaki_portal_settings
  DROP CONSTRAINT IF EXISTS malaki_portal_settings_profile_chk;

ALTER TABLE public.malaki_portal_settings
  ADD CONSTRAINT malaki_portal_settings_profile_chk
  CHECK (portal_profile IS NULL OR portal_profile IN ('restaurant','retail','general'));

CREATE INDEX IF NOT EXISTS idx_malaki_portal_settings_linked_user
  ON public.malaki_portal_settings (linked_user_id, updated_at DESC);