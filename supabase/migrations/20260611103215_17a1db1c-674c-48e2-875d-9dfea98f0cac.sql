
-- Branches: read used by branch selectors across the app
GRANT SELECT ON public.branches TO authenticated;
GRANT ALL ON public.branches TO service_role;

-- POS users: read by POS auth flows
GRANT SELECT, INSERT, UPDATE ON public.pos_users TO authenticated;
GRANT ALL ON public.pos_users TO service_role;

-- Task users: read by tasks system
GRANT SELECT ON public.task_users TO authenticated;
GRANT ALL ON public.task_users TO service_role;
