-- Table to log user lifecycle events for super admin
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL CHECK (event_type IN ('signup', 'email_verified', 'first_login')),
  user_id UUID NOT NULL,
  user_email TEXT NOT NULL,
  user_name TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  email_sent BOOLEAN NOT NULL DEFAULT false,
  email_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_notifications_created ON public.admin_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_unread ON public.admin_notifications(is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_admin_notifications_event ON public.admin_notifications(event_type);

ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;

-- Only super admins can view/manage
CREATE POLICY "Super admins can view all notifications"
  ON public.admin_notifications FOR SELECT
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "Super admins can update notifications"
  ON public.admin_notifications FOR UPDATE
  USING (public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE POLICY "System can insert notifications"
  ON public.admin_notifications FOR INSERT
  WITH CHECK (true);

-- Helper to call edge function for sending email
CREATE OR REPLACE FUNCTION public.notify_super_admin_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_type TEXT;
  v_user_name TEXT;
  v_should_log BOOLEAN := false;
  v_notification_id UUID;
BEGIN
  -- Determine event type
  IF TG_OP = 'INSERT' THEN
    v_event_type := 'signup';
    v_should_log := true;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Email confirmed
    IF OLD.email_confirmed_at IS NULL AND NEW.email_confirmed_at IS NOT NULL THEN
      v_event_type := 'email_verified';
      v_should_log := true;
    -- First login after confirmation (last_sign_in_at changed from NULL to a value)
    ELSIF OLD.last_sign_in_at IS NULL AND NEW.last_sign_in_at IS NOT NULL AND NEW.email_confirmed_at IS NOT NULL THEN
      v_event_type := 'first_login';
      v_should_log := true;
    END IF;
  END IF;

  IF NOT v_should_log THEN
    RETURN NEW;
  END IF;

  v_user_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );

  INSERT INTO public.admin_notifications (event_type, user_id, user_email, user_name, metadata)
  VALUES (
    v_event_type,
    NEW.id,
    NEW.email,
    v_user_name,
    jsonb_build_object(
      'provider', NEW.raw_app_meta_data->>'provider',
      'created_at', NEW.created_at,
      'confirmed_at', NEW.email_confirmed_at
    )
  )
  RETURNING id INTO v_notification_id;

  -- Trigger email send via pg_net (async, non-blocking)
  PERFORM net.http_post(
    url := 'https://omwuyscprzexgmxgittp.supabase.co/functions/v1/notify-admin-signup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object(
      'notification_id', v_notification_id,
      'event_type', v_event_type,
      'user_email', NEW.email,
      'user_name', v_user_name
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't block auth flow on errors
  RETURN NEW;
END;
$$;

-- Triggers
DROP TRIGGER IF EXISTS on_auth_user_created_notify_admin ON auth.users;
CREATE TRIGGER on_auth_user_created_notify_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.notify_super_admin_event();

DROP TRIGGER IF EXISTS on_auth_user_updated_notify_admin ON auth.users;
CREATE TRIGGER on_auth_user_updated_notify_admin
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.notify_super_admin_event();

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_notifications;