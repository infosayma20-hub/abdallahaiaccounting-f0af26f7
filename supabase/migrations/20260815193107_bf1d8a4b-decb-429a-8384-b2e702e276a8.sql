CREATE TABLE public.customer_complaints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  customer_name text NOT NULL,
  phone text,
  complaint_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Hebron')::date,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  invoice_number text,
  details text NOT NULL,
  follow_up_method text,
  responder text,
  compensated boolean NOT NULL DEFAULT false,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_customer_complaints_user_date ON public.customer_complaints(user_id, complaint_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_complaints TO authenticated;
GRANT ALL ON public.customer_complaints TO service_role;

ALTER TABLE public.customer_complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team members manage customer complaints"
ON public.customer_complaints FOR ALL TO authenticated
USING (public.is_team_member((SELECT auth.uid()), user_id))
WITH CHECK (public.is_team_member((SELECT auth.uid()), user_id));

CREATE TRIGGER update_customer_complaints_updated_at
BEFORE UPDATE ON public.customer_complaints
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();