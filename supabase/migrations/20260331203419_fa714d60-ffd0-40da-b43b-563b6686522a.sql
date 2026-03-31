
CREATE TABLE public.custom_cost_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '📦',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_cost_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own custom cost categories"
  ON public.custom_cost_categories FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own custom cost categories"
  ON public.custom_cost_categories FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own custom cost categories"
  ON public.custom_cost_categories FOR DELETE TO authenticated
  USING (user_id = auth.uid());
