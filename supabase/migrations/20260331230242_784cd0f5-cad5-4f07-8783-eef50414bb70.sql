
CREATE TABLE public.print_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  template_type TEXT NOT NULL,
  document_number TEXT NOT NULL,
  contact_id UUID REFERENCES public.contacts(id),
  contact_name TEXT,
  document_date DATE DEFAULT CURRENT_DATE,
  validity_days INTEGER,
  data JSONB NOT NULL DEFAULT '{}',
  status TEXT DEFAULT 'draft',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.print_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own print_documents"
  ON public.print_documents FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own print_documents"
  ON public.print_documents FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own print_documents"
  ON public.print_documents FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can delete own print_documents"
  ON public.print_documents FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());
