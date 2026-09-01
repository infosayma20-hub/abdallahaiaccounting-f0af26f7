-- ============ Goods Receipt / Issue vouchers ============
CREATE TABLE public.stock_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  doc_number text NOT NULL,
  doc_type text NOT NULL CHECK (doc_type IN ('in','out')),
  doc_date date NOT NULL DEFAULT CURRENT_DATE,
  warehouse_id uuid REFERENCES public.warehouses(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','cancelled')),
  reason text,
  notes text,
  total_items integer NOT NULL DEFAULT 0,
  total_quantity numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  create_journal boolean NOT NULL DEFAULT false,
  inventory_account_code text,
  counter_account_code text,
  journal_reference text,
  confirmed_at timestamptz,
  confirmed_by uuid,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancel_reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, doc_number)
);

CREATE TABLE public.stock_document_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id uuid NOT NULL REFERENCES public.stock_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  product_id uuid NOT NULL REFERENCES public.products(id),
  product_name text,
  unit text,
  quantity numeric NOT NULL DEFAULT 0,
  unit_cost numeric NOT NULL DEFAULT 0,
  line_total numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.stock_document_sequences (
  user_id uuid NOT NULL,
  doc_type text NOT NULL,
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, doc_type, year)
);

CREATE INDEX idx_stock_documents_user_date ON public.stock_documents(user_id, doc_date DESC);
CREATE INDEX idx_stock_documents_status ON public.stock_documents(user_id, status);
CREATE INDEX idx_stock_document_items_doc ON public.stock_document_items(doc_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_documents TO authenticated;
GRANT ALL ON public.stock_documents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_document_items TO authenticated;
GRANT ALL ON public.stock_document_items TO service_role;
GRANT SELECT ON public.stock_document_sequences TO authenticated;
GRANT ALL ON public.stock_document_sequences TO service_role;

ALTER TABLE public.stock_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_document_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_document_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own stock documents" ON public.stock_documents
  FOR SELECT TO authenticated USING (public.is_team_member((SELECT auth.uid()), user_id));
CREATE POLICY "Users insert own stock documents" ON public.stock_documents
  FOR INSERT TO authenticated WITH CHECK (public.is_team_member((SELECT auth.uid()), user_id));
CREATE POLICY "Users update own stock documents" ON public.stock_documents
  FOR UPDATE TO authenticated USING (public.is_team_member((SELECT auth.uid()), user_id));
CREATE POLICY "Users delete own stock documents" ON public.stock_documents
  FOR DELETE TO authenticated USING (public.is_team_member((SELECT auth.uid()), user_id));

CREATE POLICY "Users view own stock document items" ON public.stock_document_items
  FOR SELECT TO authenticated USING (public.is_team_member((SELECT auth.uid()), user_id));
CREATE POLICY "Users insert own stock document items" ON public.stock_document_items
  FOR INSERT TO authenticated WITH CHECK (public.is_team_member((SELECT auth.uid()), user_id));
CREATE POLICY "Users update own stock document items" ON public.stock_document_items
  FOR UPDATE TO authenticated USING (public.is_team_member((SELECT auth.uid()), user_id));
CREATE POLICY "Users delete own stock document items" ON public.stock_document_items
  FOR DELETE TO authenticated USING (public.is_team_member((SELECT auth.uid()), user_id));

CREATE POLICY "Users view own stock doc sequences" ON public.stock_document_sequences
  FOR SELECT TO authenticated USING (public.is_team_member((SELECT auth.uid()), user_id));

CREATE TRIGGER update_stock_documents_updated_at
  BEFORE UPDATE ON public.stock_documents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Number allocation: GRN-2026-0001 / GIN-2026-0001
CREATE OR REPLACE FUNCTION public.allocate_stock_document_number(p_user_id uuid, p_doc_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year int := EXTRACT(YEAR FROM CURRENT_DATE)::int;
  v_next int;
  v_prefix text := CASE WHEN p_doc_type = 'in' THEN 'GRN' ELSE 'GIN' END;
BEGIN
  IF NOT public.is_team_member(auth.uid(), p_user_id) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;
  INSERT INTO public.stock_document_sequences(user_id, doc_type, year, last_number)
  VALUES (p_user_id, p_doc_type, v_year, 1)
  ON CONFLICT (user_id, doc_type, year)
  DO UPDATE SET last_number = public.stock_document_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN v_prefix || '-' || v_year::text || '-' || lpad(v_next::text, 4, '0');
END;
$$;

-- Confirm: write real stock movements (+ optional journal entry)
CREATE OR REPLACE FUNCTION public.confirm_stock_document(p_doc_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.stock_documents%ROWTYPE;
  v_count int := 0;
  v_mv text;
  v_journal jsonb;
  v_lines jsonb;
BEGIN
  SELECT * INTO v_doc FROM public.stock_documents WHERE id = p_doc_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'document not found'); END IF;
  IF NOT public.is_team_member(auth.uid(), v_doc.user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;
  IF v_doc.status <> 'draft' THEN
    RETURN jsonb_build_object('success', false, 'error', 'document is not a draft');
  END IF;
  IF v_doc.warehouse_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'warehouse required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.stock_document_items WHERE doc_id = p_doc_id AND quantity > 0) THEN
    RETURN jsonb_build_object('success', false, 'error', 'no lines with quantity');
  END IF;

  v_mv := CASE WHEN v_doc.doc_type = 'in' THEN 'وارد' ELSE 'صادر' END;

  INSERT INTO public.stock_movements(
    user_id, product_id, warehouse_id, movement_type, quantity,
    reference_type, reference_id, reference_note, unit_cost, notes
  )
  SELECT v_doc.user_id, i.product_id, v_doc.warehouse_id, v_mv::stock_movement_type, i.quantity,
         'stock_doc', v_doc.id,
         COALESCE(v_doc.doc_number, '') || COALESCE(' — ' || v_doc.reason, ''),
         i.unit_cost, i.notes
  FROM public.stock_document_items i
  WHERE i.doc_id = p_doc_id AND i.quantity > 0;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_doc.create_journal
     AND v_doc.inventory_account_code IS NOT NULL
     AND v_doc.counter_account_code IS NOT NULL
     AND COALESCE(v_doc.total_value, 0) > 0 THEN
    v_lines := jsonb_build_array(jsonb_build_object(
      'debit_account_code',  CASE WHEN v_doc.doc_type = 'in' THEN v_doc.inventory_account_code ELSE v_doc.counter_account_code END,
      'credit_account_code', CASE WHEN v_doc.doc_type = 'in' THEN v_doc.counter_account_code ELSE v_doc.inventory_account_code END,
      'amount', v_doc.total_value,
      'description', COALESCE(v_doc.reason, v_doc.doc_number)
    ));
    v_journal := public.create_journal_entry_atomic(
      v_doc.user_id, v_doc.doc_date,
      CASE WHEN v_doc.doc_type = 'in' THEN 'سند إدخال بضاعة ' ELSE 'سند إخراج بضاعة ' END || v_doc.doc_number,
      v_lines, 'شيكل', v_doc.doc_number, 'stock_doc-' || v_doc.id::text, 'stock_doc'
    );
    IF COALESCE((v_journal->>'success')::boolean, false) = false THEN
      RAISE EXCEPTION 'journal failed: %', COALESCE(v_journal->>'error', 'unknown');
    END IF;
  END IF;

  UPDATE public.stock_documents
     SET status = 'confirmed',
         confirmed_at = now(),
         confirmed_by = auth.uid(),
         journal_reference = CASE WHEN v_journal IS NOT NULL THEN v_journal->>'reference' ELSE journal_reference END
   WHERE id = p_doc_id;

  RETURN jsonb_build_object('success', true, 'movements', v_count);
END;
$$;

-- Cancel: remove the movements it created (delete trigger restores product qty)
CREATE OR REPLACE FUNCTION public.cancel_stock_document(p_doc_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc public.stock_documents%ROWTYPE;
  v_count int := 0;
BEGIN
  SELECT * INTO v_doc FROM public.stock_documents WHERE id = p_doc_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'document not found'); END IF;
  IF NOT public.is_team_member(auth.uid(), v_doc.user_id) THEN
    RETURN jsonb_build_object('success', false, 'error', 'not authorized');
  END IF;
  IF v_doc.status = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'already cancelled');
  END IF;

  DELETE FROM public.stock_movements
   WHERE reference_type = 'stock_doc' AND reference_id = p_doc_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.stock_documents
     SET status = 'cancelled',
         cancelled_at = now(),
         cancelled_by = auth.uid(),
         cancel_reason = p_reason
   WHERE id = p_doc_id;

  RETURN jsonb_build_object('success', true, 'reversed_movements', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.allocate_stock_document_number(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_stock_document(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_stock_document(uuid, text) TO authenticated;