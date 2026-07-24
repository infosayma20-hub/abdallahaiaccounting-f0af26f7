CREATE OR REPLACE FUNCTION public.can_view_marketing_campaigns()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(auth.uid(), 'super_admin'::app_role)
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM auth.users u
      WHERE u.id = auth.uid()
        AND lower(u.email) IN (
          'malakybroast@gmail.com',
          'mosaab@malaky.com',
          'mosab@malaky.com',
          'kamal@malaky.com'
        )
    );
$function$;