CREATE OR REPLACE FUNCTION public.qr_menu_resolve(_account_slug text, _branch_slug text)
RETURNS TABLE(user_id uuid, branch_id uuid, branch_name text, account_name text, welcome_message text, require_phone boolean, mode text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.user_id,
    b.id,
    b.name,
    COALESCE(p.company_name, p.full_name, p.display_name, '') AS account_name,
    cs.qr_menu_welcome_message,
    COALESCE(cs.qr_menu_require_phone, false) AS require_phone,
    COALESCE(cs.qr_menu_mode, 'dine_in') AS mode
  FROM public.profiles p
  JOIN public.branches b ON b.user_id = p.user_id
  JOIN public.company_settings cs ON cs.user_id = p.user_id
  WHERE (
      p.public_slug = _account_slug
      OR ('menu-' || substr(p.user_id::text, 1, 6)) = _account_slug
      OR p.user_id::text = _account_slug
    )
    AND (
      b.public_slug = _branch_slug
      OR ('br-' || substr(b.id::text, 1, 8)) = _branch_slug
      OR b.id::text = _branch_slug
    )
    AND COALESCE(b.qr_menu_enabled, false) = true
    AND COALESCE(cs.qr_menu_enabled, false) = true
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.qr_menu_resolve(text, text) TO anon, authenticated;