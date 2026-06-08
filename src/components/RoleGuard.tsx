import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";


type AllowedRole = "admin" | "hr_manager" | "employee" | "accountant_senior" | "accountant_sales" | "accountant_purchases" | "store_tracker" | "branch_scheduler";

interface Props {
  children: React.ReactNode;
  allowedRoles: AllowedRole[];
  fallback?: string;
  /** If set, also grants access when the current user's employee row has this permission flag = true. */
  allowEmployeePerm?: "can_view_team" | "can_manage_schedule" | "can_manage_attendance";
}

export default function RoleGuard({ children, allowedRoles, fallback = "/", allowEmployeePerm }: Props) {
  const { user, loading: authLoading } = useAuth();
  const [checking, setChecking] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (authLoading || !user) return;
    setTimedOut(false);
    setChecking(true);
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (!cancelled) setTimedOut(true);
    }, 10000);

    const checkRoles = async () => {
      try {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        const userRoles = (data || []).map((r) => r.role);

        // SECURITY: Do NOT treat empty roles as admin. A brand-new trial user
        // with no rows in user_roles must not silently bypass admin/hr_manager
        // route guards. Owner/admin accounts get an explicit `admin` row at
        // signup; if it's missing, fall through to the employee/perm fallbacks
        // below and otherwise deny.
        let allowed = allowedRoles.some((role) => (userRoles as string[]).includes(role));
        // Fallback: if route allows "employee" and user has an active employees row, grant access.
        if (!allowed && allowedRoles.includes("employee" as AllowedRole)) {
          const { data: emp } = await supabase
            .from("employees")
            .select("id, is_active, is_terminated")
            .eq("auth_user_id", user.id)
            .maybeSingle();
          if (emp && (emp as any).is_active && !(emp as any).is_terminated) allowed = true;
        }
        if (!allowed && allowEmployeePerm) {
          const { data: emp } = await supabase
            .from("employees")
            .select(allowEmployeePerm)
            .eq("auth_user_id", user.id)
            .maybeSingle();
          if (emp && (emp as any)[allowEmployeePerm] === true) allowed = true;
        }
        if (!cancelled) setHasAccess(allowed);
      } catch (err) {
        // Never leave the route stuck on a spinner — fail closed (no access)
        // and let the user be redirected to the fallback route.
        console.warn("[RoleGuard] check failed:", err);
        if (!cancelled) setHasAccess(false);
      } finally {
        if (!cancelled) {
          setChecking(false);
          setTimedOut(false);
          window.clearTimeout(timer);
        }
      }
    };

    checkRoles();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [user, authLoading, allowedRoles, allowEmployeePerm, attempt]);

  if (timedOut && checking) {
    return (
      <div className="flex h-full min-h-[200px] w-full items-center justify-center p-6">
        <div className="max-w-sm w-full rounded-lg border bg-card p-5 text-center space-y-3">
          <p className="text-sm font-medium text-foreground">تعذر التحقق من الصلاحيات</p>
          <p className="text-xs text-muted-foreground">يبدو أن الاتصال بالخادم يستغرق وقتًا أطول من المعتاد.</p>
          <div className="flex gap-2 justify-center pt-2">
            <Button size="sm" onClick={() => { setTimedOut(false); setAttempt((n) => n + 1); }}>
              إعادة المحاولة
            </Button>
            <Button size="sm" variant="outline" onClick={async () => {
              try { await supabase.auth.signOut(); } catch { /* noop */ }
              window.location.href = "/auth";
            }}>
              تسجيل الخروج
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (authLoading || checking) return (
    <div className="flex h-full min-h-[200px] w-full items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: "hsl(var(--accent))", borderRightColor: "hsl(var(--accent) / 0.3)" }} />
    </div>
  );
  if (!hasAccess) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
