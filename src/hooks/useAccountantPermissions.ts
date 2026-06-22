import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
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
  | "can_approve_ai_drafts";

export type AccountantPerms = Record<AccountantPermKey, boolean>;

const ACCOUNTANT_ROLE_PREFIX = "accountant_";

export function useAccountantPermissions() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(true);
  const [perms, setPerms] = useState<AccountantPerms | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isAccountant, setIsAccountant] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setIsAdmin(false);
      setIsAccountant(false);
      setPerms(null);
      setLoading(false);
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        const roleList = (roles || []).map((r: any) => String(r.role));

        const admin = roleList.includes("admin") || roleList.includes("super_admin");
        const accountantOnly =
          roleList.length > 0 &&
          roleList.every((r) => r.startsWith(ACCOUNTANT_ROLE_PREFIX));

        if (cancelled) return;
        setIsAdmin(admin);
        setIsAccountant(accountantOnly);

        // Admin OR non-accountant user → full bypass (owner / sales rep / etc.)
        if (admin || !accountantOnly) {
          setPerms(null);
          return;
        }

        const { data } = await supabase
          .from("accountant_permissions")
          .select("*")
          .eq("accountant_auth_id", user.id)
          .eq("is_active", true)
          .maybeSingle();
        if (!cancelled) setPerms((data as unknown as AccountantPerms) || null);
      } catch (err) {
        console.warn("[useAccountantPermissions] fetch failed:", err);
        if (!cancelled) {
          setIsAdmin(false);
          setIsAccountant(false);
          setPerms(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

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