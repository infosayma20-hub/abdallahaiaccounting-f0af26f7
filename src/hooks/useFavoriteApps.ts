import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const favoritesCache = new Map<string, string[]>();

const readCachedFavorites = (userId?: string) => {
  if (!userId) return [];
  const memoryValue = favoritesCache.get(userId);
  if (memoryValue) return memoryValue;
  try {
    const saved = JSON.parse(localStorage.getItem(`unify:apps:favorites:${userId}`) || "[]");
    if (!Array.isArray(saved)) return [];
    const ids = saved.filter((id): id is string => typeof id === "string");
    favoritesCache.set(userId, ids);
    return ids;
  } catch {
    return [];
  }
};

const cacheFavorites = (userId: string, appIds: string[]) => {
  favoritesCache.set(userId, appIds);
  try { localStorage.setItem(`unify:apps:favorites:${userId}`, JSON.stringify(appIds)); } catch {}
};

/**
 * useFavoriteApps — مزامنة لحظية لقائمة التطبيقات المفضّلة عبر Supabase
 * - يقرأ الصف من user_favorite_apps
 * - يدعم toggle (إضافة/إزالة)
 * - يستمع لتحديثات realtime لمزامنة التبويبات
 */
export function useFavoriteApps() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<string[]>(() => readCachedFavorites(user?.id));
  const [loading, setLoading] = useState(() => !user?.id || !favoritesCache.has(user.id));

  const fetchFavorites = useCallback(async () => {
    if (!user?.id) { setFavorites([]); setLoading(false); return; }
    try {
      const { data, error } = await supabase
        .from("user_favorite_apps")
        .select("app_id, sort_order")
        .eq("user_id", user.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      const nextFavorites = (data || []).map((r: any) => r.app_id as string);
      cacheFavorites(user.id, nextFavorites);
      setFavorites(nextFavorites);
    } catch (err) {
      console.warn("[useFavoriteApps] load failed:", err);
      setFavorites([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    const cached = readCachedFavorites(user?.id);
    setFavorites(cached);
    setLoading(Boolean(user?.id) && !favoritesCache.has(user.id));
    fetchFavorites();
  }, [fetchFavorites]);

  // Realtime sync across tabs/devices
  useEffect(() => {
    if (!user?.id) return;
    const channelInstanceId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const channel = supabase
      .channel(`favorite-apps-${user.id}-${channelInstanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_favorite_apps", filter: `user_id=eq.${user.id}` },
        () => { fetchFavorites(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id, fetchFavorites]);

  const isFavorite = useCallback((appId: string) => favorites.includes(appId), [favorites]);

  const toggleFavorite = useCallback(async (appId: string) => {
    if (!user?.id) return;
    const exists = favorites.includes(appId);
    if (exists) {
      // optimistic
      setFavorites(prev => {
        const next = prev.filter(id => id !== appId);
        cacheFavorites(user.id, next);
        return next;
      });
      await supabase.from("user_favorite_apps").delete().eq("user_id", user.id).eq("app_id", appId);
    } else {
      setFavorites(prev => {
        const next = [...prev, appId];
        cacheFavorites(user.id, next);
        return next;
      });
      await supabase.from("user_favorite_apps").insert({
        user_id: user.id,
        app_id: appId,
        sort_order: favorites.length,
      });
    }
  }, [favorites, user?.id]);

  return { favorites, isFavorite, toggleFavorite, loading };
}
