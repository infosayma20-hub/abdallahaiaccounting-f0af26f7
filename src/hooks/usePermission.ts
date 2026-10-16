import { useEffect, useState, useMemo, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBootstrap } from "@/hooks/useBootstrap";
import { useMyFeaturePermissions } from "@/hooks/useMyFeaturePermissions";
import { useMyAppOverrides } from "@/hooks/useMyAppOverrides";
import {
  loadPermissionSnapshot,
  savePermissionSnapshot,
  clearPermissionSnapshot,
  type PermissionSnapshot,
} from "@/lib/offline-permissions";

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
 *
 * كل المصادر (الأدوار، تجاوزات الميزات، تجاوزات التطبيقات) تأتي من حزمة
 * البدء الموحّدة useBootstrap — لا طلبات ولا قنوات بث لكل نسخة من الخطاف.
 */

// Module-level cache so role defaults are loaded once per session.
const roleDefaultsCache = new Map<string, boolean>(); // key: role|app|feature|perm
let roleDefaultsLoaded = false;
let roleDefaultsPromise: Promise<void> | null = null;

/** Throws when the backend could not be reached, so callers can fall back to the snapshot. */
async function loadRoleDefaults(): Promise<void> {
  if (roleDefaultsLoaded) return;
  if (roleDefaultsPromise) return roleDefaultsPromise;
  roleDefaultsPromise = (async () => {
    const { data, error } = await supabase
      .from("role_default_feature_permissions" as any)
      .select("role,app_key,feature_key,permission_key,allowed");
    if (error) {
      roleDefaultsPromise = null;
      throw error;
    }
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

/** Hydrate the in-memory defaults cache from an offline snapshot (replay only). */
function applyDefaultsFromSnapshot(pairs: Array<[string, boolean]>) {
  pairs.forEach(([k, v]) => roleDefaultsCache.set(k, v));
}

export function clearPermissionCache(_userId?: string) {
  void clearPermissionSnapshot();
}


export function usePermission(appKey: string) {
  const { user, loading: authLoading } = useAuth();
  const bootstrap = useBootstrap();
  const { overrides, loading: ovLoading, failed: ovFailed } = useMyFeaturePermissions();
  const { deny: appDeny, allow: appAllow, failed: appFailed } = useMyAppOverrides();
  const [defaultsReady, setDefaultsReady] = useState(roleDefaultsLoaded);
  /** Offline replay of the last successful server answer (null = none/expired). */
  const [snapshot, setSnapshot] = useState<PermissionSnapshot | null>(null);
  /** True when a permission source failed AND no valid snapshot could replace it. */
  const [denyAll, setDenyAll] = useState(false);

  const bootFailed = bootstrap.isError;
  const bootRoles = useMemo(() => (bootstrap.data?.roles ?? []) as string[], [bootstrap.data?.roles]);

  /**
   * Backend unreachable → replay the encrypted snapshot for THIS user only.
   * No snapshot (or expired / another user) → deny everything (fail closed).
   */
  useEffect(() => {
    let cancelled = false;
    if (!user?.id) {
      setSnapshot(null);
      setDenyAll(false);
      return;
    }
    if (!bootFailed) {
      setSnapshot(null);
      setDenyAll(false);
      return;
    }
    (async () => {
      const snap = await loadPermissionSnapshot(user.id);
      if (cancelled) return;
      if (snap) {
        applyDefaultsFromSnapshot(snap.role_defaults);
        setSnapshot(snap);
        setDenyAll(false);
      } else {
        setSnapshot(null);
        setDenyAll(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, bootFailed]);

  // Overrides / app-access failed after the initial load (network dropped mid-session).
  useEffect(() => {
    if (!user?.id) return;
    if (bootFailed) return; // handled above
    if (!ovFailed && !appFailed) return;
    let cancelled = false;
    (async () => {
      const snap = await loadPermissionSnapshot(user.id);
      if (cancelled) return;
      if (snap) {
        applyDefaultsFromSnapshot(snap.role_defaults);
        setSnapshot(snap);
        setDenyAll(false);
      } else {
        setSnapshot(null);
        setDenyAll(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, ovFailed, appFailed, bootFailed]);

  // Role defaults: one fetch per session, shared across all hook instances.
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        await loadRoleDefaults();
        if (!cancelled) setDefaultsReady(true);
      } catch (err) {
        console.warn("[permission] loadRoleDefaults failed:", err);
        if (!roleDefaultsLoaded && !bootFailed) {
          const snap = await loadPermissionSnapshot(user.id);
          if (!cancelled && snap) {
            applyDefaultsFromSnapshot(snap.role_defaults);
            setSnapshot(snap);
          } else if (!cancelled && !snap) {
            setDenyAll(true);
          }
        }
        if (!cancelled) setDefaultsReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id, bootFailed]);

  const roles = snapshot ? snapshot.roles : bootRoles;
  const rolesLoading = !!user?.id && bootstrap.isLoading;

  // Persist a snapshot only when EVERY source came back from the server.
  useEffect(() => {
    if (!user?.id) return;
    if (rolesLoading || ovLoading || !defaultsReady) return;
    if (bootFailed || ovFailed || appFailed || snapshot || denyAll) return;
    void savePermissionSnapshot({
      user_id: user.id,
      saved_at: new Date().toISOString(),
      roles,
      role_defaults: Array.from(roleDefaultsCache.entries()),
      overrides: Array.from(overrides.entries()),
      app_allow: Array.from(appAllow),
      app_deny: Array.from(appDeny),
    });
  }, [user?.id, roles, overrides, appAllow, appDeny, rolesLoading, ovLoading, defaultsReady, bootFailed, ovFailed, appFailed, snapshot, denyAll]);

  const isSuperAdmin = !denyAll && roles.includes("super_admin");
  // While offline, app-level denies come from the snapshot so a blocked module
  // can never re-open just because the deny list could not be fetched.
  const effectiveAppDeny = useMemo(
    () => (snapshot ? new Set(snapshot.app_deny) : appDeny),
    [snapshot, appDeny],
  );
  const effectiveOverrides = useMemo(
    () => (snapshot ? new Map(snapshot.overrides) : overrides),
    [snapshot, overrides],
  );
  const isAppBlocked = denyAll || effectiveAppDeny.has(appKey);

  const can = useCallback((feature: string, perm: string): boolean => {
    if (denyAll) return false;
    if (isSuperAdmin) return true;
    if (isAppBlocked) return false;
    // user override
    const ov = effectiveOverrides.get(`${appKey}.${feature}.${perm}`);
    if (ov === "deny") return false;
    if (ov === "allow") return true;
    // role default (highest among user roles)
    for (const role of roles) {
      const v = roleDefaultsCache.get(`${role}|${appKey}|${feature}|${perm}`);
      if (v === true) return true;
    }
    return false;
  }, [appKey, effectiveOverrides, roles, isSuperAdmin, isAppBlocked, denyAll]);

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
    /** True when permissions are being replayed from the offline snapshot. */
    isOfflineSnapshot: !!snapshot,
    // Treat as loading while auth is restoring, while user roles are
    // still being fetched, while overrides are loading, or before role
    // defaults have been pulled. This prevents a "locked module" flash
    // on hard refresh before the Supabase session is hydrated from storage.
    loading: authLoading || rolesLoading || ovLoading || !defaultsReady,
  }), [can, canAny, canAll, isAppBlocked, isSuperAdmin, snapshot, authLoading, rolesLoading, ovLoading, defaultsReady]);
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
