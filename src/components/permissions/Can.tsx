import { ReactNode } from "react";
import { usePermission } from "@/hooks/usePermission";

interface Props {
  app: string;
  feature: string;
  perm: string;
  children: ReactNode;
  fallback?: ReactNode;
  /** If true, render children disabled with a tooltip instead of hiding when denied. */
  disableInsteadOfHide?: boolean;
}

/**
 * Wraps an element to enforce a feature permission.
 *
 *   <Can app="sales" feature="invoices" perm="create">
 *     <Button>إنشاء فاتورة</Button>
 *   </Can>
 */
export function Can({ app, feature, perm, children, fallback = null, disableInsteadOfHide }: Props) {
  const { can, loading } = usePermission(app);
  if (loading) return null;
  if (can(feature, perm)) return <>{children}</>;
  if (disableInsteadOfHide) {
    return (
      <span title="لا تملك صلاحية" className="opacity-50 pointer-events-none inline-block">
        {children}
      </span>
    );
  }
  return <>{fallback}</>;
}

export default Can;