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
const OWNER_CACHE_PREFIX = "amwali:data-owner:";

function readCachedOwner(userId: string): string | null {
  try {
    const v = sessionStorage.getItem(OWNER_CACHE_PREFIX + userId);
    return v && v.length > 0 ? v : null;
  } catch { return null; }
}
function writeCachedOwner(userId: string, ownerId: string) {
  try { sessionStorage.setItem(OWNER_CACHE_PREFIX + userId, ownerId); } catch { /* ignore */ }
}

export function useDataOwnerId(): { dataOwnerId: string | null; userId: string | null } {
  const { user } = useAuth();
  // Seed from sessionStorage synchronously so the first render already has
  // the owner id — avoids the null→uuid flip that caused every dependent
  // useEffect to fire twice on every page mount.
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(() => {
    if (!user?.id) return null;
    return readCachedOwner(user.id);
  });

  useEffect(() => {
    if (!user) {
      setDataOwnerId(null);
      return;
    }
    // If we already have a cached value for this user, keep serving it and
    // skip the network round-trip entirely on this mount.
    const cached = readCachedOwner(user.id);
    if (cached) {
      if (cached !== dataOwnerId) setDataOwnerId(cached);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("get_team_owner_id", { _user_id: user.id });
      if (cancelled) return;

      if (!error && data) {
        setDataOwnerId(data as string);
        writeCachedOwner(user.id, data as string);
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
      const resolved = ((profile as any)?.invited_by as string | null) || user.id;
      setDataOwnerId(resolved);
      writeCachedOwner(user.id, resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { dataOwnerId, userId: user?.id ?? null };
}

export default useDataOwnerId;