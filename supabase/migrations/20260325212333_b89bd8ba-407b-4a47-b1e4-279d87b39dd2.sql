
-- Add area, image, type columns to workshops
ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS area_sqm numeric DEFAULT 0;
ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.workshops ADD COLUMN IF NOT EXISTS workshop_type text DEFAULT 'kitchen';

-- Create workshop payments table for partial receipts
CREATE TABLE IF NOT EXISTS public.workshop_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workshop_id uuid NOT NULL REFERENCES public.workshops(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'نقدي',
  payment_date text NOT NULL DEFAULT to_char(now(), 'YYYY-MM-DD'),
  description text,
  linked_transaction_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workshop_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their workshop payments"
  ON public.workshop_payments FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
