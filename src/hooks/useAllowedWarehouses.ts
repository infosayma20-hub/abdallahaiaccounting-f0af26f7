import { useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Branch/warehouse scope of the signed-in user.
 *
 * Mirrors the DB function `user_allowed_warehouse_ids`:
 *   • no scope rows  → unrestricted (allowedIds = null)
 *   • scope rows     → direct warehouse grants + every warehouse of granted branches
 *
 * UI must use this only to hide out-of-scope options; the hard block lives in
 * the `enforce_user_warehouse_scope` triggers on stock/invoice tables.
 *
 * Cached through React Query: the scope is read once per session instead of
 * once per component that renders a warehouse picker.
 */
export function useAllowedWarehouses() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["user_warehouse_scope", user?.id ?? null],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<string[] | null> => {
      const { data: scope } = await supabase
        .from("user_scope_access")
        .select("branch_id,warehouse_id")
        .eq("user_id", user!.id);

      if (!scope || scope.length === 0) return null; // unrestricted

      const branchIds = scope.filter(s => s.branch_id).map(s => s.branch_id as string);
      const ids = new Set(scope.filter(s => s.warehouse_id).map(s => s.warehouse_id as string));

      if (branchIds.length > 0) {
        const { data: whs } = await supabase
          .from("warehouses")
          .select("id")
          .in("branch_id", branchIds);
        (whs || []).forEach((w: any) => ids.add(w.id));
      }

      return [...ids];
    },
  });

  // `undefined` (not loaded yet) must behave like the previous initial state:
  // unrestricted, with `loading` true so callers can wait.
  const allowedIds = (query.data ?? null) as string[] | null;
  const loading = !!user?.id && query.isLoading;


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
