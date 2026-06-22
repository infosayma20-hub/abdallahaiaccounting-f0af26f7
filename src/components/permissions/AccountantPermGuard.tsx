import { ReactNode } from "react";
import {
  useAccountantPermissions,
  type AccountantPermKey,
} from "@/hooks/useAccountantPermissions";

interface Props {
  /** One or more permission keys — any-of by default. */
  perm: AccountantPermKey | AccountantPermKey[];
  /** Require ALL listed keys instead of any-of. */
  all?: boolean;
  children: ReactNode;
  /** What to render when denied (default: null = hidden). */
  fallback?: ReactNode;
  /** Render children visually disabled with a tooltip instead of hiding. */
  disableInsteadOfHide?: boolean;
}

/**
 * UI wrapper that hides/disables children unless the current user
 * has the requested accountant permission.
 *
 * Admins and non-accountant users are always allowed (the hook handles bypass).
 * While loading, children are hidden to prevent a flash of unauthorized UI.
 *
 *   <AccountantPermGuard perm="can_delete_invoices">
 *     <Button onClick={handleDelete}>حذف</Button>
 *   </AccountantPermGuard>
 *
 *   <AccountantPermGuard perm={["can_create_receipt", "can_create_payment"]}>
 *     <NewVoucherButton />
 *   </AccountantPermGuard>
 */
export function AccountantPermGuard({
  perm,
  all = false,
  children,
  fallback = null,
  disableInsteadOfHide = false,
}: Props) {
  const { loading, can, canAll } = useAccountantPermissions();
  if (loading) return null;

  const keys = Array.isArray(perm) ? perm : [perm];
  const allowed = all ? canAll(...keys) : can(...keys);
  if (allowed) return <>{children}</>;

  if (disableInsteadOfHide) {
    return (
      <span
        title="لا تملك صلاحية لهذا الإجراء"
        className="opacity-50 pointer-events-none inline-block"
      >
        {children}
      </span>
    );
  }
  return <>{fallback}</>;
}

export default AccountantPermGuard;