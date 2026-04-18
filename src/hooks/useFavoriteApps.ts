import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * useFavoriteApps — مزامنة لحظية لقائمة التطبيقات المفضّلة عبر Supabase
 * - يقرأ الصف من user_favorite_apps
 * - يدعم toggle (إضافة/إزالة)
 * - يستمع لتحديثات realtime لمزامنة التبويبات
 */
export function useFavoriteApps() {
  const { user } = useAuth();
  const [favorites, setFavorites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchFavorites = useCallback(async () => {
    if (!user?.id) { setFavorites([]); setLoading(false); return; }
    const { data } = await supabase
      .from("user_favorite_apps")
      .select("app_id, sort_order")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    setFavorites((data || []).map((r: any) => r.app_id));
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  // Realtime sync across tabs/devices
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel(`favorite-apps-${user.id}`)
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
      setFavorites(prev => prev.filter(id => id !== appId));
      await supabase.from("user_favorite_apps").delete().eq("user_id", user.id).eq("app_id", appId);
    } else {
      setFavorites(prev => [...prev, appId]);
      await supabase.from("user_favorite_apps").insert({
        user_id: user.id,
        app_id: appId,
        sort_order: favorites.length,
      });
    }
  }, [favorites, user?.id]);

  return { favorites, isFavorite, toggleFavorite, loading };
}
