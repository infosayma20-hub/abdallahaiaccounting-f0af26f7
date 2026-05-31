import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import SetupWizard from "@/components/SetupWizard";
import LoadingScreen from "@/components/LoadingScreen";

const SetupPage = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [redirectTo, setRedirectTo] = useState<string | null>(null);

  // Guard: the company-registration wizard is for brand-new tenant owners
  // ONLY. Anyone already linked to a tenant (employee record, or a role
  // like cashier/sales_rep/employee/portal/worker/store_tracker) must NOT
  // be allowed to run it — otherwise they end up seeding a stray tenant
  // under their own auth UID (orphan chart-of-accounts, etc).
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      const [{ data: rolesData }, { data: empRow }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase
          .from("employees")
          .select("id, is_active, is_terminated")
          .eq("auth_user_id", user.id)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const roles = (rolesData || []).map((r: any) => r.role as string);
      const isEmployee = !!empRow && (empRow as any).is_active && !(empRow as any).is_terminated;
      const isTenantOwnerRole =
        roles.includes("admin") ||
        roles.includes("super_admin") ||
        roles.includes("hr_manager") ||
        roles.some((r) => r.startsWith("accountant"));
      const isNonOwnerRole = roles.some((r) =>
        ["cashier", "sales_rep", "employee", "portal", "worker", "store_tracker"].includes(r),
      );

      if (isEmployee || isNonOwnerRole) {
        if (isTenantOwnerRole) {
          // edge case: admin who is also an employee — let them through
          setChecking(false);
          return;
        }
        // Send them to the smart router; useRoleRedirect will pick the
        // right destination (employee portal / POS / rep / choose-workspace).
        setRedirectTo("/");
        return;
      }
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  if (loading || checking) return <LoadingScreen />;
  if (!user) return null;
  if (redirectTo) return <Navigate to={redirectTo} replace />;

  return (
    <SetupWizard
      userId={user.id}
      onComplete={() => navigate("/apps", { replace: true })}
    />
  );
};

export default SetupPage;
