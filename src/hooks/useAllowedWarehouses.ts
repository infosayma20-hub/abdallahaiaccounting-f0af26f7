import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Branch/warehouse scope of the signed-in user.
 *
 * Mirrors the DB function `user_allowed_warehouse_ids`:
 *   • no scope rows  → unrestricted (allowedIds = null)
 *   • scope rows     → direct warehouse grants + every warehouse of granted branches
 *
 * UI must use this only to hide out-of-scope options; the hard block lives in
 * the `enforce_user_warehouse_scope` triggers on stock/invoice tables.
 */
export function useAllowedWarehouses() {
  const [allowedIds, setAllowedIds] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setLoading(false); return; }

      const { data: scope } = await supabase
        .from("user_scope_access")
        .select("branch_id,warehouse_id")
        .eq("user_id", user.id);

      if (!scope || scope.length === 0) {
        if (!cancelled) { setAllowedIds(null); setLoading(false); }
        return;
      }

      const branchIds = scope.filter(s => s.branch_id).map(s => s.branch_id as string);
      const ids = new Set(scope.filter(s => s.warehouse_id).map(s => s.warehouse_id as string));

      if (branchIds.length > 0) {
        const { data: whs } = await supabase
          .from("warehouses")
          .select("id")
          .in("branch_id", branchIds);
        (whs || []).forEach((w: any) => ids.add(w.id));
      }

      if (!cancelled) { setAllowedIds([...ids]); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  // NOTE: these MUST be stable references. Callers put them in effect
  // dependency arrays; a new function identity on every render made those
  // effects re-run forever (the warehouse breakdown was cancelled before it
  // could ever be stored, so every item showed as "بدون مستودع").
  const isAllowed = useCallback(
    (warehouseId?: string | null) => !allowedIds || !warehouseId || allowedIds.includes(warehouseId),
    [allowedIds],
  );

  const filterWarehouses = useCallback(
    <T extends { id: string }>(list: T[]) => (allowedIds ? list.filter(w => allowedIds.includes(w.id)) : list),
    [allowedIds],
  );

  return useMemo(
    () => ({ allowedIds, restricted: allowedIds !== null, loading, isAllowed, filterWarehouses }),
    [allowedIds, loading, isAllowed, filterWarehouses],
  );
}

export default useAllowedWarehouses;
