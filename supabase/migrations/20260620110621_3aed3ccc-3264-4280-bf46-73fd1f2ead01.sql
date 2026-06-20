-- Phase A: Auto-grant 'cashier' role to anyone who legitimately uses POS
-- Backfill historical cashiers + trigger to keep new pos_users in sync.

-- 1) Backfill: anyone with a past pos_session OR a pos_users entry tied to an auth user
INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT s.cashier_auth_user_id, 'cashier'::app_role
FROM public.pos_sessions s
WHERE s.cashier_auth_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = s.cashier_auth_user_id AND ur.role = 'cashier'::app_role
  )
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT DISTINCT pu.auth_user_id, 'cashier'::app_role
FROM public.pos_users pu
WHERE pu.auth_user_id IS NOT NULL
  AND pu.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = pu.auth_user_id AND ur.role = 'cashier'::app_role
  )
ON CONFLICT (user_id, role) DO NOTHING;

-- 2) Trigger: when a pos_users row is linked to an auth user (created or updated),
--    auto-grant 'cashier' role so they pass user_can_access('pos').
CREATE OR REPLACE FUNCTION public.ensure_pos_user_cashier_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.auth_user_id IS NOT NULL AND COALESCE(NEW.is_active, true) = true THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.auth_user_id, 'cashier'::app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_pos_user_cashier_role ON public.pos_users;
CREATE TRIGGER trg_ensure_pos_user_cashier_role
AFTER INSERT OR UPDATE OF auth_user_id, is_active ON public.pos_users
FOR EACH ROW EXECUTE FUNCTION public.ensure_pos_user_cashier_role();