
DROP VIEW IF EXISTS public.pos_session_conflicts;

CREATE VIEW public.pos_session_conflicts
WITH (security_invoker = true)
AS
SELECT
  s.id AS session_id,
  s.user_id,
  s.company_id,
  s.terminal_id,
  s.cashier_auth_user_id,
  s.cashier_name,
  s.opened_at,
  s.closed_at,
  s.state,
  s.device_claim_count,
  COALESCE(force_log.force_count, 0)::int AS force_claim_count,
  force_log.last_force_at
FROM public.pos_sessions s
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS force_count, MAX(created_at) AS last_force_at
    FROM public.pos_sensitive_actions_log l
   WHERE l.session_id = s.id
     AND l.action = 'pos_session_force_claim'
) force_log ON true
WHERE s.device_claim_count > 1
   OR COALESCE(force_log.force_count, 0) > 0;

GRANT SELECT ON public.pos_session_conflicts TO authenticated, service_role;
