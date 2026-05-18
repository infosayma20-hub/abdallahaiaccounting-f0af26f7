import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";


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

  useEffect(() => {
    if (authLoading || !user) return;

    const checkRoles = async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const userRoles = (data || []).map((r) => r.role);
      
      // If user has no roles assigned, treat as admin (business owner)
      const effectiveRoles = userRoles.length === 0 ? ["admin"] : userRoles;
      let allowed = allowedRoles.some((role) => effectiveRoles.includes(role));
      // Fallback: if route allows "employee" and user has an active employees row, grant access.
      // هاد بيخلي المندوب اللي عنده سجل موظف يقدر يدخل شاشة الموظف من شاشة اختيار workspace.
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
      setHasAccess(allowed);
      setChecking(false);
    };

    checkRoles();
  }, [user, authLoading, allowedRoles, allowEmployeePerm]);

  if (authLoading || checking) return (
    <div className="flex h-full min-h-[200px] w-full items-center justify-center">
      <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: "hsl(var(--accent))", borderRightColor: "hsl(var(--accent) / 0.3)" }} />
    </div>
  );
  if (!hasAccess) return <Navigate to={fallback} replace />;
  return <>{children}</>;
}
