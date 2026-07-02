
ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS book_id UUID REFERENCES public.journal_books(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS book_number TEXT;

CREATE INDEX IF NOT EXISTS idx_vouchers_book_id ON public.vouchers(book_id) WHERE book_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vouchers_book_number ON public.vouchers(book_number) WHERE book_number IS NOT NULL;

-- Backfill safely: bypass integrity guards for this pure metadata update.
ALTER TABLE public.vouchers DISABLE TRIGGER USER;

UPDATE public.vouchers v
   SET book_id = b.id
  FROM public.journal_books b
 WHERE v.user_id = b.user_id
   AND b.is_default = true
   AND v.book_id IS NULL;

ALTER TABLE public.vouchers ENABLE TRIGGER USER;

GRANT EXECUTE ON FUNCTION public.allocate_journal_book_number(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.ensure_default_journal_book(UUID) TO service_role;
