UPDATE public.profiles
SET public_slug = 'menu-' || substr(user_id::text, 1, 6)
WHERE user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73'
  AND (public_slug IS NULL OR public_slug = '' OR public_slug = 'menu-' || substr(id::text, 1, 6));