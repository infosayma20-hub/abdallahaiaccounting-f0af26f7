import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
 * Subscribes to realtime so the moment an admin flips an override the UI updates.
 */
export function useMyAppOverrides(): MyAppOverrides {
  const { user } = useAuth();
  const [allow, setAllow] = useState<Set<string>>(new Set());
  const [deny, setDeny] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (uid: string) => {
    try {
      const { data, error } = await supabase
        .from("user_app_access_overrides" as any)
        .select("app_key,access_state")
        .eq("target_user_id", uid);
      const a = new Set<string>();
      const d = new Set<string>();
      (data || []).forEach((r: any) => {
        if (r.access_state === "allow") a.add(r.app_key);
        else if (r.access_state === "deny") d.add(r.app_key);
      });
      if (error) throw error;
      setAllow(a);
      setDeny(d);
      setFailed(false);
    } catch (err) {
      console.warn("[useMyAppOverrides] load failed:", err);
      // Fail closed: no overrides, so org-level hidden_apps + role defaults apply.
      setAllow(new Set());
      setDeny(new Set());
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    load(user.id);
    const channelInstanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ch = supabase
      .channel(`uaao-${user.id}-${channelInstanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_app_access_overrides", filter: `target_user_id=eq.${user.id}` },
        () => load(user.id)
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user?.id, load]);

  return { allow, deny, loading, failed };
}