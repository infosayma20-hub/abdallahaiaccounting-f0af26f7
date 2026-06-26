
CREATE TABLE public.sparta_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id uuid NOT NULL,
  code text NOT NULL,
  name_ar text NOT NULL,
  name_en text,
  type text NOT NULL CHECK (type IN ('asset','liability','equity','revenue','expense')),
  parent_id uuid REFERENCES public.sparta_accounts(id) ON DELETE RESTRICT,
  currency text NOT NULL DEFAULT 'ILS',
  is_postable boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  opening_balance numeric(18,4) NOT NULL DEFAULT 0,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holding_id, code)
);
CREATE INDEX idx_sparta_accounts_holding ON public.sparta_accounts(holding_id);
CREATE INDEX idx_sparta_accounts_parent ON public.sparta_accounts(parent_id);
CREATE INDEX idx_sparta_accounts_type ON public.sparta_accounts(type);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_accounts TO authenticated;
GRANT ALL ON public.sparta_accounts TO service_role;
ALTER TABLE public.sparta_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sparta_accounts_read" ON public.sparta_accounts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.holding_members hm WHERE hm.holding_id = sparta_accounts.holding_id AND hm.auth_user_id = auth.uid()));
CREATE POLICY "sparta_accounts_insert" ON public.sparta_accounts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.holding_members hm WHERE hm.holding_id = sparta_accounts.holding_id AND hm.auth_user_id = auth.uid()));
CREATE POLICY "sparta_accounts_update" ON public.sparta_accounts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.holding_members hm WHERE hm.holding_id = sparta_accounts.holding_id AND hm.auth_user_id = auth.uid()));
CREATE POLICY "sparta_accounts_delete" ON public.sparta_accounts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.holding_members hm WHERE hm.holding_id = sparta_accounts.holding_id AND hm.auth_user_id = auth.uid()));

CREATE TABLE public.sparta_journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id uuid NOT NULL,
  entry_no text NOT NULL,
  entry_date date NOT NULL DEFAULT CURRENT_DATE,
  ref_type text,
  ref_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','posted','void')),
  total_debit numeric(18,4) NOT NULL DEFAULT 0,
  total_credit numeric(18,4) NOT NULL DEFAULT 0,
  description text,
  posted_at timestamptz,
  posted_by uuid,
  reversed_by uuid REFERENCES public.sparta_journal_entries(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holding_id, entry_no)
);
CREATE INDEX idx_sparta_je_holding_date ON public.sparta_journal_entries(holding_id, entry_date);
CREATE INDEX idx_sparta_je_ref ON public.sparta_journal_entries(ref_type, ref_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_journal_entries TO authenticated;
GRANT ALL ON public.sparta_journal_entries TO service_role;
ALTER TABLE public.sparta_journal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sparta_je_read" ON public.sparta_journal_entries FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.holding_members hm WHERE hm.holding_id = sparta_journal_entries.holding_id AND hm.auth_user_id = auth.uid()));
CREATE POLICY "sparta_je_insert" ON public.sparta_journal_entries FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.holding_members hm WHERE hm.holding_id = sparta_journal_entries.holding_id AND hm.auth_user_id = auth.uid()));
CREATE POLICY "sparta_je_update" ON public.sparta_journal_entries FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.holding_members hm WHERE hm.holding_id = sparta_journal_entries.holding_id AND hm.auth_user_id = auth.uid()));
CREATE POLICY "sparta_je_delete" ON public.sparta_journal_entries FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.holding_members hm WHERE hm.holding_id = sparta_journal_entries.holding_id AND hm.auth_user_id = auth.uid()) AND status = 'draft');

CREATE TABLE public.sparta_journal_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.sparta_journal_entries(id) ON DELETE CASCADE,
  holding_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.sparta_accounts(id) ON DELETE RESTRICT,
  debit numeric(18,4) NOT NULL DEFAULT 0,
  credit numeric(18,4) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'ILS',
  fx_rate numeric(18,8) NOT NULL DEFAULT 1,
  foreign_amount numeric(18,4),
  description text,
  project_id uuid,
  customer_id uuid,
  supplier_id uuid,
  employee_id uuid,
  line_no int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sparta_jl_entry ON public.sparta_journal_lines(entry_id);
CREATE INDEX idx_sparta_jl_account ON public.sparta_journal_lines(account_id);
CREATE INDEX idx_sparta_jl_holding ON public.sparta_journal_lines(holding_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sparta_journal_lines TO authenticated;
GRANT ALL ON public.sparta_journal_lines TO service_role;
ALTER TABLE public.sparta_journal_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sparta_jl_all" ON public.sparta_journal_lines FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.holding_members hm WHERE hm.holding_id = sparta_journal_lines.holding_id AND hm.auth_user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.holding_members hm WHERE hm.holding_id = sparta_journal_lines.holding_id AND hm.auth_user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.sparta_check_postable_account()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _postable boolean;
BEGIN
  SELECT is_postable INTO _postable FROM public.sparta_accounts WHERE id = NEW.account_id;
  IF _postable IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Sparta: cannot post to non-postable (parent) account';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_sparta_jl_postable BEFORE INSERT OR UPDATE ON public.sparta_journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.sparta_check_postable_account();

CREATE OR REPLACE FUNCTION public.sparta_lock_posted_lines()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _status text;
BEGIN
  SELECT status INTO _status FROM public.sparta_journal_entries
    WHERE id = COALESCE(NEW.entry_id, OLD.entry_id);
  IF _status = 'posted' THEN
    RAISE EXCEPTION 'Sparta: cannot modify lines of a posted entry. Use Reverse Entry instead.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER trg_sparta_jl_lock_posted BEFORE UPDATE OR DELETE ON public.sparta_journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.sparta_lock_posted_lines();

CREATE OR REPLACE FUNCTION public.sparta_next_entry_no(_holding_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _yr text; _seq int;
BEGIN
  _yr := to_char(CURRENT_DATE, 'YYYY');
  SELECT COALESCE(MAX(CAST(split_part(entry_no, '-', 3) AS int)), 0) + 1
    INTO _seq FROM public.sparta_journal_entries
    WHERE holding_id = _holding_id AND entry_no LIKE 'JE-' || _yr || '-%';
  RETURN 'JE-' || _yr || '-' || lpad(_seq::text, 6, '0');
END $$;

CREATE OR REPLACE FUNCTION public.sparta_post_journal(_entry_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _td numeric; _tc numeric; _status text; _holding uuid;
BEGIN
  SELECT status, holding_id INTO _status, _holding FROM public.sparta_journal_entries WHERE id = _entry_id;
  IF _status IS NULL THEN RAISE EXCEPTION 'Entry not found'; END IF;
  IF _status = 'posted' THEN RAISE EXCEPTION 'Already posted'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.holding_members WHERE holding_id = _holding AND auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT COALESCE(SUM(debit),0), COALESCE(SUM(credit),0) INTO _td, _tc
    FROM public.sparta_journal_lines WHERE entry_id = _entry_id;
  IF round(_td,2) <> round(_tc,2) THEN
    RAISE EXCEPTION 'Unbalanced entry: debit=% credit=%', _td, _tc;
  END IF;
  IF _td = 0 THEN RAISE EXCEPTION 'Empty entry'; END IF;
  UPDATE public.sparta_journal_entries
    SET status='posted', total_debit=_td, total_credit=_tc, posted_at=now(), posted_by=auth.uid()
    WHERE id = _entry_id;
  RETURN jsonb_build_object('success', true, 'entry_id', _entry_id, 'total', _td);
END $$;

CREATE OR REPLACE FUNCTION public.sparta_reverse_journal(_entry_id uuid, _reason text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _new_id uuid; _holding uuid; _no text; _orig_no text;
BEGIN
  SELECT holding_id, entry_no INTO _holding, _orig_no FROM public.sparta_journal_entries
    WHERE id = _entry_id AND status = 'posted';
  IF _holding IS NULL THEN RAISE EXCEPTION 'Posted entry not found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.holding_members WHERE holding_id = _holding AND auth_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  _no := public.sparta_next_entry_no(_holding);
  INSERT INTO public.sparta_journal_entries (holding_id, entry_no, entry_date, ref_type, ref_id, status, description, created_by, reversed_by)
    VALUES (_holding, _no, CURRENT_DATE, 'reverse', _entry_id, 'draft',
            'عكس قيد ' || _orig_no || COALESCE(' - ' || _reason, ''), auth.uid(), _entry_id)
    RETURNING id INTO _new_id;
  INSERT INTO public.sparta_journal_lines (entry_id, holding_id, account_id, debit, credit, currency, fx_rate, description, line_no)
    SELECT _new_id, holding_id, account_id, credit, debit, currency, fx_rate, 'عكس: ' || COALESCE(description,''), line_no
      FROM public.sparta_journal_lines WHERE entry_id = _entry_id;
  PERFORM public.sparta_post_journal(_new_id);
  UPDATE public.sparta_journal_entries SET reversed_by = _new_id WHERE id = _entry_id;
  RETURN _new_id;
END $$;

CREATE OR REPLACE FUNCTION public.sparta_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER trg_sparta_accounts_ua BEFORE UPDATE ON public.sparta_accounts FOR EACH ROW EXECUTE FUNCTION public.sparta_touch_updated_at();
CREATE TRIGGER trg_sparta_je_ua BEFORE UPDATE ON public.sparta_journal_entries FOR EACH ROW EXECUTE FUNCTION public.sparta_touch_updated_at();

CREATE OR REPLACE FUNCTION public.sparta_seed_default_coa(_holding_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a1 uuid; a11 uuid; a12 uuid;
  l1 uuid; l21 uuid;
  e1 uuid; r1 uuid;
  x1 uuid; x21 uuid;
BEGIN
  IF EXISTS (SELECT 1 FROM public.sparta_accounts WHERE holding_id = _holding_id) THEN RETURN; END IF;
  INSERT INTO public.sparta_accounts(holding_id, code, name_ar, type, is_postable) VALUES (_holding_id,'1','الأصول','asset',false) RETURNING id INTO a1;
  INSERT INTO public.sparta_accounts(holding_id, code, name_ar, type, parent_id, is_postable) VALUES (_holding_id,'11','الأصول المتداولة','asset',a1,false) RETURNING id INTO a11;
  INSERT INTO public.sparta_accounts(holding_id, code, name_ar, type, parent_id) VALUES
    (_holding_id,'1110','الصندوق','asset',a11),
    (_holding_id,'1120','البنوك','asset',a11),
    (_holding_id,'1130','ذمم العملاء','asset',a11),
    (_holding_id,'1140','المخزون','asset',a11),
    (_holding_id,'1150','سلف الموظفين','asset',a11);
  INSERT INTO public.sparta_accounts(holding_id, code, name_ar, type, parent_id, is_postable) VALUES (_holding_id,'12','الأصول الثابتة','asset',a1,false) RETURNING id INTO a12;
  INSERT INTO public.sparta_accounts(holding_id, code, name_ar, type, parent_id) VALUES
    (_holding_id,'1210','أثاث ومعدات','asset',a12),
    (_holding_id,'1220','مركبات','asset',a12);
  INSERT INTO public.sparta_accounts(holding_id, code, name_ar, type, is_postable) VALUES (_holding_id,'2','الالتزامات','liability',false) RETURNING id INTO l1;
  INSERT INTO public.sparta_accounts(holding_id, code, name_ar, type, parent_id, is_postable) VALUES (_holding_id,'21','الالتزامات المتداولة','liability',l1,false) RETURNING id INTO l21;
  INSERT INTO public.sparta_accounts(holding_id, code, name_ar, type, parent_id) VALUES
    (_holding_id,'2110','ذمم الموردين','liability',l21),
    (_holding_id,'2120','رواتب مستحقة','liability',l21),
    (_holding_id,'2130','ضريبة القيمة المضافة','liability',l21);
  INSERT INTO public.sparta_accounts(holding_id, code, name_ar, type, is_postable) VALUES (_holding_id,'3','حقوق الملكية','equity',false) RETURNING id INTO e1;
  INSERT INTO public.sparta_accounts(holding_id, code, name_ar, type, parent_id) VALUES
    (_holding_id,'3110','رأس المال','equity',e1),
    (_holding_id,'3120','الأرباح المحتجزة','equity',e1);
  INSERT INTO public.sparta_accounts(holding_id, code, name_ar, type, is_postable) VALUES (_holding_id,'4','الإيرادات','revenue',false) RETURNING id INTO r1;
  INSERT INTO public.sparta_accounts(holding_id, code, name_ar, type, parent_id) VALUES
    (_holding_id,'4110','إيرادات المبيعات','revenue',r1),
    (_holding_id,'4120','إيرادات الخدمات','revenue',r1),
    (_holding_id,'4190','إيرادات أخرى','revenue',r1);
  INSERT INTO public.sparta_accounts(holding_id, code, name_ar, type, is_postable) VALUES (_holding_id,'5','المصاريف','expense',false) RETURNING id INTO x1;
  INSERT INTO public.sparta_accounts(holding_id, code, name_ar, type, parent_id, is_postable) VALUES (_holding_id,'51','مصاريف التشغيل','expense',x1,false) RETURNING id INTO x21;
  INSERT INTO public.sparta_accounts(holding_id, code, name_ar, type, parent_id) VALUES
    (_holding_id,'5110','تكلفة البضاعة المباعة','expense',x21),
    (_holding_id,'5120','رواتب وأجور','expense',x21),
    (_holding_id,'5130','إيجارات','expense',x21),
    (_holding_id,'5140','كهرباء ومياه','expense',x21),
    (_holding_id,'5150','صيانة','expense',x21),
    (_holding_id,'5190','مصاريف متنوعة','expense',x21);
END $$;

DO $$
DECLARE _h uuid;
BEGIN
  FOR _h IN SELECT id FROM public.holdings
    WHERE slug ILIKE '%sparta%' OR name_ar ILIKE '%sparta%' OR name_ar ILIKE '%سبارتا%' OR name_en ILIKE '%sparta%'
  LOOP
    PERFORM public.sparta_seed_default_coa(_h);
  END LOOP;
END $$;
