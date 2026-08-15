ALTER TABLE public.customer_complaints
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'جاري المتابعة';

ALTER TABLE public.customer_complaints
  DROP CONSTRAINT IF EXISTS customer_complaints_status_chk;

ALTER TABLE public.customer_complaints
  ADD CONSTRAINT customer_complaints_status_chk CHECK (status IN ('جاري المتابعة','جاهز'));

CREATE INDEX IF NOT EXISTS idx_customer_complaints_status ON public.customer_complaints(user_id, status);