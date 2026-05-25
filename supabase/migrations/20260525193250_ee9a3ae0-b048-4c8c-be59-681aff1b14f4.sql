-- ─────────────────────────────────────────────────────────────────────
-- Security hardening: hide sensitive columns from client SELECT
--
-- These columns must never be readable from the client (only service_role
-- inside edge functions should see them). We keep the existing RLS policies
-- intact and add column-level GRANTs so authenticated/anon can still read
-- everything else on these tables.
-- ─────────────────────────────────────────────────────────────────────

-- ── 1) branches.secret_key (used to mint QR attendance tokens) ──
REVOKE SELECT ON public.branches FROM anon, authenticated;
GRANT SELECT (
  id, user_id, name, address, latitude, longitude, radius_meters,
  is_active, created_at, updated_at, qr_rotation_minutes, qr_mode, require_gps
) ON public.branches TO anon, authenticated;

-- ── 2) malaki_portal_users.password_hash ──
REVOKE SELECT ON public.malaki_portal_users FROM anon, authenticated;
GRANT SELECT (
  id, username, full_name, role, can_see_sales, can_see_liquidity,
  can_see_all_branches, allowed_branch_ids, last_login, is_active,
  created_at, email, user_id, auth_user_id
) ON public.malaki_portal_users TO anon, authenticated;

-- ── 3) pos_users.pin_hash ──
REVOKE SELECT ON public.pos_users FROM anon, authenticated;
GRANT SELECT (
  id, user_id, company_id, employee_id, name, phone, email, avatar_url,
  role, is_active, pin_failed_attempts, pin_locked_until, last_login_at,
  created_by, created_at, updated_at, has_account, auth_user_id,
  account_status, must_change_password, branch_id, is_call_center
) ON public.pos_users TO anon, authenticated;

-- ── 4) task_users.password_hash ──
REVOKE SELECT ON public.task_users FROM anon, authenticated;
GRANT SELECT (
  id, user_id, full_name, username, role, avatar_color,
  is_active, last_login_at, created_at
) ON public.task_users TO anon, authenticated;