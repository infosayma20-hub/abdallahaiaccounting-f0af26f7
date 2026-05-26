-- Hide sensitive columns from client-side reads (authenticated/anon).
-- service_role and edge functions (which use service_role) are unaffected.

REVOKE SELECT (secret_key) ON public.branches FROM authenticated, anon;
REVOKE SELECT (password_hash) ON public.malaki_portal_users FROM authenticated, anon;
REVOKE SELECT (pin_hash) ON public.pos_users FROM authenticated, anon;
REVOKE SELECT (password_hash) ON public.task_users FROM authenticated, anon;