import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Bell, Package, AlertTriangle, Calendar, ShoppingCart, Users, CreditCard, Check, Loader2, X, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

export interface Notification {
  id: string;
  icon: React.ElementType;
  iconColor: string;
  title: string;
  description: string;
  time: Date;
  path?: string;
  read: boolean;
  category: "urgent" | "warning" | "info";
}

export function useNotifications() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const generateNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const notifs: Notification[] = [];
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    try {
      // 1. Cheques due soon (within 7 days)
      const { data: cheques } = await supabase
        .from("cheques")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["مسجل", "آجل", "مستحق"])
        .gte("cheque_date", today)
        .lte("cheque_date", new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0]);

      (cheques as any[] || []).forEach((ch) => {
        const daysUntil = Math.ceil((new Date(ch.cheque_date).getTime() - now.getTime()) / 86400000);
        notifs.push({
          id: `cheque-${ch.id}`,
          icon: CreditCard,
          iconColor: daysUntil <= 2 ? "text-destructive" : "text-warning",
          title: daysUntil === 0 ? "شيك مستحق اليوم!" : `شيك مستحق خلال ${daysUntil} أيام`,
          description: `${ch.cheque_type === "وارد" ? "وارد من" : "صادر لـ"} ${ch.party_name} • ${Number(ch.amount).toLocaleString()} ${ch.currency}`,
          time: new Date(ch.created_at),
          path: "/cheques",
          read: false,
          category: daysUntil <= 2 ? "urgent" : "warning",
        });
      });

      // 2. Low stock products
      const { data: products } = await supabase
        .from("products")
        .select("*")
        .eq("user_id", user.id)
        .gt("min_quantity", 0);

      (products as any[] || []).filter(p => Number(p.quantity) <= Number(p.min_quantity)).forEach((p) => {
        const isZero = Number(p.quantity) === 0;
        notifs.push({
          id: `stock-${p.id}`,
          icon: Package,
          iconColor: isZero ? "text-destructive" : "text-warning",
          title: isZero ? `نفاد مخزون: ${p.name}` : `مخزون منخفض: ${p.name}`,
          description: `الكمية: ${p.quantity} ${p.unit} (الحد الأدنى: ${p.min_quantity})`,
          time: new Date(p.updated_at),
          path: "/inventory",
          read: false,
          category: isZero ? "urgent" : "warning",
        });
      });

      // 3. New orders pending
      const { data: orders } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "جديد");

      if ((orders as any[] || []).length > 0) {
        notifs.push({
          id: "orders-new",
          icon: ShoppingCart,
          iconColor: "text-info",
          title: `${(orders as any[]).length} طلبيات جديدة بانتظار التجهيز`,
          description: `إجمالي: ${(orders as any[]).reduce((s, o) => s + Number(o.total || 0), 0).toLocaleString()} شيكل`,
          time: new Date(),
          path: "/orders",
          read: false,
          category: "info",
        });
      }

      // 4. Employee leaves today/upcoming
      const { data: leaves } = await supabase
        .from("employee_leaves")
        .select("*, employees!inner(full_name)")
        .eq("user_id", user.id)
        .eq("status", "موافق عليها")
        .lte("start_date", new Date(now.getTime() + 3 * 86400000).toISOString().split("T")[0])
        .gte("end_date", today);

      (leaves as any[] || []).forEach((l) => {
        const isToday = l.start_date <= today && l.end_date >= today;
        notifs.push({
          id: `leave-${l.id}`,
          icon: Calendar,
          iconColor: "text-accent",
          title: isToday ? `${l.employees?.full_name} في إجازة اليوم` : `إجازة قادمة: ${l.employees?.full_name}`,
          description: `${l.leave_type} • ${l.start_date} إلى ${l.end_date}`,
          time: new Date(l.created_at),
          path: "/employees",
          read: false,
          category: "info",
        });
      });

      // 5. Unpaid employee deductions (advances > 500)
      const { data: deductions } = await supabase
        .from("employee_deductions")
        .select("*, employees!inner(full_name)")
        .eq("user_id", user.id)
        .eq("is_repaid", false)
        .eq("deduction_type", "سلفة")
        .gt("amount", 500);

      if ((deductions as any[] || []).length > 0) {
        const totalAdv = (deductions as any[]).reduce((s, d) => s + Number(d.amount), 0);
        notifs.push({
          id: "advances-unpaid",
          icon: AlertTriangle,
          iconColor: "text-warning",
          title: `${(deductions as any[]).length} سلف غير مسددة`,
          description: `إجمالي: ${totalAdv.toLocaleString()} شيكل`,
          time: new Date(),
          path: "/employees",
          read: false,
          category: "warning",
        });
      }

      // 6. Overdue cheques
      const { data: overdue } = await supabase
        .from("cheques")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["مسجل", "آجل", "مستحق"])
        .lt("cheque_date", today);

      if ((overdue as any[] || []).length > 0) {
        notifs.push({
          id: "cheques-overdue",
          icon: AlertTriangle,
          iconColor: "text-destructive",
          title: `${(overdue as any[]).length} شيكات متأخرة عن موعدها!`,
          description: `إجمالي: ${(overdue as any[]).reduce((s, c) => s + Number(c.amount), 0).toLocaleString()} شيكل`,
          time: new Date(),
          path: "/cheques",
          read: false,
          category: "urgent",
        });
      }

      // 7. Unpaid orders
      const { data: unpaidOrders } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "تم التسليم")
        .eq("payment_status", "غير مدفوع");

      if ((unpaidOrders as any[] || []).length > 0) {
        notifs.push({
          id: "orders-unpaid",
          icon: ShoppingCart,
          iconColor: "text-warning",
          title: `${(unpaidOrders as any[]).length} طلبيات مسلّمة بدون دفع`,
          description: `إجمالي: ${(unpaidOrders as any[]).reduce((s, o) => s + Number(o.total || 0), 0).toLocaleString()} شيكل`,
          time: new Date(),
          path: "/orders",
          read: false,
          category: "warning",
        });
      }

      // 8. Subscription expiry notifications from notification_log
      const { data: subNotifs } = await supabase
        .from("notification_log")
        .select("*")
        .eq("user_id", user.id)
        .eq("channel", "in_app")
        .is("read_at", null)
        .order("sent_at", { ascending: false })
        .limit(5);

      (subNotifs as any[] || []).forEach((n) => {
        notifs.push({
          id: `sub-${n.id}`,
          icon: Clock,
          iconColor: n.type === "expired" ? "text-destructive" : n.type === "expiry_1day" ? "text-destructive" : "text-warning",
          title: n.title || "تنبيه اشتراك",
          description: n.body || "",
          time: new Date(n.sent_at),
          path: n.path || "/billing",
          read: false,
          category: n.type === "expired" || n.type === "expiry_1day" ? "urgent" : "warning",
        });
      });

    } catch (err) {
      console.error("Error generating notifications:", err);
    }

    // Sort: urgent first, then warning, then info
    const priority = { urgent: 0, warning: 1, info: 2 };
    notifs.sort((a, b) => priority[a.category] - priority[b.category]);
    setNotifications(notifs);
    setLoading(false);
  }, [user]);

  useEffect(() => { generateNotifications(); }, [generateNotifications]);

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, loading, unreadCount, markAsRead, markAllAsRead, refresh: generateNotifications };
}

/* ═══ Notifications Panel ═══ */
export const NotificationsPanel = ({
  open, onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const navigate = useNavigate();
  const { notifications, loading, unreadCount, markAsRead, markAllAsRead, refresh } = useNotifications();

  if (!open) return null;

  const categoryLabel = { urgent: "عاجل", warning: "تنبيه", info: "معلومة" };
  const categoryStyle = {
    urgent: "bg-destructive/10 text-destructive border-destructive/20",
    warning: "bg-warning/10 text-warning border-warning/20",
    info: "bg-info/10 text-info border-info/20",
  };

  return (
    <>
      <div className="fixed inset-0 z-50" onClick={onClose} />
      <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-card border border-border/60 rounded-xl shadow-2xl z-50 max-h-[520px] flex flex-col" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">الإشعارات</h3>
            {unreadCount > 0 && (
              <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold">{unreadCount}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button onClick={markAllAsRead} className="text-[10px] text-primary hover:underline">تحديد الكل كمقروء</button>
            )}
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : notifications.length === 0 ? (
            <div className="py-12 text-center">
              <Check className="h-8 w-8 text-primary/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">لا توجد إشعارات حالياً</p>
              <p className="text-xs text-muted-foreground/60 mt-1">كل شيء على ما يرام! 🎉</p>
            </div>
          ) : (
            notifications.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  markAsRead(n.id);
                  if (n.path) { navigate(n.path); onClose(); }
                }}
                className={cn(
                  "w-full flex items-start gap-3 px-4 py-3 text-right transition-colors border-b border-border/20 last:border-0",
                  n.read ? "bg-transparent hover:bg-muted/30" : "bg-primary/[0.03] hover:bg-primary/[0.06]"
                )}
              >
                <div className={cn("p-2 rounded-lg mt-0.5 flex-shrink-0", categoryStyle[n.category])}>
                  <n.icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className={cn("text-xs font-medium truncate", n.read ? "text-muted-foreground" : "text-foreground")}>{n.title}</p>
                    {!n.read && <span className="w-1.5 h-1.5 rounded-full bg-primary flex-shrink-0" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{n.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn("text-[9px] px-1.5 py-0.5 rounded border font-medium", categoryStyle[n.category])}>
                      {categoryLabel[n.category]}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </>
  );
};
