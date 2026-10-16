import { useBootstrap } from "@/hooks/useBootstrap";
import { useAuth } from "@/hooks/useAuth";

/**
 * Shared cache for the current user's roles from `public.user_roles`.
 *
 * يقرأ الآن من حزمة البدء الموحّدة (useBootstrap) — نفس الطلب الواحد الذي
 * يجلب الصلاحيات والشركة والاشتراك، بدل استعلام user_roles المنفصل.
 *
 * Safe by design:
 * - Keyed by `user.id` so the cache invalidates on account switch.
 * - Returns `[]` while loading or on error so callers keep their
 *   fail-closed behavior (nothing is granted just because the fetch failed).
 */
export function useUserRoles() {
  const { user } = useAuth();
  const query = useBootstrap();

  return {
    roles: (query.data?.roles ?? []) as string[],
    loading: !!user?.id && query.isLoading,
    refetch: query.refetch,
  };
}
