ALTER TABLE public.pos_sessions
  ADD COLUMN IF NOT EXISTS study_done_at timestamptz,
  ADD COLUMN IF NOT EXISTS study_done_by uuid;

CREATE OR REPLACE FUNCTION public.pos_shift_set_study_done_v1(p_session_id uuid, p_done boolean, p_reason text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_uid uuid := auth.uid(); s record; v_admin boolean; v_acc boolean;
BEGIN
  SELECT * INTO s FROM public.pos_sessions WHERE id = p_session_id FOR UPDATE;
  IF s.id IS NULL OR v_uid IS NULL THEN RAISE EXCEPTION 'الوردية غير موجودة'; END IF;
  v_admin := v_uid = s.user_id OR (public.is_team_member(v_uid, s.user_id) AND public.has_role(v_uid,'admin'));
  v_acc := EXISTS (SELECT 1 FROM public.accountant_permissions WHERE accountant_auth_id = v_uid AND user_id = s.user_id AND is_active AND COALESCE(can_audit_pos_shifts,false));
  IF p_done THEN
    IF NOT (v_admin OR v_acc) THEN RAISE EXCEPTION 'ليس لديك صلاحية'; END IF;
    IF s.state = 'open' THEN RAISE EXCEPTION 'الوردية لسا مفتوحة'; END IF;
    IF s.study_done_at IS NOT NULL THEN RAISE EXCEPTION 'الوردية جاهزة مسبقاً'; END IF;
    UPDATE public.pos_sessions SET study_done_at = now(), study_done_by = v_uid WHERE id = s.id;
  ELSE
    IF NOT v_admin THEN RAISE EXCEPTION 'إعادة فتح الدراسة للإدارة فقط'; END IF;
    IF length(btrim(COALESCE(p_reason,''))) < 3 THEN RAISE EXCEPTION 'السبب إلزامي'; END IF;
    UPDATE public.pos_sessions SET study_done_at = NULL, study_done_by = NULL WHERE id = s.id;
  END IF;
  INSERT INTO public.pos_shift_post_close_edits (session_id, entity_table, entity_id, action, before_data, after_data, reason, performed_by_auth_user_id)
  VALUES (s.id, 'pos_sessions', s.id, CASE WHEN p_done THEN 'study_done' ELSE 'study_reopen' END,
          jsonb_build_object('study_done_at', s.study_done_at), NULL, COALESCE(NULLIF(btrim(p_reason),''), 'إنهاء الدراسة'), v_uid);
  RETURN jsonb_build_object('success', true, 'done', p_done);
END $$;
REVOKE ALL ON FUNCTION public.pos_shift_set_study_done_v1(uuid,boolean,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.pos_shift_set_study_done_v1(uuid,boolean,text) TO authenticated;

-- Lock corrections once the study is marked ready.
DO $$
DECLARE d text; n text;
BEGIN
  d := pg_get_functiondef('public.pos_shift_correction_access(uuid)'::regprocedure);
  n := replace(d, 'SELECT id, user_id, state, COALESCE(is_deleted,false) is_deleted INTO s',
                  'SELECT id, user_id, state, COALESCE(is_deleted,false) is_deleted, study_done_at INTO s');
  n := replace(n, 'WHEN v_status = ''approved'' THEN', 'WHEN s.study_done_at IS NOT NULL THEN ''الدراسة منتهية (جاهزة) — التعديل مقفل'' WHEN v_status = ''approved'' THEN');
  IF n = d THEN RAISE EXCEPTION 'patch access failed'; END IF;
  EXECUTE n;
END $$;