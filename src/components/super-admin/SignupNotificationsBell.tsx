import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

interface AdminNotification {
  id: string;
  event_type: "signup" | "email_verified" | "first_login";
  user_email: string;
  user_name: string | null;
  metadata: any;
  is_read: boolean;
  email_sent: boolean;
  created_at: string;
}

const EVENT_LABELS = {
  signup: { label: "📝 تسجيل جديد", color: "bg-blue-500" },
  email_verified: { label: "✅ تفعيل إيميل", color: "bg-emerald-500" },
  first_login: { label: "🔓 أول دخول", color: "bg-purple-500" },
};

export function SignupNotificationsBell() {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("admin_notifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (data) setItems(data as AdminNotification[]);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("topic-super-admin-signup-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "admin_notifications" },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const unreadCount = items.filter((i) => !i.is_read).length;

  const markAllRead = async () => {
    const unread = items.filter((i) => !i.is_read).map((i) => i.id);
    if (!unread.length) return;
    await supabase
      .from("admin_notifications")
      .update({ is_read: true })
      .in("id", unread);
    load();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative p-1.5 sm:p-2 rounded-lg transition-colors"
          style={{ background: "var(--sa-surface)", color: "var(--sa-text-muted)" }}
          title="الإشعارات"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-0" dir="rtl">
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-bold text-sm">إشعارات المستخدمين</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="text-xs h-7">
              تحديد الكل كمقروء
            </Button>
          )}
        </div>
        <ScrollArea className="h-[420px]">
          {items.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              لا توجد إشعارات
            </div>
          ) : (
            <div className="divide-y">
              {items.map((n) => {
                const cfg = EVENT_LABELS[n.event_type];
                return (
                  <div
                    key={n.id}
                    className={`p-3 hover:bg-muted/40 transition-colors ${!n.is_read ? "bg-blue-50/50 dark:bg-blue-950/20" : ""}`}
                  >
                    <div className="flex items-start gap-2">
                      <span className={`${cfg.color} h-2 w-2 rounded-full mt-1.5 flex-shrink-0`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-semibold">{cfg.label}</span>
                          {!n.email_sent && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1">
                              لم يُرسل إيميل
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium truncate">{n.user_name || n.user_email}</p>
                        <p className="text-xs text-muted-foreground truncate">{n.user_email}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(n.created_at), { addSuffix: true, locale: ar })}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
