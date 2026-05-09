import { Navigate } from "react-router-dom";
import { useHRManagerPermissions, type HRPermKey } from "@/hooks/useHRManagerPermissions";
import { ShieldAlert } from "lucide-react";

interface Props {
  children: React.ReactNode;
  /** Allow access if the user has ANY of these permission flags. Admin always passes. */
  requires: HRPermKey[];
  /** Optional fallback route. Defaults to access-denied screen. */
  fallback?: string;
}

/**
 * Detailed HR-permission route guard.
 * Use AFTER RoleGuard to enforce per-permission access (e.g. payroll, advances).
 */
export default function HRPermGuard({ children, requires, fallback }: Props) {
  const { loading, isAdmin, isHRManager, can } = useHRManagerPermissions();

  if (loading) {
    return (
      <div className="flex h-full min-h-[200px] w-full items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin"
          style={{ borderTopColor: "hsl(var(--accent))", borderRightColor: "hsl(var(--accent) / 0.3)" }} />
      </div>
    );
  }

  if (isAdmin) return <>{children}</>;

  if (isHRManager && can(...requires)) return <>{children}</>;

  if (fallback) return <Navigate to={fallback} replace />;

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center" dir="rtl">
      <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
        <ShieldAlert className="h-8 w-8 text-destructive" />
      </div>
      <h2 className="text-lg font-bold text-foreground mb-2">لا تملك صلاحية الوصول</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        هذه الصفحة محصورة بصلاحيات معينة لم يتم تفعيلها لحسابك. تواصل مع المالك لتفعيلها.
      </p>
    </div>
  );
}