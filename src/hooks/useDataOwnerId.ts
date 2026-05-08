import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Resolve the effective data-owner id for tenant-scoped reads.
 *
 * Pattern (mirrors src/pages/ProfitLoss.tsx and POS reports):
 *   - For owners, returns auth.user.id.
 *   - For team members invited by an owner, returns the OWNER's id
 *     so they read the same dataset as the owner (RLS allows it).
 *
 * Use this for filtering data tables: transactions, accounts, contacts,
 * invoices, purchase_invoices, vouchers, receipt_vouchers, cheques,
 * stock_movements, products, warehouses, employees, fixed_assets,
 * cash_boxes, bank_accounts, exchange_rates, etc.
 *
 * Do NOT use this to read per-user UI tables like profiles or
 * company_settings — those should still key off auth.user.id.
 */
export function useDataOwnerId(): { dataOwnerId: string | null; userId: string | null } {
  const { user } = useAuth();
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setDataOwnerId(null);
      return;
    }
    let cancelled = false;
    supabase
      .rpc("get_team_owner_id", { _user_id: user.id })
      .then(({ data }) => {
        if (cancelled) return;
        setDataOwnerId(((data as string) || user.id) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { dataOwnerId, userId: user?.id ?? null };
}

export default useDataOwnerId;