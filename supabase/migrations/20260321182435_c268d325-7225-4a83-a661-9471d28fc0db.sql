
-- Add is_manager and is_hr_manager columns to employees table
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS is_manager boolean NOT NULL DEFAULT false;
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS is_hr_manager boolean NOT NULL DEFAULT false;

-- Create employee_forms table for all form submissions
CREATE TABLE public.employee_forms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  form_type text NOT NULL,
  form_data jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  review_notes text,
  reviewed_at timestamptz,
  attachment_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.employee_forms ENABLE ROW LEVEL SECURITY;

-- Policy: employees can insert their own forms
CREATE POLICY "Employees can insert own forms" ON public.employee_forms
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_id AND e.auth_user_id = auth.uid()
    )
  );

-- Policy: employees can view their own forms
CREATE POLICY "Employees can view own forms" ON public.employee_forms
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees e
      WHERE e.id = employee_id AND e.auth_user_id = auth.uid()
    )
    OR public.is_team_member(auth.uid(), user_id)
  );

-- Policy: team owner/admin can update forms (approve/reject)
CREATE POLICY "Admins can update forms" ON public.employee_forms
  FOR UPDATE TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

-- Create storage bucket for form attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('employee-forms', 'employee-forms', true)
ON CONFLICT DO NOTHING;

-- Storage policy for employee-forms bucket
CREATE POLICY "Anyone can upload form attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-forms');

CREATE POLICY "Anyone can view form attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'employee-forms');

-- Create employee_policy_documents table for PDF policies
CREATE TABLE public.employee_policy_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  file_url text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_policy_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members can view policies" ON public.employee_policy_documents
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));

CREATE POLICY "Admins can manage policies" ON public.employee_policy_documents
  FOR ALL TO authenticated
  USING (public.is_team_member(auth.uid(), user_id));
