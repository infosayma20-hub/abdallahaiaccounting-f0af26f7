import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface RealtimeNotification {
  id: string;
  actorName: string;
  action: string;
  entityType: string;
  entityLabel: string | null;
  createdAt: string;
  read: boolean;
}

const ACTION_LABELS: Record<string, string> = {
  create_transaction: "أضاف قيد محاسبي",
  create_invoice: "أنشأ فاتورة",
  create_purchase: "أنشأ فاتورة مشتريات",
  approve_transaction: "اعتمد معاملة",
  reject_transaction: "رفض معاملة",
  close_shift: "أغلق وردية",
  cheque_status_change: "غيّر حالة شيك",
  create_contact: "أضاف جهة اتصال",
  update_account: "عدّل حساب",
  create_journal: "أضاف قيد يومية",
};

export function useRealtimeNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<RealtimeNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  // Load recent activity on mount
  useEffect(() => {
    if (!user) return;

    const loadRecent = async () => {
      const { data } = await (supabase as any)
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (data) {
        const mapped = data
          .filter((a: any) => a.actor_id !== user.id)
          .map((a: any) => ({
            id: a.id,
            actorName: a.actor_name,
            action: ACTION_LABELS[a.action] || a.action,
            entityType: a.entity_type,
            entityLabel: a.entity_label,
            createdAt: a.created_at,
            read: false,
          }));
        setNotifications(mapped);
        setUnreadCount(mapped.length);
      }
    };

    loadRecent();
  }, [user]);

  // Subscribe to realtime
  useEffect(() => {
    if (!user) return;

    channelRef.current = supabase
      .channel("team-activity")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "activity_log" },
        (payload) => {
          const a = payload.new as any;
          if (a.actor_id === user.id) return; // Don't notify self

          const notification: RealtimeNotification = {
            id: a.id,
            actorName: a.actor_name,
            action: ACTION_LABELS[a.action] || a.action,
            entityType: a.entity_type,
            entityLabel: a.entity_label,
            createdAt: a.created_at,
            read: false,
          };

          setNotifications((prev) => [notification, ...prev].slice(0, 100));
          setUnreadCount((c) => c + 1);
        }
      )
      .subscribe();

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
      }
    };
  }, [user]);

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
    setUnreadCount(0);
  }, []);

  return { notifications, unreadCount, markAllRead, clearAll };
}
