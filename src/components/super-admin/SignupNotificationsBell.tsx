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
  event_type: string | null;
  user_email: string | null;
  user_name: string | null;
  metadata: any;
  is_read: boolean | null;
  email_sent: boolean | null;
  created_at: string | null;
}

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  signup: { label: "📝 تسجيل جديد", color: "bg-blue-500" },
  email_verified: { label: "✅ تفعيل إيميل", color: "bg-emerald-500" },
  first_login: { label: "🔓 أول دخول", color: "bg-purple-500" },
  watchlist_login: { label: "👁️ دخول حساب مراقَب", color: "bg-amber-500" },
  watchlist_export: { label: "⚠️ تصدير من حساب مراقَب", color: "bg-red-500" },
  watchlist_print: { label: "🖨️ طباعة من حساب مراقَب", color: "bg-red-500" },
};

const DEFAULT_EVENT = { label: "🔔 إشعار", color: "bg-slate-400" };

/** يمنع تكرار نفس الإشعار (نفس النوع + نفس المستخدم + نفس الدقيقة) ويستبعد الصفوف بدون id */
function dedupe(rows: AdminNotification[]): AdminNotification[] {
  const seenIds = new Set<string>();
  const seenKeys = new Set<string>();
  const out: AdminNotification[] = [];
  for (const r of rows) {
    if (!r?.id || seenIds.has(r.id)) continue;
    const minute = r.created_at ? String(r.created_at).slice(0, 16) : "";
    const key = `${r.event_type ?? "?"}|${(r.user_email ?? "").toLowerCase()}|${minute}`;
    if (seenKeys.has(key)) continue;
    seenIds.add(r.id);
    seenKeys.add(key);
    out.push(r);
  }
  return out;
}

function safeTimeAgo(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "";
  try {
    return formatDistanceToNow(d, { addSuffix: true, locale: ar });
  } catch {
    return "";
  }
}

export function SignupNotificationsBell() {
  const [items, setItems] = useState<AdminNotification[]>([]);
  const [open, setOpen] = useState(false);

  const load = async () => {
    try {
      const { data, error } = await supabase
        .from("admin_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) {
        console.warn("[SignupNotificationsBell] load failed:", error.message);
        return;
      }
      setItems(dedupe((data ?? []) as AdminNotification[]));
    } catch (e) {
      console.warn("[SignupNotificationsBell] load exception:", e);
    }
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
    try {
      await supabase.from("admin_notifications").update({ is_read: true }).in("id", unread);
    } catch (e) {
      console.warn("[SignupNotificationsBell] markAllRead failed:", e);
    }
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
                const cfg = EVENT_LABELS[n.event_type] ?? DEFAULT_EVENT;
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
                        <p className="text-sm font-medium truncate">{n.user_name || n.user_email || "—"}</p>
                        <p className="text-xs text-muted-foreground truncate">{n.user_email || ""}</p>
                        <p className="text-[11px] text-muted-foreground mt-1">{safeTimeAgo(n.created_at)}</p>
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
