import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { resolveUserAccessContext, AccessContext } from "@/lib/accessContext";
import { Loader2 } from "lucide-react";

/**
 * Guards /setup so only true tenant owners (or users with the
 * manage_company_setup permission) can open it. Any sub-account that
 * types /setup manually is redirected to their defaultRoute with a
 * structured warning log.
 */
export default function RequireSetupAccess({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [ctx, setCtx] = useState<AccessContext | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    setChecking(true);
    resolveUserAccessContext(user.id, { force: true })
      .then((c) => {
        if (cancelled) return;
        setCtx(c);
        if (!c.canAccessSetup) {
          console.warn("[access] /setup denied", {
            uid: user.id,
            accountType: c.accountType,
            redirectTo: c.defaultRoute,
          });
        }
      })
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  if (authLoading || checking) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center" dir="rtl">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (ctx && !ctx.canAccessSetup) {
    return <Navigate to={ctx.defaultRoute} replace />;
  }
  return <>{children}</>;
}