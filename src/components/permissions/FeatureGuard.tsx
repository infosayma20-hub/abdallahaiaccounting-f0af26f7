import { ReactNode } from "react";
import { usePermission } from "@/hooks/usePermission";
import LockedModulePage from "@/components/layout/LockedModulePage";

interface Props {
  app: string;
  feature: string;
  perm: string;
  children: ReactNode;
  /** Optional human label shown in the lock screen. */
  label?: string;
}

/**
 * Route-level guard for in-app feature permissions.
 *
 *   <Route path="/invoices/new" element={
 *     <FeatureGuard app="sales" feature="invoices" perm="create">
 *       <InvoiceCreatePage />
 *     </FeatureGuard>
 *   } />
 *
 * - Loading state renders children (no flicker). Server-side assertions still
 *   enforce on the action itself, so a flash of the page without ability to
 *   act is safe.
 * - super_admin bypass is built into usePermission.
 */
export function FeatureGuard({ app, feature, perm, children, label }: Props) {
  const { can, loading, isAppAllowed } = usePermission(app);
  if (loading) return <>{children}</>;
  if (!isAppAllowed || !can(feature, perm)) {
    return <LockedModulePage moduleName={label ?? "هذه العملية"} />;
  }
  return <>{children}</>;
}

export default FeatureGuard;