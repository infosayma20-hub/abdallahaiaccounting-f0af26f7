-- Drop the overly permissive policy
DROP POLICY "Service role access" ON public.webauthn_challenges;

-- Challenges are only accessed by edge functions via service role
-- No RLS policies needed for anon/authenticated users
-- The service role bypasses RLS by default