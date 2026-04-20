import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * useRealtimeRefresh — يشترك في تغييرات Postgres على جدول/جداول معينة لمستخدم محدد،
 * ويستدعي callback (مع debounce بسيط) لإعادة جلب بيانات الـ widget لحظياً.
 */
export function useRealtimeRefresh(opts: {
  userId?: string | null;
  tables: string[];
  onChange: () => void;
  debounceMs?: number;
  enabled?: boolean;
}) {
  const { userId, tables, onChange, debounceMs = 800, enabled = true } = opts;
  const cbRef = useRef(onChange);
  cbRef.current = onChange;

  useEffect(() => {
    if (!enabled || !userId || tables.length === 0) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const trigger = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => cbRef.current(), debounceMs);
    };

    const channel = supabase.channel(`rt-refresh-${tables.join("-")}-${userId}-${Math.random().toString(36).slice(2, 7)}`);
    tables.forEach(table => {
      channel.on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
        trigger
      );
    });
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [userId, tables.join(","), debounceMs, enabled]);
}
