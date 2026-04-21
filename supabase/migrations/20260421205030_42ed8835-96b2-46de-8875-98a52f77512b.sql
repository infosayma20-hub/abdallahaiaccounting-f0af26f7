ALTER TABLE public.cheques
ADD COLUMN IF NOT EXISTS account_number text;

COMMENT ON COLUMN public.cheques.account_number IS 'رقم الحساب البنكي لصاحب الشيك (مُلزم في الواجهة للشيكات الواردة فقط)';

CREATE INDEX IF NOT EXISTS idx_cheques_account_number
  ON public.cheques(account_number)
  WHERE account_number IS NOT NULL;