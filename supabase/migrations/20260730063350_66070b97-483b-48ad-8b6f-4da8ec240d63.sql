CREATE OR REPLACE FUNCTION public.can_view_historical_sales(_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- backend (edge function) already authenticates the portal user before calling
    COALESCE(current_setting('request.jwt.claim.role', true), current_user) = 'service_role'
    OR current_user = 'service_role'
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.malaki_portal_users mpu
      WHERE mpu.auth_user_id = auth.uid()
        AND mpu.user_id = _owner
        AND mpu.role = 'owner'
        AND mpu.is_active = true
    );
$$;