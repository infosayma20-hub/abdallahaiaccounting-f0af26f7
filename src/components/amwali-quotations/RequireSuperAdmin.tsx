import { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";

const ALLOWED_EMAIL = "info.sayma20@gmail.com";

/**
 * Guards Amwali Quotations routes — Super Admin only.
 * Falls back to the founder email if roles are still loading or missing.
 */
const RequireSuperAdmin = ({ children }: { children: ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const { isSuperAdmin, loading: permLoading } = usePermission("any");

  if (authLoading || permLoading) {
    return (
      <div className="p-8 text-center text-muted-foreground" dir="rtl">
        جاري التحقق من الصلاحيات...
      </div>
    );
  }

  const allowed = isSuperAdmin || user?.email?.toLowerCase() === ALLOWED_EMAIL;
  if (!allowed) return <Navigate to="/" replace />;

  return <>{children}</>;
};

export default RequireSuperAdmin;