import { useMemo } from "react";
import { useBootstrap } from "@/hooks/useBootstrap";

export type AccessState = "allow" | "deny";

export interface MyAppOverrides {
  allow: Set<string>;
  deny: Set<string>;
  loading: boolean;
  /** True when the last fetch could not reach the backend (offline). */
  failed: boolean;
}

/**
 * Fetches the current authenticated user's per-app access overrides.
 *
 * يقرأ من حزمة البدء الموحّدة (useBootstrap) — طلب واحد مشترك وقناة بث
 * واحدة لكل التطبيق بدل طلب وقناة لكل نسخة من الخطاف.
 */
export function useMyAppOverrides(): MyAppOverrides {
  const { data, isLoading, isError } = useBootstrap();

  const { allow, deny } = useMemo(() => {
    const a = new Set<string>();
    const d = new Set<string>();
    (data?.app_overrides || []).forEach((r) => {
      if (r.access_state === "allow") a.add(r.app_key);
      else if (r.access_state === "deny") d.add(r.app_key);
    });
    return { allow: a, deny: d };
  }, [data?.app_overrides]);

  // Fail closed عند الخطأ: لا تجاوزات، فتسري hidden_apps وافتراضات الدور.
  return { allow, deny, loading: isLoading, failed: isError };
}
