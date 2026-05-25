-- Revoke column-level SELECT on sensitive secret columns from client roles.
-- Service role retains full access (used by edge functions for auth verification).

REVOKE SELECT (secret_key) ON public.branches FROM anon, authenticated;
REVOKE SELECT (password_hash) ON public.malaki_portal_users FROM anon, authenticated;
REVOKE SELECT (pin_hash) ON public.pos_users FROM anon, authenticated;
REVOKE SELECT (password_hash) ON public.task_users FROM anon, authenticated;