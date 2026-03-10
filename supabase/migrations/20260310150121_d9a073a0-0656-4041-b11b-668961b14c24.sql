
CREATE TABLE public.company_themes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  theme_colors JSONB NOT NULL DEFAULT '{
    "sidebar": "#0D1B2A",
    "primary": "#E8A020",
    "accent": "#F45E0C",
    "topbar": "#08111A",
    "cardAccent": "#E8A020",
    "extractedFromLogo": false,
    "presetName": "classic"
  }'::jsonb,
  logo_extracted_palette TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.company_themes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own theme"
  ON public.company_themes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own theme"
  ON public.company_themes FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own theme"
  ON public.company_themes FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
