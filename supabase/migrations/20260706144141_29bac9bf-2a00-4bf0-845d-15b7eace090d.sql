
ALTER TABLE public.form_templates
  ADD COLUMN IF NOT EXISTS cloned_from_template_id uuid REFERENCES public.form_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_form_templates_cloned_from
  ON public.form_templates(user_id, cloned_from_template_id)
  WHERE cloned_from_template_id IS NOT NULL;
