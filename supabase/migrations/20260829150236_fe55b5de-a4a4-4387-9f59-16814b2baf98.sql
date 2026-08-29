ALTER TABLE public.job_application_links
  ADD COLUMN IF NOT EXISTS form_config jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.job_applications
  ADD COLUMN IF NOT EXISTS custom_answers jsonb NOT NULL DEFAULT '[]'::jsonb;