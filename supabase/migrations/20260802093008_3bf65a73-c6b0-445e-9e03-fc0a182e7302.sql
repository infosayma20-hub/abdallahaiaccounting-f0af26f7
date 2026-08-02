-- 1) Watchlist table
CREATE TABLE IF NOT EXISTS public.account_watchlist (
  user_id uuid PRIMARY KEY,
  email text,
  full_name text,
  reason text,
  risk_level text NOT NULL DEFAULT 'medium',
  notify_on_login boolean NOT NULL DEFAULT true,
  notify_on_export boolean NOT NULL DEFAULT true,
  track_pages boolean NOT NULL DEFAULT true,
  trial_expires_at timestamptz,
  max_records integer,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.account_watchlist TO authenticated;
GRANT ALL ON public.account_watchlist TO service_role;
ALTER TABLE public.account_watchlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_manage_watchlist" ON public.account_watchlist;
CREATE POLICY "super_admin_manage_watchlist" ON public.account_watchlist
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 2) Page views for watched accounts
CREATE TABLE IF NOT EXISTS public.watchlist_page_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  path text NOT NULL,
  page_title text,
  event_kind text NOT NULL DEFAULT 'page_view',
  duration_ms integer,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wl_page_views_user_time
  ON public.watchlist_page_views (user_id, created_at DESC);

GRANT SELECT ON public.watchlist_page_views TO authenticated;
GRANT ALL ON public.watchlist_page_views TO service_role;
ALTER TABLE public.watchlist_page_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin_read_page_views" ON public.watchlist_page_views;
CREATE POLICY "super_admin_read_page_views" ON public.watchlist_page_views
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- 3) Self status function (safe: only reveals own status)
CREATE OR REPLACE FUNCTION public.wl_self_status()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object(
        'watched', true,
        'track_pages', w.track_pages,
        'trial_expires_at', w.trial_expires_at,
        'expired', (w.trial_expires_at IS NOT NULL AND w.trial_expires_at < now()),
        'max_records', w.max_records
      )
     FROM public.account_watchlist w
     WHERE w.user_id = auth.uid() AND w.is_active),
    jsonb_build_object('watched', false, 'track_pages', false, 'expired', false)
  );
$$;

-- 4) Tracking function (insert-only, throttled notifications)
CREATE OR REPLACE FUNCTION public.wl_track(
  p_path text,
  p_title text DEFAULT NULL,
  p_kind text DEFAULT 'page_view',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_w public.account_watchlist%ROWTYPE;
  v_recent int;
BEGIN
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT * INTO v_w FROM public.account_watchlist
  WHERE user_id = v_uid AND is_active;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_w.track_pages THEN
    INSERT INTO public.watchlist_page_views (user_id, path, page_title, event_kind, metadata)
    VALUES (v_uid, COALESCE(NULLIF(p_path, ''), '/'), p_title, COALESCE(NULLIF(p_kind, ''), 'page_view'),
            COALESCE(p_metadata, '{}'::jsonb));
  END IF;

  -- Instant alert for login / export, throttled to 1 per kind per 30 minutes
  IF (p_kind = 'login' AND v_w.notify_on_login)
     OR (p_kind IN ('export', 'print') AND v_w.notify_on_export) THEN
    SELECT count(*) INTO v_recent
    FROM public.admin_notifications
    WHERE user_id = v_uid
      AND event_type = 'watchlist_' || p_kind
      AND created_at > now() - interval '30 minutes';

    IF v_recent = 0 THEN
      INSERT INTO public.admin_notifications (event_type, user_id, user_email, user_name, metadata, is_read, email_sent)
      VALUES ('watchlist_' || p_kind, v_uid, COALESCE(v_w.email, 'unknown'), v_w.full_name,
              jsonb_build_object('path', p_path, 'title', p_title, 'reason', v_w.reason), false, false);
    END IF;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wl_self_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.wl_track(text, text, text, jsonb) TO authenticated;