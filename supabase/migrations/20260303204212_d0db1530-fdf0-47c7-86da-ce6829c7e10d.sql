
-- Fix overly permissive RLS policy on companies
DROP POLICY IF EXISTS "Service role full access on companies" ON public.companies;

-- Instead, allow the trigger (SECURITY DEFINER) to bypass RLS naturally
-- No need for a permissive policy since handle_new_user is SECURITY DEFINER
