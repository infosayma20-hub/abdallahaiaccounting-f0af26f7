CREATE TABLE public.print_templates_designs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_type TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT 'قالب جديد',
  design_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.print_templates_designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own designs"
ON public.print_templates_designs
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());