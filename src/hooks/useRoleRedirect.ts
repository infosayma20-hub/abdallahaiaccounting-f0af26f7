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
      // Check roles
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const roles: string[] = (data || []).map((r) => r.role);

      if (roles.includes("super_admin")) {
        setTargetPath("/super-admin/dashboard");
        setChecking(false);
        return;
      }
      if (roles.includes("worker") && roles.length === 1) {
        setTargetPath("/worker/procurement");
        setChecking(false);
        return;
      }
      if (roles.includes("cashier") && !roles.includes("admin")) {
        setTargetPath("/pos");
        setChecking(false);
        return;
      }
      if (roles.includes("employee") && roles.length === 1) {
        setTargetPath("/employee");
        setChecking(false);
        return;
      }

      // For regular users (admin/accountant/owner), check if setup is completed
      const { count } = await supabase
        .from("accounts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (!count || count === 0) {
        // No accounts = setup not done, redirect to setup wizard
        setTargetPath("/setup");
      } else {
        setTargetPath("/apps");
      }
      setChecking(false);
    };

    resolve();
  }, [user, authLoading]);

  return { targetPath, checking, user };
}
