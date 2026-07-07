
ALTER TABLE public.employee_leaves
  ADD COLUMN IF NOT EXISTS attachment_url text,
  ADD COLUMN IF NOT EXISTS attachment_path text;
