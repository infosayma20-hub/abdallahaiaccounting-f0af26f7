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
    (async () => {
      const { data, error } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
      if (cancelled) return;

      if (!error && data) {
        setDataOwnerId(data as string);
        return;
      }

      // Safety net for team accounts: never silently fall back to auth.uid()
      // before checking profiles.invited_by, otherwise HR managers read an empty tenant.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("invited_by")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (profileError) console.error("[useDataOwnerId] owner resolution failed", { error, profileError });
      setDataOwnerId(((profile as any)?.invited_by as string | null) || user.id);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { dataOwnerId, userId: user?.id ?? null };
}

export default useDataOwnerId;