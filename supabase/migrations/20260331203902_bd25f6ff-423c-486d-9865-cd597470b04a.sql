
CREATE TABLE public.custom_workshop_types (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '🔧',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_workshop_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own custom workshop types"
  ON public.custom_workshop_types FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own custom workshop types"
  ON public.custom_workshop_types FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own custom workshop types"
  ON public.custom_workshop_types FOR DELETE TO authenticated
  USING (user_id = auth.uid());
