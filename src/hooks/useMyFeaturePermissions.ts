import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AccessState = "allow" | "deny";

/**
 * Returns the current user's per-feature overrides as a Map keyed by
 * "app_key.feature_key.permission_key" → AccessState.
 * Subscribes to realtime so UI updates the moment an admin toggles a permission.
 */
export function useMyFeaturePermissions() {
  const { user } = useAuth();
  const [overrides, setOverrides] = useState<Map<string, AccessState>>(new Map());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from("user_feature_permissions" as any)
        .select("app_key,feature_key,permission_key,access_state")
        .eq("target_user_id", uid);
      const map = new Map<string, AccessState>();
      (data || []).forEach((r: any) => {
        map.set(`${r.app_key}.${r.feature_key}.${r.permission_key}`, r.access_state);
      });
      if (error) throw error;
      setOverrides(map);
      setFailed(false);
    } catch (err) {
      console.warn("[useMyFeaturePermissions] load failed:", err);
      // Fail closed: no overrides, so role defaults apply.
      setOverrides(new Map());
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) { setLoading(false); return; }
    load(user.id);
    const channelInstanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ch = supabase
      .channel(`ufp-${user.id}-${channelInstanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_feature_permissions", filter: `target_user_id=eq.${user.id}` },
        () => load(user.id)
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, load]);

  return { overrides, loading, failed };
}