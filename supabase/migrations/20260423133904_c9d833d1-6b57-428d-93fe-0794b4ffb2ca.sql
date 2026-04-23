-- Create journal_templates table for saved journal entry templates
CREATE TABLE IF NOT EXISTS public.journal_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  icon TEXT DEFAULT '📋',
  description TEXT,
  default_subtype TEXT DEFAULT 'normal',
  default_contact_id UUID,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_journal_templates_user ON public.journal_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_journal_templates_usage ON public.journal_templates(user_id, usage_count DESC, last_used_at DESC);

-- RLS
ALTER TABLE public.journal_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own journal templates"
  ON public.journal_templates FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own journal templates"
  ON public.journal_templates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own journal templates"
  ON public.journal_templates FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own journal templates"
  ON public.journal_templates FOR DELETE
  USING (auth.uid() = user_id);

-- Updated-at trigger (reuses existing function if available)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname='update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS update_journal_templates_updated_at ON public.journal_templates;
    CREATE TRIGGER update_journal_templates_updated_at
    BEFORE UPDATE ON public.journal_templates
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;