import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Shared cache for the current user's roles from `public.user_roles`.
 *
 * Before this hook, ~8 independent components (EmployeeApp,
 * ChooseWorkspacePage, useAccountantPermissions, useMyFeaturePermissions,
 * useRoleGuard, …) each ran their own `select role from user_roles`
 * query on every mount. On the /employee route we measured 9 identical
 * calls within 18 s. Consolidating them behind React Query (5 min
 * staleTime) collapses that to a single request that every consumer
 * reads from cache.
 *
 * Safe by design:
 * - Keyed by `user.id` so the cache invalidates on account switch.
 * - `enabled: !!user?.id` — never fires while signed-out.
 * - Returns `[]` on error so callers keep their fail-closed behavior
 *   (nothing is granted just because the fetch failed).
 */
export function useUserRoles() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["user_roles", user?.id ?? null],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // 5 minutes — roles rarely change mid-session
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id);
      if (error) {
        console.warn("[useUserRoles] fetch failed:", error);
        return [];
      }
      return (data || []).map((r: any) => String(r.role));
    },
  });

  return {
    roles: (query.data ?? []) as string[],
    loading: !!user?.id && query.isLoading,
    refetch: query.refetch,
  };
}