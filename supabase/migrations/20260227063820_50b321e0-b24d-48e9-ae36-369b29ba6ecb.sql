
-- Fix SECURITY DEFINER views by recreating them with SECURITY INVOKER
ALTER VIEW public.branches_safe SET (security_invoker = on);
ALTER VIEW public.employees_safe SET (security_invoker = on);
