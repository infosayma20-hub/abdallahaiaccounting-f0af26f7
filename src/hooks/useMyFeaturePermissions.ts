import { useMemo } from "react";
import { useBootstrap } from "@/hooks/useBootstrap";

export type AccessState = "allow" | "deny";

/**
 * Returns the current user's per-feature overrides as a Map keyed by
 * "app_key.feature_key.permission_key" → AccessState.
 *
 * يقرأ من حزمة البدء الموحّدة (useBootstrap) — طلب واحد مشترك لكل التطبيق
 * وقناة بث واحدة، بدل طلب وقناتين لكل نسخة من هذا الخطاف (كانت قائمة
 * الفواتير وحدها تفتح 10 طلبات و10 قنوات).
 */
export function useMyFeaturePermissions() {
  const { data, isLoading, isError } = useBootstrap();

  const overrides = useMemo(() => {
    const map = new Map<string, AccessState>();
    (data?.feature_permissions || []).forEach((r) => {
      map.set(`${r.app_key}.${r.feature_key}.${r.permission_key}`, r.access_state);
    });
    return map;
  }, [data?.feature_permissions]);

  // Fail closed عند الخطأ: لا تجاوزات، فتسري افتراضات الدور فقط.
  return { overrides, loading: isLoading, failed: isError };
}
