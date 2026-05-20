---
name: User App Access Overrides
description: Per-user allow/deny override layer for app/module visibility, applied across Apps Launcher, Sidebar, and ModuleGuard
type: feature
---
Per-user app access control on top of role-based defaults.

**Table:** `public.user_app_access_overrides` (target_user_id, app_key, access_state IN ('allow','deny'); UNIQUE(target_user_id, app_key); company_id + owner_id auto-filled via BEFORE trigger from target profile).

**Resolution:** super_admin → ALLOW; else deny override > allow override > hidden_apps/role defaults (`inherit`). Inherit = row absent.

**Frontend hook:** `useMyAppOverrides()` loads current user's overrides + Realtime subscription on `user_app_access_overrides`.

**Enforcement points:**
- `useLockedModules.isModuleLocked` consults overrides
- `AppsLauncher.isAppDisabled` + `allVisibleApps` filter
- `AppSidebar.isItemHidden` 
- `ModuleGuard` blocks direct URL with inline ROUTE_TO_APP_ID map (must stay in sync with `useLockedModules`)

**Edge function:** `manage-user-app-access` with actions `list`/`upsert`/`reset`. Cross-tenant check via same `company_id` OR `invited_by = actor` OR super_admin → otherwise **403 Cross-tenant forbidden** + activity_log entry.

**RLS:** SELECT for self + admins of same company; INSERT/UPDATE/DELETE only admins of same company on non-self.

**Audit:** Trigger `uaao_audit` writes to `activity_log` with `action='update_user_app_access'`, `entity_id=target_user_id`, details = {app_key, old, new, company_id}.

**UI:** Settings > Users → "إدارة التطبيقات" button per user opens `UserAppAccessDialog` with allow/deny/inherit per app, grouped by core/operations/premium.
