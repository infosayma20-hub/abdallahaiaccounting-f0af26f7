import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

const redirectCache = new Map<string, string | null>();

export function clearRoleRedirectCache(userId?: string) {
  if (userId) redirectCache.delete(userId);
  else redirectCache.clear();
}

export function useRoleRedirect() {
  const { user, loading: authLoading } = useAuth();
  const [targetPath, setTargetPath] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) {
      setChecking(true);
      return;
    }

    if (!user) {
      setTargetPath(null);
      setChecking(false);
      return;
    }

    const cachedTarget = redirectCache.get(user.id);
    if (cachedTarget !== undefined) {
      setTargetPath(cachedTarget);
      setChecking(false);
      return;
    }

    let isCancelled = false;
    setChecking(true);

    const resolve = async () => {
      try {
        const [{ data: rolesData }, { data: empRow }] = await Promise.all([
          supabase.from("user_roles").select("role").eq("user_id", user.id),
          supabase
            .from("employees")
            .select("id, is_active, is_terminated")
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

        const roles: string[] = (rolesData || []).map((r) => r.role);
        const isEmployee = !!empRow && empRow.is_active && !empRow.is_terminated;

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

        if (isEmployee && !roles.includes("super_admin") && !isPureSystemRole) {
          const nextPath = "/employee";
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
          nextPath = "/store-tracker";
        } else if (roles.includes("worker") && roles.length === 1) {
          nextPath = "/worker/procurement";
        } else if (roles.includes("cashier") && !roles.includes("admin")) {
          nextPath = "/pos";
        } else if (roles.includes("employee") && roles.length === 1) {
          nextPath = "/employee";
        } else if (roles.includes("sales_rep") && !roles.includes("admin")) {
          nextPath = "/rep";
        } else if (
          (roles.includes("accountant_senior") || roles.includes("accountant_sales") || roles.includes("accountant_purchases"))
          && !roles.includes("admin")
        ) {
          nextPath = "/apps";
        } else if (roles.includes("hr_manager") && !roles.includes("admin")) {
          nextPath = "/apps";
        } else {
          const { count } = await supabase
            .from("accounts")
            .select("id", { count: "exact", head: true })
            .eq("user_id", user.id);

          nextPath = !count || count === 0 ? "/setup" : "/apps";
        }

        if (isCancelled) return;
        redirectCache.set(user.id, nextPath);
        setTargetPath(nextPath);
      } catch {
        if (isCancelled) return;
        setTargetPath("/apps");
      } finally {
        if (!isCancelled) setChecking(false);
      }
    };

    resolve();

    return () => {
      isCancelled = true;
    };
  }, [user, authLoading]);

  return { targetPath, checking, user };
}
