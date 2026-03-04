import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export function useRoleRedirect() {
  const { user, loading: authLoading } = useAuth();
  const [targetPath, setTargetPath] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setTargetPath(null);
      setChecking(false);
      return;
    }

    const resolve = async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const roles = (data || []).map((r) => r.role);

      if (roles.includes("super_admin")) {
        setTargetPath("/super-admin/dashboard");
      } else if (roles.includes("cashier") && !roles.includes("admin")) {
        // Cashier always goes directly to POS — no apps, no employee portal
        setTargetPath("/pos");
      } else if (roles.includes("employee") && roles.length === 1) {
        // Pure employee — only has employee role
        setTargetPath("/employee");
      } else {
        // admin, accountant, or no roles (business owner fallback)
        setTargetPath("/apps");
      }
      setChecking(false);
    };

    resolve();
  }, [user, authLoading]);

  return { targetPath, checking, user };
}
