import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";

/**
 * Detailed accountant permissions for the current auth user.
 *
 * Bypass rules (full access, perms = null, can() always true):
 *   - admin
 *   - super_admin
 *   - any role that is NOT an accountant_* role (i.e. owner / non-accountant user)
 *
 * Accountant-only users (role starts with `accountant_`) get exactly the
 * permissions stored in `accountant_permissions` for their `accountant_auth_id`.
 *
 * Loading semantics mirror useHRManagerPermissions to avoid UI flicker.
 */

// All boolean permission columns on accountant_permissions.
export type AccountantPermKey =
  // Vouchers
  | "can_create_receipt"
  | "can_create_payment"
  | "can_create_journal"
  | "can_edit_vouchers"
  | "can_delete_vouchers"
  | "can_create_credit_note"
  | "can_create_debit_note"
  | "can_create_reverse_entry"
  // Invoices
  | "can_create_sale_invoice"
  | "can_create_purchase_invoice"
  | "can_edit_invoices"
  | "can_delete_invoices"
  | "can_manage_quotations"
  | "can_manage_recurring_invoices"
  | "can_manage_delivery_notes"
  | "can_process_returns"
  // Contacts
  | "can_manage_customers"
  | "can_manage_suppliers"
  | "can_view_balances"
  // Accounts & books
  | "can_manage_accounts"
  | "can_view_ledger"
  | "can_view_trial_balance"
  | "can_view_account_statement"
  | "can_manage_opening_balances"
  | "can_close_fiscal_period"
  | "can_manage_cost_centers"
  | "can_manage_fixed_assets"
  // Inventory
  | "can_manage_products"
  | "can_manage_inventory"
  | "can_transfer_stock"
  | "can_manage_warehouses"
  | "can_view_all_warehouses_stock"
  | "can_manage_scoped_master_data"
  | "can_manage_import_shipments"
  // Cheques & banks
  | "can_manage_cheques"
  | "can_manage_banks"
  | "can_manage_cash_boxes"
  | "can_transfer_cash"
  | "can_endorse_cheques"
  // Reports
  | "can_view_profit_loss"
  | "can_view_balance_sheet"
  | "can_view_cash_flow"
  | "can_view_reports"
  | "can_export_data"
  // Orders
  | "can_manage_orders"
  // VAT
  | "can_manage_vat"
  | "can_submit_vat"
  // Currencies & AI
  | "can_manage_currencies"
  | "can_manage_exchange_rates"
  | "can_approve_ai_drafts"
  // POS audit (view-only)
  | "can_audit_pos_shifts";

export type AccountantPerms = Record<AccountantPermKey, boolean>;

const ACCOUNTANT_ROLE_PREFIX = "accountant_";

export function useAccountantPermissions() {
  const { user, loading: authLoading } = useAuth();
  const { roles: sharedRoles, loading: rolesLoading } = useUserRoles();

  const isAdmin = sharedRoles.includes("admin") || sharedRoles.includes("super_admin");
  const isAccountant =
    sharedRoles.length > 0 && sharedRoles.every((r) => r.startsWith(ACCOUNTANT_ROLE_PREFIX));

  // Only accountant-only users need the detailed row; everyone else bypasses.
  // Cached per user so the ~10 components reading permissions on one screen
  // share a single round trip.
  const needsPerms = !!user?.id && !authLoading && !rolesLoading && !isAdmin && isAccountant;

  const permsQuery = useQuery({
    queryKey: ["accountant_permissions", user?.id ?? null],
    enabled: needsPerms,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<AccountantPerms | null> => {
      const { data, error } = await supabase
        .from("accountant_permissions")
        .select("*")
        .eq("accountant_auth_id", user!.id)
        .eq("is_active", true)
        .maybeSingle();
      if (error) {
        console.warn("[useAccountantPermissions] fetch failed:", error);
        return null;
      }
      return (data as unknown as AccountantPerms) || null;
    },
  });

  const perms = needsPerms ? (permsQuery.data ?? null) : null;
  const loading = authLoading || rolesLoading || (needsPerms && permsQuery.isLoading);


  /**
   * Check one or more permission keys (any-of).
   * Admin / non-accountant users always return true (full bypass).
   * If perms row is missing (accountant without a row), deny by default.
   */
  const can = (...keys: AccountantPermKey[]): boolean => {
    if (isAdmin || !isAccountant) return true;
    if (!perms) return false;
    return keys.some((k) => perms[k] === true);
  };

  /** All-of variant. */
  const canAll = (...keys: AccountantPermKey[]): boolean => {
    if (isAdmin || !isAccountant) return true;
    if (!perms) return false;
    return keys.every((k) => perms[k] === true);
  };

  return {
    loading: loading || authLoading,
    isAdmin,
    isAccountant,
    perms,
    can,
    canAll,
  };
}