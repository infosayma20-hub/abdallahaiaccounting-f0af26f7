-- 1) ISO manuals (folders)
CREATE TABLE public.iso_manuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code text NOT NULL,
  name_ar text NOT NULL,
  owner_role_label text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.iso_manuals TO authenticated;
GRANT ALL ON public.iso_manuals TO service_role;
ALTER TABLE public.iso_manuals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view iso manuals" ON public.iso_manuals
FOR SELECT TO authenticated USING (is_team_member(auth.uid(), user_id));
CREATE POLICY "Admins manage iso manuals" ON public.iso_manuals
FOR ALL TO authenticated
USING (is_team_member(auth.uid(), user_id) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_manager'::app_role)))
WITH CHECK (is_team_member(auth.uid(), user_id) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_manager'::app_role)));

-- 2) ISO documents (procedures + work instructions, read-only library)
CREATE TABLE public.iso_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  manual_code text NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  doc_type text NOT NULL DEFAULT 'procedure',
  description text,
  file_path text,
  file_url text,
  file_mime text,
  version text NOT NULL DEFAULT '1',
  effective_date date,
  retention text,
  responsible_label text,
  requires_ack boolean NOT NULL DEFAULT true,
  target_job_title_names text[] NOT NULL DEFAULT '{}',
  target_employee_ids uuid[] NOT NULL DEFAULT '{}',
  approver_employee_ids uuid[] NOT NULL DEFAULT '{}',
  viewer_employee_ids uuid[] NOT NULL DEFAULT '{}',
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_deleted boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.iso_documents TO authenticated;
GRANT ALL ON public.iso_documents TO service_role;
ALTER TABLE public.iso_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view iso documents" ON public.iso_documents
FOR SELECT TO authenticated
USING (is_team_member(auth.uid(), user_id) AND is_deleted = false);
CREATE POLICY "Admins manage iso documents" ON public.iso_documents
FOR ALL TO authenticated
USING (is_team_member(auth.uid(), user_id) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_manager'::app_role)))
WITH CHECK (is_team_member(auth.uid(), user_id) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_manager'::app_role)));

CREATE INDEX idx_iso_documents_owner_manual ON public.iso_documents (user_id, manual_code) WHERE is_deleted = false;

-- 3) Acknowledgements
CREATE TABLE public.iso_document_acknowledgements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  document_id uuid NOT NULL REFERENCES public.iso_documents(id) ON DELETE CASCADE,
  employee_id uuid,
  acknowledged_by uuid NOT NULL DEFAULT auth.uid(),
  document_version text,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, acknowledged_by, document_version)
);
GRANT SELECT, INSERT ON public.iso_document_acknowledgements TO authenticated;
GRANT ALL ON public.iso_document_acknowledgements TO service_role;
ALTER TABLE public.iso_document_acknowledgements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own or admin can view acks" ON public.iso_document_acknowledgements
FOR SELECT TO authenticated
USING (acknowledged_by = auth.uid() OR (is_team_member(auth.uid(), user_id) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_manager'::app_role))));
CREATE POLICY "Users can insert own ack" ON public.iso_document_acknowledgements
FOR INSERT TO authenticated
WITH CHECK (acknowledged_by = auth.uid() AND is_team_member(auth.uid(), user_id));

-- 4) ISO metadata on dynamic form templates
ALTER TABLE public.form_templates
  ADD COLUMN IF NOT EXISTS iso_code text,
  ADD COLUMN IF NOT EXISTS iso_manual_code text,
  ADD COLUMN IF NOT EXISTS iso_schedule text,
  ADD COLUMN IF NOT EXISTS iso_retention text,
  ADD COLUMN IF NOT EXISTS iso_notify boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iso_notify_mandatory boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS iso_responsible_label text,
  ADD COLUMN IF NOT EXISTS approver_employee_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS viewer_employee_ids uuid[] NOT NULL DEFAULT '{}';

-- 5) ISO code for built-in employee app forms
ALTER TABLE public.builtin_form_settings
  ADD COLUMN IF NOT EXISTS iso_code text,
  ADD COLUMN IF NOT EXISTS iso_manual_code text;

-- 6) updated_at triggers
CREATE TRIGGER trg_iso_manuals_updated_at BEFORE UPDATE ON public.iso_manuals
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_iso_documents_updated_at BEFORE UPDATE ON public.iso_documents
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 7) Storage policies for the private iso-documents bucket (bucket created separately)
CREATE POLICY "Team can read iso document files" ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'iso-documents' AND is_team_member(auth.uid(), (storage.foldername(name))[1]::uuid));

CREATE POLICY "Admins manage iso document files" ON storage.objects
FOR ALL TO authenticated
USING (bucket_id = 'iso-documents' AND is_team_member(auth.uid(), (storage.foldername(name))[1]::uuid) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_manager'::app_role)))
WITH CHECK (bucket_id = 'iso-documents' AND is_team_member(auth.uid(), (storage.foldername(name))[1]::uuid) AND (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_manager'::app_role)));