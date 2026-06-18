-- ============================================================
-- Phase 1: Notification Queue + Worker plumbing (additive only)
-- ============================================================

-- 1) Queue table
CREATE TABLE IF NOT EXISTS public.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  recipient_user_id uuid NOT NULL,
  event_type text NOT NULL,
  sensitivity text NOT NULL DEFAULT 'low' CHECK (sensitivity IN ('low','high')),
  title text NOT NULL,
  body text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  path text,
  priority smallint NOT NULL DEFAULT 5,
  dedup_key text NOT NULL,
  scheduled_for timestamptz NOT NULL DEFAULT now(),
  source_created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped','deferred','processing')),
  attempts int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  CONSTRAINT notification_queue_dedup_unique UNIQUE (dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_notif_queue_pending
  ON public.notification_queue (scheduled_for, priority)
  WHERE status IN ('pending','deferred');
CREATE INDEX IF NOT EXISTS idx_notif_queue_owner_recipient
  ON public.notification_queue (owner_id, recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_queue_status
  ON public.notification_queue (status, updated_at DESC);

-- 2) Grants (Service-role workflow; admins read via RLS)
GRANT SELECT ON public.notification_queue TO authenticated;
GRANT ALL    ON public.notification_queue TO service_role;

-- 3) RLS
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

-- Recipient can read own rows
CREATE POLICY "recipient_reads_own_queue"
  ON public.notification_queue
  FOR SELECT
  TO authenticated
  USING (recipient_user_id = auth.uid());

-- Admin can read queue rows for their tenant (owner_id matches their effective owner)
CREATE POLICY "admins_read_tenant_queue"
  ON public.notification_queue
  FOR SELECT
  TO authenticated
  USING (
    (has_role(auth.uid(), 'admin'::app_role)
     OR has_role(auth.uid(), 'super_admin'::app_role)
     OR has_role(auth.uid(), 'hr_manager'::app_role))
    AND owner_id = public.resolve_effective_owner_id(auth.uid())
  );

-- 4) updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_notification_queue_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_queue_touch ON public.notification_queue;
CREATE TRIGGER trg_notification_queue_touch
  BEFORE UPDATE ON public.notification_queue
  FOR EACH ROW EXECUTE FUNCTION public.tg_notification_queue_touch();

-- 5) Enqueue helper (SECURITY DEFINER). Resolves owner from recipient (employee/sales rep / inviter / self).
CREATE OR REPLACE FUNCTION public.enqueue_notification(
  _recipient_user_id uuid,
  _event_type text,
  _title text,
  _body text,
  _path text DEFAULT NULL,
  _data jsonb DEFAULT '{}'::jsonb,
  _sensitivity text DEFAULT 'low',
  _priority smallint DEFAULT 5,
  _dedup_key text DEFAULT NULL,
  _source_created_at timestamptz DEFAULT NULL,
  _scheduled_for timestamptz DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_dedup text;
  v_id uuid;
BEGIN
  IF _recipient_user_id IS NULL OR _event_type IS NULL OR _title IS NULL OR _body IS NULL THEN
    RETURN NULL;
  END IF;

  -- Resolve tenant owner from the recipient (NOT from caller session)
  v_owner := public.resolve_effective_owner_id(_recipient_user_id);
  IF v_owner IS NULL THEN
    v_owner := _recipient_user_id; -- self-owned fallback
  END IF;

  v_dedup := COALESCE(
    _dedup_key,
    _event_type || ':' || _recipient_user_id::text || ':' ||
      COALESCE((_data->>'source_id'), extract(epoch from now())::text)
  );

  INSERT INTO public.notification_queue (
    owner_id, recipient_user_id, event_type, sensitivity,
    title, body, data, path, priority, dedup_key,
    scheduled_for, source_created_at
  )
  VALUES (
    v_owner, _recipient_user_id, _event_type, COALESCE(_sensitivity,'low'),
    _title, _body, COALESCE(_data,'{}'::jsonb), _path, COALESCE(_priority,5), v_dedup,
    COALESCE(_scheduled_for, now()),
    COALESCE(_source_created_at, now())
  )
  ON CONFLICT (dedup_key) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_notification(uuid,text,text,text,text,jsonb,text,smallint,text,timestamptz,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.enqueue_notification(uuid,text,text,text,text,jsonb,text,smallint,text,timestamptz,timestamptz) TO service_role;

-- 6) Rewrite notify_employee_push: NO HTTP — enqueue only.
CREATE OR REPLACE FUNCTION public.notify_employee_push(
  _user_id uuid,
  _title text,
  _body text,
  _path text DEFAULT '/employee'::text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _title IS NULL OR _body IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.enqueue_notification(
    _recipient_user_id := _user_id,
    _event_type := 'legacy_push',
    _title := _title,
    _body := _body,
    _path := _path,
    _data := jsonb_build_object('path', _path),
    _sensitivity := 'low',
    _priority := 5
  );
END;
$$;