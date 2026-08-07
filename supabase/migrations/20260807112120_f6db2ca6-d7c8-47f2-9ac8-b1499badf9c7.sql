CREATE OR REPLACE FUNCTION public.get_team_owner_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.get_team_owner_id(auth.uid())
$function$;

GRANT EXECUTE ON FUNCTION public.get_team_owner_id() TO authenticated, service_role;