
-- ═══════════════════════════════════════════════════════════════════
-- 1. journal_books — main manageable table
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE public.journal_books (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  color TEXT NOT NULL DEFAULT '#3B82F6',
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT journal_books_code_format CHECK (code ~ '^[A-Z0-9_-]{1,10}$'),
  CONSTRAINT journal_books_user_code_unique UNIQUE (user_id, code)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.journal_books TO authenticated;
GRANT ALL ON public.journal_books TO service_role;

ALTER TABLE public.journal_books ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jb_select_own" ON public.journal_books FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "jb_insert_own" ON public.journal_books FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "jb_update_own" ON public.journal_books FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "jb_delete_own" ON public.journal_books FOR DELETE USING (auth.uid() = user_id AND is_default = false);

CREATE INDEX idx_journal_books_user ON public.journal_books(user_id) WHERE is_active = true;

CREATE TRIGGER trg_journal_books_updated_at
BEFORE UPDATE ON public.journal_books
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Only one default per user
CREATE UNIQUE INDEX idx_journal_books_one_default_per_user
  ON public.journal_books(user_id) WHERE is_default = true;

-- ═══════════════════════════════════════════════════════════════════
-- 2. journal_book_sequences — independent numbering per (book, year)
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE public.journal_book_sequences (
  book_id UUID NOT NULL REFERENCES public.journal_books(id) ON DELETE CASCADE,
  year INT NOT NULL,
  last_number INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (book_id, year)
);

GRANT SELECT ON public.journal_book_sequences TO authenticated;
GRANT ALL ON public.journal_book_sequences TO service_role;

ALTER TABLE public.journal_book_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jbs_select_own" ON public.journal_book_sequences FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.journal_books b WHERE b.id = book_id AND b.user_id = auth.uid()));

-- ═══════════════════════════════════════════════════════════════════
-- 3. Add book_id + book_number to transactions
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS book_id UUID REFERENCES public.journal_books(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS book_number TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_book_id ON public.transactions(book_id) WHERE book_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_transactions_book_number ON public.transactions(book_number) WHERE book_number IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════
-- 4. Backfill: create default "GENERAL" book for every existing user
--    and link all their old transactions to it
-- ═══════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_user RECORD;
  v_book_id UUID;
  v_max_year INT;
  v_count INT;
BEGIN
  FOR v_user IN
    SELECT DISTINCT user_id FROM public.transactions WHERE user_id IS NOT NULL
    UNION
    SELECT DISTINCT id FROM auth.users
  LOOP
    -- Skip if user already has a default book
    IF EXISTS (SELECT 1 FROM public.journal_books WHERE user_id = v_user.user_id AND is_default = true) THEN
      CONTINUE;
    END IF;

    INSERT INTO public.journal_books(user_id, code, name, description, color, is_default, is_active)
    VALUES (v_user.user_id, 'GENERAL', 'دفتر عام', 'الدفتر الافتراضي لجميع القيود', '#64748B', true, true)
    RETURNING id INTO v_book_id;

    -- Link old transactions without a book
    UPDATE public.transactions
      SET book_id = v_book_id
      WHERE user_id = v_user.user_id AND book_id IS NULL;

    -- Seed sequence for current & any prior years used by this user, based on transaction_date
    FOR v_max_year, v_count IN
      SELECT EXTRACT(YEAR FROM transaction_date)::INT AS y, COUNT(*)::INT AS c
      FROM public.transactions
      WHERE user_id = v_user.user_id AND book_id = v_book_id
      GROUP BY EXTRACT(YEAR FROM transaction_date)
    LOOP
      INSERT INTO public.journal_book_sequences(book_id, year, last_number)
      VALUES (v_book_id, v_max_year, 0)
      ON CONFLICT (book_id, year) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════
-- 5. Auto-provision default book for new users
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.ensure_default_journal_book(_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_book_id UUID;
BEGIN
  SELECT id INTO v_book_id
  FROM public.journal_books
  WHERE user_id = _user_id AND is_default = true
  LIMIT 1;

  IF v_book_id IS NULL THEN
    INSERT INTO public.journal_books(user_id, code, name, description, color, is_default, is_active)
    VALUES (_user_id, 'GENERAL', 'دفتر عام', 'الدفتر الافتراضي لجميع القيود', '#64748B', true, true)
    RETURNING id INTO v_book_id;
  END IF;

  RETURN v_book_id;
END $$;

GRANT EXECUTE ON FUNCTION public.ensure_default_journal_book(UUID) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════
-- 6. Atomic allocator: returns next formatted number for a book+year
--    Format: {CODE}-{YEAR}-{0000}
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.allocate_journal_book_number(_book_id UUID, _year INT DEFAULT NULL)
RETURNS TABLE(book_number TEXT, sequence_number INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_user UUID;
  v_year INT;
  v_next INT;
BEGIN
  v_year := COALESCE(_year, EXTRACT(YEAR FROM CURRENT_DATE)::INT);

  SELECT code, user_id INTO v_code, v_user
  FROM public.journal_books
  WHERE id = _book_id AND is_active = true;

  IF v_code IS NULL THEN
    RAISE EXCEPTION 'Journal book % not found or inactive', _book_id;
  END IF;

  IF v_user <> auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to use this journal book';
  END IF;

  -- Atomic upsert-increment
  INSERT INTO public.journal_book_sequences(book_id, year, last_number)
  VALUES (_book_id, v_year, 1)
  ON CONFLICT (book_id, year) DO UPDATE
    SET last_number = journal_book_sequences.last_number + 1,
        updated_at = now()
  RETURNING last_number INTO v_next;

  RETURN QUERY SELECT
    v_code || '-' || v_year::TEXT || '-' || LPAD(v_next::TEXT, 4, '0'),
    v_next;
END $$;

GRANT EXECUTE ON FUNCTION public.allocate_journal_book_number(UUID, INT) TO authenticated;
