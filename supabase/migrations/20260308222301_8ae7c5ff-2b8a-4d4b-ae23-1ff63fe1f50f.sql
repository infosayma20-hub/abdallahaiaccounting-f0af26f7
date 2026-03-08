
-- AI Memory table: stores learned patterns, frequent transactions, preferences
CREATE TABLE public.ai_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  memory_type TEXT NOT NULL DEFAULT 'pattern',
  -- pattern | preference | shortcut | correction
  key TEXT NOT NULL,
  value JSONB NOT NULL DEFAULT '{}',
  frequency INTEGER NOT NULL DEFAULT 1,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX idx_ai_memory_user_type ON public.ai_memory (user_id, memory_type);
CREATE UNIQUE INDEX idx_ai_memory_unique_key ON public.ai_memory (user_id, memory_type, key);

-- RLS
ALTER TABLE public.ai_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own memory"
ON public.ai_memory
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- Auto-update updated_at
CREATE TRIGGER update_ai_memory_updated_at
  BEFORE UPDATE ON public.ai_memory
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
