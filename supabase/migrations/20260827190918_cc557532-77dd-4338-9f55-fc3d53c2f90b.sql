-- 1) Local identifiers for offline-created documents (idempotency anchor)
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS local_id text;
ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS local_id text;
ALTER TABLE public.receipt_vouchers ADD COLUMN IF NOT EXISTS local_id text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_invoices_user_local_id
  ON public.invoices (user_id, local_id) WHERE local_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_vouchers_user_local_id
  ON public.vouchers (user_id, local_id) WHERE local_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_receipt_vouchers_user_local_id
  ON public.receipt_vouchers (user_id, local_id) WHERE local_id IS NOT NULL;

-- 2) Atomic, server-side document number allocation
CREATE OR REPLACE FUNCTION public.allocate_document_number(
  p_user_id uuid,
  p_doc_type text,
  p_prefix text DEFAULT '',
  p_year integer DEFAULT NULL,
  p_pad integer DEFAULT 4
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer := COALESCE(p_year, EXTRACT(YEAR FROM now())::int);
  v_next integer;
BEGIN
  IF p_user_id IS NULL OR p_doc_type IS NULL OR btrim(p_doc_type) = '' THEN
    RAISE EXCEPTION 'allocate_document_number: user_id and doc_type are required';
  END IF;

  INSERT INTO public.document_sequences (user_id, doc_type, year, last_number)
  VALUES (p_user_id, p_doc_type, v_year, 1)
  ON CONFLICT (user_id, doc_type, year)
  DO UPDATE SET last_number = document_sequences.last_number + 1,
                updated_at = now()
  RETURNING last_number INTO v_next;

  RETURN COALESCE(p_prefix, '') || lpad(v_next::text, GREATEST(COALESCE(p_pad, 4), 1), '0');
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_document_number(uuid, text, text, integer, integer) TO authenticated;

-- 3) Seed the sequence from existing data so allocation never collides with history
CREATE OR REPLACE FUNCTION public.seed_document_sequence(
  p_user_id uuid,
  p_doc_type text,
  p_current_max integer,
  p_year integer DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year integer := COALESCE(p_year, EXTRACT(YEAR FROM now())::int);
BEGIN
  INSERT INTO public.document_sequences (user_id, doc_type, year, last_number)
  VALUES (p_user_id, p_doc_type, v_year, GREATEST(COALESCE(p_current_max, 0), 0))
  ON CONFLICT (user_id, doc_type, year)
  DO UPDATE SET last_number = GREATEST(document_sequences.last_number, EXCLUDED.last_number),
                updated_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.seed_document_sequence(uuid, text, integer, integer) TO authenticated;