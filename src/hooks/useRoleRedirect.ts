import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { useUserRoles } from "./useUserRoles";
import { canUserCreateTenant } from "@/lib/tenantOwnerGuard";
import { isAuthSessionExpiredError, redirectToSessionExpired } from "@/lib/sessionExpired";

const redirectCache = new Map<string, string | null>();

type ProfileRouteMarker = { role?: string | null };
type PosRouteMarker = { is_active?: boolean | null; is_call_center?: boolean | null; hide_employee_workspace?: boolean | null };
type PortalRouteMarker = { is_active?: boolean | null };

const readDataOrThrow = <T,>(result: { data: T; error: unknown }): T => {
  if (result.error) {
    if (isAuthSessionExpiredError(result.error)) redirectToSessionExpired();
    throw result.error;
  }
  return result.data;
};

const readWorkspaceChoice = (userId: string) => {
  try {
    return sessionStorage.getItem(`workspace-choice:${userId}`);
  } catch {
    return null;
  }
};

// Workspace paths a POS/call-center account may pick from the chooser.
// Anything else (or no choice yet) lands back on the chooser screen.
const POS_WORKSPACE_PATHS = new Set([
  "/pos",
  "/employee",
  "/feedback",
  "/customer-complaints",
  "/complaints-view",
  "/compensations",
  "/compensations-view",
]);

const resolvePosWorkspaceChoice = (chosen: string | null): string =>
  chosen && POS_WORKSPACE_PATHS.has(chosen) ? chosen : "/choose-workspace";

export function clearRoleRedirectCache(userId?: string) {
  if (userId) redirectCache.delete(userId);
  else redirectCache.clear();
}

export function useRoleRedirect() {
  const { user, loading: authLoading } = useAuth();
  const { roles: sharedRoles, loading: rolesLoading } = useUserRoles();
  const [targetPath, setTargetPath] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [stalled, setStalled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [workspaceChoiceVersion, setWorkspaceChoiceVersion] = useState(0);

  useEffect(() => {
    const handleWorkspaceChoice = () => setWorkspaceChoiceVersion((version) => version + 1);
    window.addEventListener("workspace-choice-changed", handleWorkspaceChoice);
    return () => window.removeEventListener("workspace-choice-changed", handleWorkspaceChoice);
  }, []);

  useEffect(() => {
    if (authLoading || rolesLoading) {
      setChecking(true);
      return;
    }

    if (!user) {
      setTargetPath(null);
      setChecking(false);
      setStalled(false);
      return;
    }

    const cachedTarget = redirectCache.get(user.id);
    if (cachedTarget !== undefined && !["/apps", "/employee", "/rep", "/rep/home", "/choose-workspace", "/setup"].includes(cachedTarget || "")) {
      setTargetPath(cachedTarget);
      setChecking(false);
      setStalled(false);
      return;
    }

    let isCancelled = false;
    setChecking(true);
    setStalled(false);
    const stallTimer = window.setTimeout(() => {
      if (!isCancelled) setStalled(true);
    }, 10000);

    const resolve = async () => {
      try {
        const [
          profileResult,
          empResult,
          posUserResult,
          portalUserResult,
        ] = await Promise.all([
          supabase
            .from("profiles")
            .select("invited_by, role")
            .eq("user_id", user.id)
            .maybeSingle(),
          supabase
            .from("employees")
            .select("id, auth_user_id, user_id, is_active, is_terminated, is_manager, is_hr_manager, can_view_team, can_manage_schedule, can_manage_attendance")
            .eq("auth_user_id", user.id)
            .maybeSingle(),
          supabase
            .from("pos_users")
            .select("id, auth_user_id, user_id, is_active, is_call_center, hide_employee_workspace")
            .eq("auth_user_id", user.id)
            .maybeSingle(),
          supabase
            .from("malaki_portal_users")
            .select("id, auth_user_id, user_id, is_active")
            .eq("auth_user_id", user.id)
            .maybeSingle(),
        ]);

        const profileRow = readDataOrThrow(profileResult);
        const empRow = readDataOrThrow(empResult);
        const posUserRow = readDataOrThrow(posUserResult);
        const portalUserRow = readDataOrThrow(portalUserResult);

        const profile = profileRow as ProfileRouteMarker | null;
        const posUser = posUserRow as PosRouteMarker | null;
        const portalUser = portalUserRow as PortalRouteMarker | null;
        // Roles come from the shared React Query cache (useUserRoles) —
        // one query per session instead of per-hook fetches.
        const roleSet = new Set<string>(sharedRoles);
        const isEmployee = !!empRow && empRow.is_active && !empRow.is_terminated;
        const isPosUser = !!posUser && posUser.is_active !== false;
        // حسابات شركات الكول سنتر المشتركة (شركة دايال: dial1..dial9) — شاشة
        // نقطة البيع/الكول سنتر فقط. لا شكاوى، لا تعويضات، لا متابعة زبائن،
        // لا شاشة موظف — حتى لو كانت مخزّنة كاختيار سابق في الجلسة.
        const isSharedCallCenterOnly =
          !!posUser && !!posUser.is_call_center && !!posUser.hide_employee_workspace;
        const isPortalUser = !!portalUser && portalUser.is_active !== false;
        const profileRole = profile?.role || undefined;
        if (profileRole) roleSet.add(profileRole);
        if (isEmployee) roleSet.add("employee");
        if (isPosUser) roleSet.add("cashier");
        if (isPortalUser) roleSet.add("portal");
        const roles = Array.from(roleSet);
        const hasAdminAccess = roles.some((role) => role === "admin" || role === "super_admin" || role === "hr_manager" || role.startsWith("accountant"));

        // إذا المستخدم مندوب + موظف نشط (وما عنده admin) — اعرض شاشة اختيار workspace
        // ما لم يكن قد اختار سابقاً في نفس الجلسة.
        if (roles.includes("sales_rep") && isEmployee && !hasAdminAccess) {
          const chosen = readWorkspaceChoice(user.id);
          const nextPath = chosen === "/employee" ? "/employee"
            : chosen === "/rep" ? "/rep/home"
            : "/choose-workspace";
          if (isCancelled) return;
          // لا نخزّن /choose-workspace في cache لأنه قرار جلسة
          if (nextPath !== "/choose-workspace") redirectCache.set(user.id, nextPath);
          setTargetPath(nextPath);
          setChecking(false);
          return;
        }

        // إذا المستخدم كاشير + موظف نشط (وما عنده admin) — اعرض شاشة اختيار workspace
        // بين شاشة الموظف وشاشة نقطة البيع.
        if (roles.includes("cashier") && isEmployee && !hasAdminAccess) {
          const chosen = readWorkspaceChoice(user.id);
          const nextPath = isSharedCallCenterOnly ? "/pos" : resolvePosWorkspaceChoice(chosen);
          if (isCancelled) return;
          if (nextPath !== "/choose-workspace") redirectCache.set(user.id, nextPath);
          setTargetPath(nextPath);
          setChecking(false);
          return;
        }

        // sales_rep أولوية أعلى من سجل الموظف: المستخدم اللي عنده دور
        // مندوب مبيعات يروح مباشرة لشاشة المندوب حتى لو كان مرتبط بسجل
        // employees.
        if (roles.includes("sales_rep") && !hasAdminAccess) {
          const nextPath = "/rep/home";
          if (isCancelled) return;
          redirectCache.set(user.id, nextPath);
          setTargetPath(nextPath);
          setChecking(false);
          return;
        }

        // Employees (even those who also have an "admin" row, e.g. a branch
        // manager whose account was provisioned with admin) must land in the
        // employee portal — not the company-wide /apps dashboard.
        // Exception: super_admin and the explicit "owner" path (no employee
        // record at all) still go to their respective dashboards.
        const isPureSystemRole =
          roles.includes("super_admin") ||
          roles.includes("portal") ||
          roles.includes("store_tracker") ||
          roles.includes("worker") ||
          roles.includes("cashier") ||
          roles.includes("sales_rep");

        if (isEmployee && !hasAdminAccess && !isPureSystemRole) {
          // Employees granted a read-only feedback workspace (شكاوى الزبائن /
          // التعويضات / متابعة الزبائن) have more than one workspace, so they
          // must reach the chooser instead of being forced into /employee.
          let nextPath = "/employee";
          if (!isSharedCallCenterOnly) {
            const { data: fbPerms } = await supabase
              .from("user_feature_permissions")
              .select("id")
              .eq("target_user_id", user.id)
              .eq("app_key", "call_center_feedback")
              .eq("access_state", "allow")
              .limit(1);
            if (fbPerms && fbPerms.length > 0) {
              const chosen = readWorkspaceChoice(user.id);
              const resolved = resolvePosWorkspaceChoice(chosen);
              if (isCancelled) return;
              if (resolved !== "/choose-workspace") redirectCache.set(user.id, resolved);
              setTargetPath(resolved);
              setChecking(false);
              return;
            }
          }

          try {
            Object.keys(localStorage).forEach((key) => {
              if (key.startsWith("amwali-open-tabs") || key.includes("lastVisitedRoute")) localStorage.removeItem(key);
            });
            Object.keys(sessionStorage).forEach((key) => {
              if (key.includes("lastVisitedRoute")) sessionStorage.removeItem(key);
            });
          } catch {
            // Storage cleanup is best-effort.
          }
          console.info("[role-redirect] finalRedirect = /employee", {
            authUid: user.id,
            employeeId: empRow.id,
            employeeAuthUserId: empRow.auth_user_id,
            employeeOwnerUserId: empRow.user_id,
            userRoles: roles,
            isManager: empRow.is_manager,
            isHrManager: empRow.is_hr_manager,
            canViewTeam: empRow.can_view_team,
            canManageSchedule: empRow.can_manage_schedule,
            canManageAttendance: empRow.can_manage_attendance,
            finalRedirect: nextPath,
          });
          if (isCancelled) return;
          redirectCache.set(user.id, nextPath);
          setTargetPath(nextPath);
          return;
        }

        let nextPath: string;

        if (roles.includes("super_admin")) {
          nextPath = "/super-admin/dashboard";
        } else if (roles.includes("portal") && !roles.includes("admin")) {
          nextPath = "/portal/dashboard";
        } else if (roles.includes("store_tracker") && !roles.includes("admin")) {
          nextPath = "/apps";
        } else if (roles.includes("worker") && roles.length === 1) {
          nextPath = "/worker/procurement";
        } else if (roles.includes("cashier") && !roles.includes("admin")) {
          // Pure cashier: show the workspace chooser once per session so they
          // can pick between POS and the employee screen (clock-in works on
          // any device, POS only on devices with the local Print Bridge).
          // After their first pick the choice is sticky for the session.
          const chosen = readWorkspaceChoice(user.id);
          nextPath = isSharedCallCenterOnly ? "/pos" : resolvePosWorkspaceChoice(chosen);
        } else if (roles.includes("employee") && roles.length === 1) {
          nextPath = "/employee";
        } else if (roles.includes("sales_rep") && !roles.includes("admin")) {
          nextPath = "/rep/home";
        } else if (
          (roles.includes("accountant_senior") || roles.includes("accountant_sales") || roles.includes("accountant_purchases"))
          && !roles.includes("admin")
        ) {
          nextPath = "/apps";
        } else if (roles.includes("hr_manager") && !roles.includes("admin")) {
          nextPath = "/apps";
        } else {
          // Feedback-only user: has call_center_feedback permission AND no
          // other system roles AND no employee record — go straight to /feedback.
          if (!isEmployee) {
            const { data: fbPerms } = await supabase
              .from("user_feature_permissions")
              .select("id")
              .eq("target_user_id", user.id)
              .eq("app_key", "call_center_feedback")
              .eq("access_state", "allow")
              .limit(1);
            if (fbPerms && fbPerms.length > 0) {
              nextPath = "/feedback";
            } else {
                // Resolve the true tenant owner (the user may have been
              // invited as admin by the company owner — their accounts
              // live under the owner's UID, not their own).
              const { data: ownerIdData } = await supabase.rpc(
                "get_team_owner_id",
                { _user_id: user.id }
              );
              const ownerId = (ownerIdData as string | null) || user.id;
              const { count } = await supabase
                .from("accounts")
                .select("id", { count: "exact", head: true })
                .eq("user_id", ownerId);
              if (count && count > 0) {
                nextPath = "/apps";
              } else {
                // Final safety: never seed a stray tenant for a user who
                // isn't actually allowed to create one.
                const guard = await canUserCreateTenant(user.id);
                nextPath = guard.canCreateTenant ? "/onboarding" : "/apps";
              }
            }
          } else {
            // TENANT-OWNER GUARD: this user is an active employee of an
            // existing tenant. NEVER route them to /setup — the wizard
            // would seed a stray tenant under their own auth UID. Send
            // them to the employee portal instead (their default home
            // when they don't have a non-owner role like cashier/rep).
            nextPath = "/employee";
          }
        }

        if (isCancelled) return;
        if (!["/setup", "/onboarding"].includes(nextPath)) redirectCache.set(user.id, nextPath);
        setTargetPath(nextPath);
      } catch (err) {
        if (isCancelled) return;
        console.error("[role-redirect] resolve failed → fallback to /auth:", err);
        if (isAuthSessionExpiredError(err)) {
          redirectToSessionExpired();
          return;
        }
        // Don't dump the user into /apps when role lookup failed — that's
        // exactly how transient errors used to cascade into the "phantom
        // onboarding" bug. Send them back to /auth to re-establish identity.
        setTargetPath("/auth");
      } finally {
        if (!isCancelled) {
          setChecking(false);
          setStalled(false);
          window.clearTimeout(stallTimer);
        }
      }
    };

    resolve();

    return () => {
      isCancelled = true;
      window.clearTimeout(stallTimer);
    };
  }, [user, authLoading, rolesLoading, sharedRoles, workspaceChoiceVersion, attempt]);

  const retry = () => {
    if (user) redirectCache.delete(user.id);
    setStalled(false);
    setAttempt((n) => n + 1);
  };
  return { targetPath, checking, user, stalled, retry };
}
