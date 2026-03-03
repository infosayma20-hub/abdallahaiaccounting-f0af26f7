import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = 
  | "super_admin" | "admin" | "accountant_senior" 
  | "accountant_sales" | "accountant_purchases" 
  | "cashier" | "hr_manager" | "employee";

// Map roles to allowed module IDs
const ROLE_MODULE_MAP: Record<string, string[]> = {
  super_admin: ["*"], // all
  admin: ["*"], // all
  accountant_senior: [
    "home", "accounting", "cheques", "sales", "purchases", "inventory",
    "finance", "reports", "ai-accountant", "currency", "fixed-assets",
    "import-data", "ecommerce", "settings",
  ],
  accountant_sales: [
    "home", "sales", "cheques", "finance", "reports", "ai-accountant", "settings",
  ],
  accountant_purchases: [
    "home", "purchases", "inventory", "cheques", "finance", "reports", "ai-accountant", "settings",
  ],
  cashier: ["home", "pos", "settings"],
  hr_manager: ["home", "hr", "reports", "settings"],
  employee: ["home", "employee_self", "settings"],
};

// Map roles to allowed sidebar module keys
const ROLE_SIDEBAR_MAP: Record<string, string[]> = {
  super_admin: ["*"],
  admin: ["*"],
  accountant_senior: [
    "home", "accounting", "cheques", "sales", "purchases", "inventory",
    "reports", "ai", "hr", "settings",
  ],
  accountant_sales: ["home", "accounting", "cheques", "sales", "reports", "ai", "settings"],
  accountant_purchases: ["home", "accounting", "cheques", "purchases", "inventory", "reports", "ai", "settings"],
  cashier: ["home", "settings"],
  hr_manager: ["home", "hr", "reports", "settings"],
  employee: ["home", "settings"],
};

export function useUserRole() {
  const { user, loading: authLoading } = useAuth();
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setRoles([]);
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchRoles = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        if (error) throw error;

        const userRoles = (data || []).map((r) => r.role as AppRole);
        if (!isMounted) return;
        // If no roles, treat as admin (business owner fallback)
        setRoles(userRoles.length === 0 ? ["admin"] : userRoles);
      } catch {
        if (!isMounted) return;
        // Safe fallback to avoid infinite loading in route guards
        setRoles(["admin"]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchRoles();

    return () => {
      isMounted = false;
    };
  }, [user, authLoading]);

  const isAdmin = roles.includes("super_admin") || roles.includes("admin");
  const hasFullAccess = isAdmin || roles.includes("accountant_senior");

  const canAccessModule = (moduleId: string): boolean => {
    return roles.some((role) => {
      const allowed = ROLE_MODULE_MAP[role];
      if (!allowed) return false;
      return allowed.includes("*") || allowed.includes(moduleId);
    });
  };

  const canAccessSidebarModule = (moduleKey: string): boolean => {
    return roles.some((role) => {
      const allowed = ROLE_SIDEBAR_MAP[role];
      if (!allowed) return false;
      return allowed.includes("*") || allowed.includes(moduleKey);
    });
  };

  return {
    roles,
    loading,
    isAdmin,
    hasFullAccess,
    canAccessModule,
    canAccessSidebarModule,
  };
}
