ALTER TABLE public.vouchers ADD COLUMN IF NOT EXISTS pos_session_id uuid REFERENCES public.pos_sessions(id);
CREATE INDEX IF NOT EXISTS vouchers_pos_session_id_idx ON public.vouchers(pos_session_id) WHERE pos_session_id IS NOT NULL;
COMMENT ON COLUMN public.vouchers.pos_session_id IS 'Optional manual-journal statement grouping link only; does not modify POS shift reconciliation or historical postings.';
CREATE OR REPLACE FUNCTION public.guard_journal_shift_link() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_owner uuid; v_box uuid; v_gl text;
BEGIN
 IF NEW.pos_session_id IS NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.pos_session_id IS NOT DISTINCT FROM OLD.pos_session_id AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
 IF NEW.type <> 'journal' THEN RAISE EXCEPTION 'ربط الوردية متاح لسند القيد فقط'; END IF;
 SELECT s.user_id,s.cash_box_id INTO v_owner,v_box FROM public.pos_sessions s WHERE s.id=NEW.pos_session_id AND NOT coalesce(s.is_deleted,false);
 IF v_owner IS NULL OR v_owner <> NEW.user_id THEN RAISE EXCEPTION 'الوردية لا تخص هذه الشركة'; END IF;
 SELECT gl_account_code INTO v_gl FROM public.cash_boxes WHERE id=v_box AND user_id=NEW.user_id;
 IF v_gl IS NULL THEN RAISE EXCEPTION 'الوردية غير مرتبطة بحساب صندوق'; END IF;
 IF NEW.status='posted' AND NOT EXISTS (SELECT 1 FROM public.voucher_lines l WHERE l.voucher_id=NEW.id AND l.account_code=v_gl AND (l.debit>0 OR l.credit>0)) THEN RAISE EXCEPTION 'القيد يجب أن يتضمن حساب صندوق الوردية'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_journal_shift_link BEFORE INSERT OR UPDATE OF pos_session_id,status ON public.vouchers FOR EACH ROW EXECUTE FUNCTION public.guard_journal_shift_link();
CREATE OR REPLACE FUNCTION public.list_journal_shift_options(p_owner uuid,p_date date DEFAULT NULL,p_session_id uuid DEFAULT NULL)
RETURNS TABLE(id uuid,business_date date,shift_code text,cashier_name text,state text,opened_at timestamptz,closed_at timestamptz,cash_box_name text,gl_account_code text,branch_name text)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT s.id,coalesce(s.business_date,((s.opened_at AT TIME ZONE 'Asia/Hebron')-interval '6 hours')::date),s.shift_code,s.cashier_name,s.state,s.opened_at,s.closed_at,c.name,c.gl_account_code,b.name
 FROM public.pos_sessions s JOIN public.cash_boxes c ON c.id=s.cash_box_id AND c.user_id=s.user_id LEFT JOIN public.branches b ON b.id=s.branch_id AND b.user_id=s.user_id
 WHERE s.user_id=p_owner AND (auth.uid()=p_owner OR public.is_team_member(auth.uid(),p_owner)) AND NOT coalesce(s.is_deleted,false)
 AND (p_session_id IS NULL OR s.id=p_session_id)
 AND (p_date IS NULL OR coalesce(s.business_date,((s.opened_at AT TIME ZONE 'Asia/Hebron')-interval '6 hours')::date)=p_date)
 ORDER BY s.opened_at DESC LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.list_journal_shift_options(uuid,date,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_journal_shift_options(uuid,date,uuid) TO authenticated,service_role;