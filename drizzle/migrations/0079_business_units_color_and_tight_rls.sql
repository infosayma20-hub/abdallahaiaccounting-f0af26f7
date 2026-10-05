ALTER TABLE public.business_units ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE public.business_units ADD COLUMN IF NOT EXISTS description text;

DROP POLICY IF EXISTS "Team manage product units" ON public.product_business_units;
CREATE POLICY "Owner or admin manage product units" ON public.product_business_units
FOR ALL TO authenticated
USING ((( SELECT auth.uid()) = user_id) OR (public.is_team_member(( SELECT auth.uid()), user_id) AND public.has_role(( SELECT auth.uid()), 'admin'::app_role)))
WITH CHECK ((( SELECT auth.uid()) = user_id) OR (public.is_team_member(( SELECT auth.uid()), user_id) AND public.has_role(( SELECT auth.uid()), 'admin'::app_role)));