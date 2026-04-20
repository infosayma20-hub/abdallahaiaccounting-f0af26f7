/**
 * useRealtimeRefresh — يستمع لتغيرات الجداول المالية ويستدعي callback لتحديث widgets.
 */
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const TABLES = ["invoices", "transactions", "products"];

export function useRealtimeRefresh(userId: string | undefined, onChange: () => void) {
  useEffect(() => {
    if (!userId) return;
    const channel = supabase.channel(`dashboard-refresh-${userId}`);
    TABLES.forEach(table => {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
        () => onChange()
      );
    });
    channel.subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, onChange]);
}
