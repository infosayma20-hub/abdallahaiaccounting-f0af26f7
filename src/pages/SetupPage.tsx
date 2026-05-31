import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { canUserCreateTenant } from "@/lib/tenantOwnerGuard";
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
      const check = await canUserCreateTenant(user.id);
      if (cancelled) return;
      if (!check.canCreateTenant) {
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
