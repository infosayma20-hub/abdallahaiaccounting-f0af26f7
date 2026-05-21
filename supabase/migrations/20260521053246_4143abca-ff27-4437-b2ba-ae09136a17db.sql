-- Helper: actor is admin or super_admin
CREATE OR REPLACE FUNCTION public.uaao_is_actor_admin(_actor uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _actor
      AND role IN ('admin','super_admin')
  );
$$;

-- Rebuild policies with admin-role enforcement
DROP POLICY IF EXISTS uaao_select ON public.user_app_access_overrides;
CREATE POLICY uaao_select ON public.user_app_access_overrides
FOR SELECT TO authenticated
USING (
  target_user_id = auth.uid()
  OR (
    public.uaao_is_actor_admin(auth.uid())
    AND public.uaao_can_admin_target(auth.uid(), target_user_id)
  )
);

DROP POLICY IF EXISTS uaao_insert ON public.user_app_access_overrides;
CREATE POLICY uaao_insert ON public.user_app_access_overrides
FOR INSERT TO authenticated
WITH CHECK (
  target_user_id <> auth.uid()
  AND public.uaao_is_actor_admin(auth.uid())
  AND public.uaao_can_admin_target(auth.uid(), target_user_id)
);

DROP POLICY IF EXISTS uaao_update ON public.user_app_access_overrides;
CREATE POLICY uaao_update ON public.user_app_access_overrides
FOR UPDATE TO authenticated
USING (
  target_user_id <> auth.uid()
  AND public.uaao_is_actor_admin(auth.uid())
  AND public.uaao_can_admin_target(auth.uid(), target_user_id)
)
WITH CHECK (
  target_user_id <> auth.uid()
  AND public.uaao_is_actor_admin(auth.uid())
  AND public.uaao_can_admin_target(auth.uid(), target_user_id)
);

DROP POLICY IF EXISTS uaao_delete ON public.user_app_access_overrides;
CREATE POLICY uaao_delete ON public.user_app_access_overrides
FOR DELETE TO authenticated
USING (
  target_user_id <> auth.uid()
  AND public.uaao_is_actor_admin(auth.uid())
  AND public.uaao_can_admin_target(auth.uid(), target_user_id)
);