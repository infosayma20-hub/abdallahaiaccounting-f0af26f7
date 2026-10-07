CREATE TABLE public.tenant_portals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$' AND slug NOT IN ('www','menu','app','api','admin','mail','preview','id-preview')),
  owner_user_id uuid NOT NULL UNIQUE,
  display_name text NOT NULL,
  logo_url text,
  primary_color text NOT NULL DEFAULT '#0D1B2E',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_portals TO authenticated;
GRANT ALL ON public.tenant_portals TO service_role;
ALTER TABLE public.tenant_portals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "super admin manages tenant portals" ON public.tenant_portals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

-- Public branding (no owner id exposed)
CREATE OR REPLACE FUNCTION public.get_tenant_portal_branding(p_slug text)
RETURNS TABLE(slug text, display_name text, logo_url text, primary_color text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.slug, t.display_name, t.logo_url, t.primary_color
  FROM public.tenant_portals t
  WHERE t.slug = lower(trim(p_slug)) AND t.is_active
$$;
GRANT EXECUTE ON FUNCTION public.get_tenant_portal_branding(text) TO anon, authenticated;

-- Does the current user belong to this portal's tenant?
CREATE OR REPLACE FUNCTION public.check_tenant_portal_access(p_slug text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_portals t
    WHERE t.slug = lower(trim(p_slug)) AND t.is_active
      AND auth.uid() IS NOT NULL
      AND (public.is_team_member(auth.uid(), t.owner_user_id)
           OR public.has_role(auth.uid(), 'super_admin'))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.check_tenant_portal_access(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.check_tenant_portal_access(text) TO authenticated;

-- Super admin: resolve owner by email
CREATE OR REPLACE FUNCTION public.sa_find_user_by_email(p_email text)
RETURNS TABLE(user_id uuid, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'super_admin') THEN
    RAISE EXCEPTION 'not allowed';
  END IF;
  RETURN QUERY SELECT u.id, u.email::text FROM auth.users u WHERE lower(u.email) = lower(trim(p_email)) LIMIT 1;
END $$;
REVOKE EXECUTE ON FUNCTION public.sa_find_user_by_email(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.sa_find_user_by_email(text) TO authenticated;