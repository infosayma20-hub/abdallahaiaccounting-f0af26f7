CREATE OR REPLACE FUNCTION public.send_internal_message(
  _subject text,
  _body text,
  _recipients jsonb,
  _remind_at date DEFAULT NULL,
  _context_type text DEFAULT NULL,
  _context_id uuid DEFAULT NULL,
  _context_label text DEFAULT NULL,
  _priority text DEFAULT 'normal'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
  _msg_id uuid;
  _rec jsonb;
  _sender_name text;
  _uid_target uuid;
  _role_target text;
  _prio smallint;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
  IF _subject IS NULL OR length(trim(_subject)) = 0 THEN
    RAISE EXCEPTION 'subject required';
  END IF;
  IF _body IS NULL OR length(trim(_body)) = 0 THEN
    RAISE EXCEPTION 'body required';
  END IF;
  IF _recipients IS NULL OR jsonb_array_length(_recipients) = 0 THEN
    RAISE EXCEPTION 'at least one recipient required';
  END IF;

  _owner := public.get_team_owner_id(_uid);

  SELECT COALESCE(e.full_name, p.full_name, p.display_name, au.email)
    INTO _sender_name
  FROM auth.users au
  LEFT JOIN public.profiles p ON p.user_id = au.id
  LEFT JOIN public.employees e ON e.auth_user_id = au.id AND COALESCE(e.is_active, true)
  WHERE au.id = _uid
  LIMIT 1;

  INSERT INTO public.internal_messages (
    user_id, sender_id, sender_name, subject, body,
    context_type, context_id, context_label, remind_at, priority
  ) VALUES (
    _owner, _uid, _sender_name, trim(_subject), trim(_body),
    NULLIF(_context_type,''), _context_id, NULLIF(_context_label,''), _remind_at,
    COALESCE(NULLIF(_priority,''), 'normal')
  )
  RETURNING id INTO _msg_id;

  FOR _rec IN SELECT * FROM jsonb_array_elements(_recipients)
  LOOP
    _uid_target := NULLIF(_rec->>'user_id','')::uuid;
    _role_target := NULLIF(_rec->>'role','');
    INSERT INTO public.internal_message_recipients (
      message_id, user_id, recipient_user_id, recipient_role, cc
    ) VALUES (
      _msg_id, _owner, _uid_target, _role_target,
      COALESCE((_rec->>'cc')::boolean, false)
    );
  END LOOP;

  -- Enqueue in-app notifications immediately, scoped to this tenant only.
  _prio := CASE COALESCE(_priority,'normal')
             WHEN 'high' THEN 2
             WHEN 'low'  THEN 7
             ELSE 5
           END;

  -- Direct user recipients (must belong to same tenant)
  INSERT INTO public.notification_queue (
    owner_id, recipient_user_id, event_type, sensitivity, title, body, data, path, priority, dedup_key
  )
  SELECT
    _owner,
    r.recipient_user_id,
    'internal_message',
    'low',
    COALESCE('رسالة من ' || _sender_name, 'رسالة داخلية جديدة'),
    left(trim(_body), 200),
    jsonb_build_object('message_id', _msg_id, 'subject', _subject),
    '/internal-messages?open=' || _msg_id::text,
    _prio,
    'im:' || _msg_id::text || ':u:' || r.recipient_user_id::text
  FROM public.internal_message_recipients r
  WHERE r.message_id = _msg_id
    AND r.recipient_user_id IS NOT NULL
    AND r.recipient_user_id <> _uid
    AND public.is_team_member(r.recipient_user_id, _owner)
  ON CONFLICT (dedup_key) DO NOTHING;

  -- Role recipients: expand to every tenant user holding that role
  INSERT INTO public.notification_queue (
    owner_id, recipient_user_id, event_type, sensitivity, title, body, data, path, priority, dedup_key
  )
  SELECT DISTINCT
    _owner,
    ur.user_id,
    'internal_message',
    'low',
    COALESCE('رسالة من ' || _sender_name, 'رسالة داخلية جديدة'),
    left(trim(_body), 200),
    jsonb_build_object('message_id', _msg_id, 'subject', _subject, 'role', r.recipient_role),
    '/internal-messages?open=' || _msg_id::text,
    _prio,
    'im:' || _msg_id::text || ':r:' || r.recipient_role || ':u:' || ur.user_id::text
  FROM public.internal_message_recipients r
  JOIN public.user_roles ur ON ur.role::text = r.recipient_role
  WHERE r.message_id = _msg_id
    AND r.recipient_role IS NOT NULL
    AND ur.user_id <> _uid
    AND public.is_team_member(ur.user_id, _owner)
  ON CONFLICT (dedup_key) DO NOTHING;

  RETURN _msg_id;
END;
$function$;