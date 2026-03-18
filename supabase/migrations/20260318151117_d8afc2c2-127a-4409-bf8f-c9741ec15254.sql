
-- Create loan_attachments table
CREATE TABLE public.loan_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  loan_id UUID NOT NULL REFERENCES public.employee_loans(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.loan_attachments ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own loan attachments"
ON public.loan_attachments FOR SELECT TO authenticated
USING (user_id = auth.uid() OR user_id = public.get_team_owner_id(auth.uid()));

CREATE POLICY "Users can insert own loan attachments"
ON public.loan_attachments FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own loan attachments"
ON public.loan_attachments FOR DELETE TO authenticated
USING (user_id = auth.uid());

-- Create storage bucket for loan attachments
INSERT INTO storage.buckets (id, name, public) VALUES ('loan-attachments', 'loan-attachments', true);

-- Storage policies
CREATE POLICY "Authenticated users can upload loan attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'loan-attachments');

CREATE POLICY "Anyone can view loan attachments"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'loan-attachments');

CREATE POLICY "Users can delete their loan attachments"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'loan-attachments');
