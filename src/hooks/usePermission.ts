import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMyFeaturePermissions } from "@/hooks/useMyFeaturePermissions";
import { useMyAppOverrides } from "@/hooks/useMyAppOverrides";

/**
 * Central permission hook. Combines:
 *   1. super_admin role → always allow
 *   2. App-level deny  → block entire app (feature checks irrelevant)
 *   3. Feature override deny → block
 *   4. Feature override allow → allow
 *   5. Role default from role_default_feature_permissions → fallback
 *   6. Otherwise → deny-by-default
 *
 * Usage:
 *   const perms = usePermission("sales");
 *   perms.can("invoices", "create");
 */

// Module-level cache so role defaults are loaded once per session.
const roleDefaultsCache = new Map<string, boolean>(); // key: role|app|feature|perm
let roleDefaultsLoaded = false;
let roleDefaultsPromise: Promise<void> | null = null;

async function loadRoleDefaults(): Promise<void> {
  if (roleDefaultsLoaded) return;
  if (roleDefaultsPromise) return roleDefaultsPromise;
  roleDefaultsPromise = (async () => {
    const { data } = await supabase
      .from("role_default_feature_permissions" as any)
      .select("role,app_key,feature_key,permission_key,allowed");
    (data || []).forEach((r: any) => {
      roleDefaultsCache.set(
        `${r.role}|${r.app_key}|${r.feature_key}|${r.permission_key}`,
        !!r.allowed
      );
    });
    roleDefaultsLoaded = true;
  })();
  return roleDefaultsPromise;
}

// Per-user roles cache
const rolesCache = new Map<string, string[]>();

async function loadUserRoles(userId: string): Promise<string[]> {
  if (rolesCache.has(userId)) return rolesCache.get(userId)!;
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const roles = (data || []).map((r: any) => String(r.role));
  rolesCache.set(userId, roles);
  return roles;
}

export function clearPermissionCache(userId?: string) {
  if (userId) rolesCache.delete(userId);
  else rolesCache.clear();
}

export function usePermission(appKey: string) {
  const { user, loading: authLoading } = useAuth();
  const { overrides, loading: ovLoading } = useMyFeaturePermissions();
  const { deny: appDeny } = useMyAppOverrides();
  const [roles, setRoles] = useState<string[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [defaultsReady, setDefaultsReady] = useState(roleDefaultsLoaded);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setRoles([]);
      // Only stop "rolesLoading" once auth is settled and there really is no user.
      if (!authLoading) setRolesLoading(false);
      return;
    }
    setRolesLoading(true);
    loadUserRoles(user.id)
      .then((r) => {
        if (!cancelled) {
          setRoles(r);
          setRolesLoading(false);
        }
      })
      .catch((err) => {
        // Never block UI on a failed role fetch — fall back to no roles.
        console.warn("[permission] loadUserRoles failed:", err);
        if (!cancelled) {
          setRoles([]);
          setRolesLoading(false);
        }
      });
    loadRoleDefaults()
      .then(() => {
        if (!cancelled) setDefaultsReady(true);
      })
      .catch((err) => {
        // Defaults cache failed — treat as ready (empty) so UI unblocks.
        console.warn("[permission] loadRoleDefaults failed:", err);
        if (!cancelled) setDefaultsReady(true);
      });
    return () => { cancelled = true; };
  }, [user?.id, authLoading]);

  const isSuperAdmin = roles.includes("super_admin");
  const isAppBlocked = appDeny.has(appKey);

  const can = useCallback((feature: string, perm: string): boolean => {
    if (isSuperAdmin) return true;
    if (isAppBlocked) return false;
    // user override
    const ov = overrides.get(`${appKey}.${feature}.${perm}`);
    if (ov === "deny") return false;
    if (ov === "allow") return true;
    // role default (highest among user roles)
    for (const role of roles) {
      const v = roleDefaultsCache.get(`${role}|${appKey}|${feature}|${perm}`);
      if (v === true) return true;
    }
    return false;
  }, [appKey, overrides, roles, isSuperAdmin, isAppBlocked]);

  const canAny = useCallback(
    (pairs: Array<[string, string]>) => pairs.some(([f, p]) => can(f, p)),
    [can]
  );
  const canAll = useCallback(
    (pairs: Array<[string, string]>) => pairs.every(([f, p]) => can(f, p)),
    [can]
  );

  return useMemo(() => ({
    can,
    canAny,
    canAll,
    isAppAllowed: !isAppBlocked,
    isSuperAdmin,
    // Treat as loading while auth is restoring, while user roles are
    // still being fetched, while overrides are loading, or before role
    // defaults have been pulled. This prevents a "locked module" flash
    // on hard refresh before the Supabase session is hydrated from storage.
    loading: authLoading || rolesLoading || ovLoading || !defaultsReady,
  }), [can, canAny, canAll, isAppBlocked, isSuperAdmin, authLoading, rolesLoading, ovLoading, defaultsReady]);
}

/** Quick async check (e.g. inside event handlers) that consults the DB directly. */
export async function checkFeaturePermission(
  userId: string, app: string, feature: string, perm: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("has_feature_permission" as any, {
    _user: userId, _app: app, _feature: feature, _perm: perm,
  });
  if (error) return false;
  return !!data;
}