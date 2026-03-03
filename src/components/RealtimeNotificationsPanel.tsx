import { Bell, Check, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { useRealtimeNotifications, RealtimeNotification } from "@/hooks/useRealtimeNotifications";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

const ENTITY_ICONS: Record<string, string> = {
  transaction: "📝",
  invoice: "🧾",
  cheque: "📄",
  contact: "👤",
  account: "📊",
  shift: "🕐",
  journal: "📒",
};

function NotificationItem({ notification }: { notification: RealtimeNotification }) {
  const icon = ENTITY_ICONS[notification.entityType] || "🔔";
  const timeAgo = formatDistanceToNow(new Date(notification.createdAt), {
    addSuffix: true,
    locale: ar,
  });

  return (
    <div
      className={`flex items-start gap-3 p-3 border-b border-border last:border-0 transition-colors ${
        notification.read ? "bg-background" : "bg-primary/5"
      }`}
    >
      <span className="text-lg mt-0.5">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">{notification.actorName}</span>{" "}
          {notification.action}
          {notification.entityLabel && (
            <span className="text-muted-foreground"> — {notification.entityLabel}</span>
          )}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{timeAgo}</p>
      </div>
      {!notification.read && (
        <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
      )}
    </div>
  );
}

export default function RealtimeNotificationsPanel() {
  const { notifications, unreadCount, markAllRead, clearAll } =
    useRealtimeNotifications();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge
              variant="destructive"
              className="absolute -top-1 -right-1 h-5 min-w-5 px-1 text-[10px] flex items-center justify-center"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 p-0"
        align="end"
        dir="rtl"
      >
        <div className="flex items-center justify-between p-3 border-b border-border">
          <h3 className="font-semibold text-sm">الإشعارات</h3>
          <div className="flex gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 text-xs gap-1">
                <Check className="h-3 w-3" />
                قراءة الكل
              </Button>
            )}
            {notifications.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearAll} className="h-7 text-xs gap-1 text-muted-foreground">
                <Trash2 className="h-3 w-3" />
                مسح
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="max-h-[400px]">
          {notifications.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Bell className="h-8 w-8 mx-auto mb-2 opacity-30" />
              لا توجد إشعارات
            </div>
          ) : (
            notifications.map((n) => (
              <NotificationItem key={n.id} notification={n} />
            ))
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
