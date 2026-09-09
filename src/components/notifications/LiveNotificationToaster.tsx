import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { notifyAlert, unlockNotificationSound } from "@/lib/notification-sound";

/**
 * تنبيه فوري داخل البرنامج (أسفل يمين الشاشة) + صوت، لكل إشعار جديد
 * يصل للمستخدم الحالي في `notification_log` — إجراء عقابي، طلب موظف،
 * تحويل من الإدارة… إلخ.
 *
 * لا يغيّر أي مسار قائم: نفس السجلات تبقى ظاهرة في جرس الإشعارات.
 */
export default function LiveNotificationToaster() {
  const navigate = useNavigate();
  const seen = useRef<Set<string>>(new Set());

  // فك قفل الصوت مع أول تفاعل من المستخدم (سياسة المتصفحات)
  useEffect(() => {
    const once = () => unlockNotificationSound();
    window.addEventListener("pointerdown", once, { once: true });
    window.addEventListener("keydown", once, { once: true });
    return () => {
      window.removeEventListener("pointerdown", once);
      window.removeEventListener("keydown", once);
    };
  }, []);

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const start = async () => {
      const { data } = await supabase.auth.getUser();
      const userId = data?.user?.id;
      if (!userId || cancelled) return;

      channel = supabase
        .channel(`inapp-notifications-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "notification_log",
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            const row: any = payload.new || {};
            if (!row.id || seen.current.has(row.id)) return;
            seen.current.add(row.id);

            notifyAlert();
            toast(row.title || "إشعار جديد", {
              description: row.body || undefined,
              duration: 12000,
              icon: <Bell className="h-4 w-4 text-primary" />,
              action: row.path
                ? { label: "فتح", onClick: () => navigate(row.path) }
                : undefined,
            });
          },
        )
        .subscribe();
    };

    void start();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [navigate]);

  return null;
}
