import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Bell, Package, AlertTriangle, Calendar, ShoppingCart, Users, CreditCard, Check, Loader2, X, Clock, RefreshCw, Store, TruckIcon, HardDrive } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";

export interface Notification {
  id: string;
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
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
  const channelRef = useRef<any>(null);

  // Bug #2: persist read notification IDs so refresh/realtime don't bring them back as unread
  const readKey = user ? `amwali_notif_read_${user.id}` : "amwali_notif_read";
  const loadReadIds = useCallback((): Set<string> => {
    try {
      const raw = localStorage.getItem(readKey);
      if (!raw) return new Set();
      return new Set(JSON.parse(raw) as string[]);
    } catch { return new Set(); }
  }, [readKey]);
  const saveReadIds = useCallback((ids: Set<string>) => {
    try { localStorage.setItem(readKey, JSON.stringify(Array.from(ids))); } catch {}
  }, [readKey]);

  const generateNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const notifs: Notification[] = [];
    const now = new Date();
    const today = now.toISOString().split("T")[0];

    try {
      // Get team owner for qamar orders
      const { data: profile } = await supabase
        .from("profiles")
        .select("invited_by")
        .eq("user_id", user.id)
        .single();
      const ownerId = profile?.invited_by || user.id;

      // ── 1. Qamar/E-commerce orders: New ──
      const { data: qamarNew } = await supabase
        .from("qamar_orders")
        .select("id, reference_number, customer_name, total, created_at, status")
        .eq("user_id", ownerId)
        .eq("status", "جديد")
        .order("created_at", { ascending: false })
        .limit(20);

      const qamarNewList = qamarNew || [];
      if (qamarNewList.length > 0) {
        notifs.push({
          id: "qamar-new-orders",
          icon: Store,
          iconColor: "#3B82F6",
          iconBg: "rgba(59,130,246,0.1)",
          title: `${qamarNewList.length} طلبيات جديدة بانتظار التجهيز`,
          description: `إجمالي: ${qamarNewList.reduce((s, o) => s + Number(o.total || 0), 0).toLocaleString()} شيكل`,
          time: new Date(qamarNewList[0].created_at),
          path: "/orders",
          read: false,
          category: "urgent",
        });
      }

      // ── 2. Qamar orders: Overdue (new > 24h) ──
      const overdueThreshold = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      const qamarOverdue = qamarNewList.filter(o => o.created_at < overdueThreshold);
      if (qamarOverdue.length > 0) {
        notifs.push({
          id: "qamar-overdue",
          icon: AlertTriangle,
          iconColor: "#EF4444",
          iconBg: "rgba(239,68,68,0.1)",
          title: `${qamarOverdue.length} طلبيات متأخرة تحتاج متابعة!`,
          description: `طلبيات مضى عليها أكثر من 24 ساعة بحالة "جديد"`,
          time: new Date(),
          path: "/orders",
          read: false,
          category: "urgent",
        });
      }

      // ── 3. Qamar orders: Recent status changes (last 24h) ──
      const { data: recentLogs } = await supabase
        .from("order_status_log")
        .select("id, order_id, from_status, to_status, changed_by_name, created_at, notes")
        .eq("user_id", ownerId)
        .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(10);

      (recentLogs || []).forEach((log) => {
        if (log.from_status === null) return; // Skip initial creation logs
        notifs.push({
          id: `status-${log.id}`,
          icon: TruckIcon,
          iconColor: "#8B5CF6",
          iconBg: "rgba(139,92,246,0.1)",
          title: `تغيير حالة: ${log.from_status} ← ${log.to_status}`,
          description: `بواسطة: ${log.changed_by_name || "النظام"}${log.notes ? ` • ${log.notes}` : ""}`,
          time: new Date(log.created_at),
          path: "/orders",
          read: false,
          category: "info",
        });
      });

      // ── 4. Regular orders: New ──
      const { data: orders } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "جديد");

      if ((orders || []).length > 0) {
        notifs.push({
          id: "orders-new",
          icon: ShoppingCart,
          iconColor: "#0EA5E9",
          iconBg: "rgba(14,165,233,0.1)",
          title: `${(orders as any[]).length} طلبيات عادية جديدة`,
          description: `إجمالي: ${(orders as any[]).reduce((s, o) => s + Number(o.total || 0), 0).toLocaleString()} شيكل`,
          time: new Date(),
          path: "/orders",
          read: false,
          category: "info",
        });
      }

      // ── 5. Cheques due soon (7 days) ──
      const { data: cheques } = await supabase
        .from("cheques")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["مسجل", "آجل", "مستحق", "مودع", "مظهر"])
        .gte("cheque_date", today)
        .lte("cheque_date", new Date(now.getTime() + 7 * 86400000).toISOString().split("T")[0]);

      (cheques as any[] || []).forEach((ch) => {
        const daysUntil = Math.ceil((new Date(ch.cheque_date).getTime() - now.getTime()) / 86400000);
        const isEndorsed = ch.status === "مظهر";
        const prefix = isEndorsed ? "شيك مظهَّر" : "شيك";
        const endorseSuffix = isEndorsed && ch.endorsed_to_name ? ` (مظهَّر إلى ${ch.endorsed_to_name})` : "";
        notifs.push({
          id: `cheque-${ch.id}`,
          icon: CreditCard,
          iconColor: daysUntil <= 2 ? "#EF4444" : "#F59E0B",
          iconBg: daysUntil <= 2 ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
          title: daysUntil === 0 ? `${prefix} مستحق اليوم!` : `${prefix} مستحق خلال ${daysUntil} أيام`,
          description: `${ch.cheque_type === "وارد" ? "وارد من" : "صادر لـ"} ${ch.party_name}${endorseSuffix} • ${Number(ch.amount).toLocaleString()} ${ch.currency}`,
          time: new Date(ch.created_at),
          path: "/cheques",
          read: false,
          category: daysUntil <= 2 ? "urgent" : "warning",
        });
      });

      // ── 6. Overdue cheques ──
      const { data: overdue } = await supabase
        .from("cheques")
        .select("*")
        .eq("user_id", user.id)
        .in("status", ["مسجل", "آجل", "مستحق", "مودع", "مظهر"])
        .lt("cheque_date", today);

      if ((overdue || []).length > 0) {
        const endorsedCount = (overdue as any[]).filter(c => c.status === "مظهر").length;
        const endorsedNote = endorsedCount > 0 ? ` (منها ${endorsedCount} مظهَّر)` : "";
        notifs.push({
          id: "cheques-overdue",
          icon: AlertTriangle,
          iconColor: "#EF4444",
          iconBg: "rgba(239,68,68,0.1)",
          title: `${(overdue as any[]).length} شيكات متأخرة عن موعدها!${endorsedNote}`,
          description: `إجمالي: ${(overdue as any[]).reduce((s, c) => s + Number(c.amount), 0).toLocaleString()} شيكل`,
          time: new Date(),
          path: "/cheques",
          read: false,
          category: "urgent",
        });
      }

      // ── 7. Low stock ──
      const { data: products } = await supabase
        .from("products")
        .select("*")
        .eq("user_id", user.id)
        .gt("min_quantity", 0);

      const lowStock = (products || []).filter(p => Number(p.quantity) <= Number(p.min_quantity));
      if (lowStock.length > 0) {
        const zeroCount = lowStock.filter(p => Number(p.quantity) === 0).length;
        notifs.push({
          id: "stock-low",
          icon: Package,
          iconColor: zeroCount > 0 ? "#EF4444" : "#F59E0B",
          iconBg: zeroCount > 0 ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
          title: zeroCount > 0 ? `${zeroCount} منتجات نفدت من المخزون` : `${lowStock.length} منتجات بمخزون منخفض`,
          description: lowStock.slice(0, 3).map(p => p.name).join("، ") + (lowStock.length > 3 ? ` و${lowStock.length - 3} أخرى` : ""),
          time: new Date(),
          path: "/inventory",
          read: false,
          category: zeroCount > 0 ? "urgent" : "warning",
        });
      }

      // ── 8. Employee leaves ──
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
          iconColor: "#8B5CF6",
          iconBg: "rgba(139,92,246,0.1)",
          title: isToday ? `${l.employees?.full_name} في إجازة اليوم` : `إجازة قادمة: ${l.employees?.full_name}`,
          description: `${l.leave_type} • ${l.start_date} إلى ${l.end_date}`,
          time: new Date(l.created_at),
          path: "/employees",
          read: false,
          category: "info",
        });
      });

      // ── 9. Unpaid orders ──
      const { data: unpaidOrders } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .eq("status", "تم التسليم")
        .eq("payment_status", "غير مدفوع");

      if ((unpaidOrders || []).length > 0) {
        notifs.push({
          id: "orders-unpaid",
          icon: ShoppingCart,
          iconColor: "#F59E0B",
          iconBg: "rgba(245,158,11,0.1)",
          title: `${(unpaidOrders as any[]).length} طلبيات مسلّمة بدون دفع`,
          description: `إجمالي: ${(unpaidOrders as any[]).reduce((s, o) => s + Number(o.total || 0), 0).toLocaleString()} شيكل`,
          time: new Date(),
          path: "/orders",
          read: false,
          category: "warning",
        });
      }

      // ── 10. Subscription notifications ──
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
          iconColor: n.type === "expired" || n.type === "expiry_1day" ? "#EF4444" : "#F59E0B",
          iconBg: n.type === "expired" || n.type === "expiry_1day" ? "rgba(239,68,68,0.1)" : "rgba(245,158,11,0.1)",
          title: n.title || "تنبيه اشتراك",
          description: n.body || "",
          time: new Date(n.sent_at),
          path: n.path || "/billing",
          read: false,
          category: n.type === "expired" || n.type === "expiry_1day" ? "urgent" : "warning",
        });
      });

      // ── 11. Backup reminder (every 30 days) ──
      const lastBackup = localStorage.getItem(`amwali_last_backup_${user.id}`);
      let daysSinceBackup = 0;
      if (lastBackup) {
        daysSinceBackup = Math.floor((now.getTime() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24));
      } else {
        // No backup yet — calculate from account creation date
        const accountCreated = user.created_at ? new Date(user.created_at) : now;
        daysSinceBackup = Math.floor((now.getTime() - accountCreated.getTime()) / (1000 * 60 * 60 * 24));
      }

      if (daysSinceBackup >= 30) {
        notifs.push({
          id: "backup-reminder",
          icon: HardDrive,
          iconColor: "#8B5CF6",
          iconBg: "rgba(139,92,246,0.1)",
          title: lastBackup
            ? `مضى ${daysSinceBackup} يوماً على آخر نسخة احتياطية`
            : "لم تقم بإنشاء نسخة احتياطية بعد",
          description: "اذهب للإعدادات ← النسخ الاحتياطي لتصدير بياناتك",
          time: new Date(),
          path: "/settings",
          read: false,
          category: "warning",
        });
      }
    } catch (err) {
      console.error("Error generating notifications:", err);
    }

    const priority = { urgent: 0, warning: 1, info: 2 };
    notifs.sort((a, b) => priority[a.category] - priority[b.category]);
    // Apply persisted read state so dismissed notifications stay dismissed
    const readIds = loadReadIds();
    setNotifications(notifs.map(n => readIds.has(n.id) ? { ...n, read: true } : n));
    setLoading(false);
  }, [user, loadReadIds]);

  // Realtime subscription for qamar_orders changes
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`notif-qamar-orders-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "qamar_orders" }, () => {
        // Play notification sound
        try { new Audio("/notification.mp3").play().catch(() => {}); } catch {}
        generateNotifications();
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "qamar_orders" }, () => {
        generateNotifications();
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "order_status_log" }, () => {
        generateNotifications();
      })
      .subscribe();

    channelRef.current = channel;
    return () => { supabase.removeChannel(channel); };
  }, [user, generateNotifications]);

  useEffect(() => { generateNotifications(); }, [generateNotifications]);

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    const ids = loadReadIds(); ids.add(id); saveReadIds(ids);
  };

  const markAllAsRead = () => {
    setNotifications(prev => {
      const next = prev.map(n => ({ ...n, read: true }));
      const ids = loadReadIds();
      next.forEach(n => ids.add(n.id));
      saveReadIds(ids);
      return next;
    });
  };

  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, loading, unreadCount, markAsRead, markAllAsRead, refresh: generateNotifications };
}

/* ═══ Notifications Panel — Premium RTL Design ═══ */
export const NotificationsPanel = ({
  open, onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const navigate = useNavigate();
  const { notifications, loading, unreadCount, markAsRead, markAllAsRead, refresh } = useNotifications();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setTimeout(() => setRefreshing(false), 500);
  };

  if (!open) return null;

  const categoryLabel: Record<string, string> = { urgent: "عاجل", warning: "تنبيه", info: "معلومة" };

  return (
    <>
      {/* Backdrop */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 59 }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        dir="rtl"
        style={{
          position: "absolute",
          left: 0,
          top: "calc(100% + 8px)",
          width: "400px",
          maxWidth: "calc(100vw - 2rem)",
          maxHeight: "560px",
          borderRadius: "16px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          fontFamily: "Cairo, sans-serif",
          zIndex: 60,
          background: "#FFFFFF",
          border: "1px solid #E5E7EB",
          boxShadow: "0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "16px 20px",
            background: "linear-gradient(135deg, #0D1B2E 0%, #1E3A5F 100%)",
            color: "white",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div style={{
              width: "32px", height: "32px", borderRadius: "10px",
              background: "rgba(255,255,255,0.15)", display: "flex",
              alignItems: "center", justifyContent: "center",
            }}>
              <Bell size={16} color="white" />
            </div>
            <div>
              <h3 style={{ fontSize: "15px", fontWeight: "700", margin: 0, fontFamily: "Cairo" }}>الإشعارات</h3>
              {unreadCount > 0 && (
                <span style={{ fontSize: "11px", opacity: 0.8 }}>{unreadCount} غير مقروءة</span>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              onClick={handleRefresh}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "none",
                borderRadius: "8px",
                padding: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
              title="تحديث"
            >
              <RefreshCw
                size={14}
                color="white"
                style={{
                  animation: refreshing ? "spin 1s linear infinite" : "none",
                }}
              />
            </button>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "none",
                  borderRadius: "8px",
                  padding: "4px 10px",
                  cursor: "pointer",
                  fontSize: "11px",
                  color: "white",
                  fontFamily: "Cairo",
                  transition: "background 0.2s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
              >
                تحديد الكل ✓
              </button>
            )}
            <button
              onClick={onClose}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "none",
                borderRadius: "8px",
                padding: "6px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                transition: "background 0.2s",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.1)")}
            >
              <X size={14} color="white" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto" }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "60px 0" }}>
              <Loader2 size={24} color="#0D1B2E" style={{ animation: "spin 1s linear infinite" }} />
            </div>
          ) : notifications.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 20px" }}>
              <div style={{ fontSize: "40px", marginBottom: "12px" }}>🎉</div>
              <p style={{ fontSize: "15px", fontWeight: "600", color: "#1E293B", marginBottom: "4px", fontFamily: "Cairo" }}>لا توجد إشعارات</p>
              <p style={{ fontSize: "12px", color: "#9CA3AF", fontFamily: "Cairo" }}>كل شيء على ما يرام!</p>
            </div>
          ) : (
            notifications.map((n, idx) => (
              <button
                key={n.id}
                onClick={async () => {
                  markAsRead(n.id);
                  if (n.path) {
                    // Some server-generated notifications point to /employee/* paths
                    // which are protected by RoleGuard(employee). For admin/hr_manager
                    // viewers we remap to the equivalent admin route instead of 404.
                    let target = n.path;
                    if (target.startsWith("/employee/") || target === "/employee") {
                      try {
                        const { data: { user } } = await supabase.auth.getUser();
                        if (user) {
                          const { data: rolesData } = await supabase
                            .from("user_roles").select("role").eq("user_id", user.id);
                          const roles = (rolesData || []).map((r: any) => r.role);
                          const isEmployee = roles.includes("employee") && !roles.includes("admin") && !roles.includes("hr_manager");
                          if (!isEmployee) {
                            target = target.includes("attendance") || target.includes("alerts")
                              ? "/hr-attendance"
                              : "/hr";
                          }
                        }
                      } catch {}
                    }
                    navigate(target);
                    onClose();
                  }
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  padding: "14px 20px",
                  textAlign: "right",
                  cursor: "pointer",
                  border: "none",
                  borderBottom: idx < notifications.length - 1 ? "1px solid #F1F5F9" : "none",
                  background: n.read ? "transparent" : "rgba(13,27,46,0.02)",
                  transition: "background 0.15s",
                  fontFamily: "Cairo",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = n.read ? "#F8FAFC" : "rgba(13,27,46,0.04)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = n.read ? "transparent" : "rgba(13,27,46,0.02)")}
              >
                {/* Icon */}
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "12px",
                    background: n.iconBg,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: "2px",
                  }}
                >
                  <n.icon size={18} color={n.iconColor} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "3px" }}>
                    <p style={{
                      fontSize: "13px",
                      fontWeight: n.read ? "500" : "700",
                      color: n.read ? "#6B7280" : "#0D1B2E",
                      margin: 0,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      fontFamily: "Cairo",
                    }}>
                      {n.title}
                    </p>
                    {!n.read && (
                      <span style={{
                        width: "7px", height: "7px", borderRadius: "50%",
                        background: "#3B82F6", flexShrink: 0,
                      }} />
                    )}
                  </div>
                  <p style={{
                    fontSize: "12px",
                    color: "#9CA3AF",
                    margin: 0,
                    lineHeight: "1.5",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontFamily: "Cairo",
                  }}>
                    {n.description}
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "6px" }}>
                    <span style={{
                      fontSize: "10px",
                      padding: "2px 8px",
                      borderRadius: "6px",
                      fontWeight: "600",
                      fontFamily: "Cairo",
                      background: n.category === "urgent" ? "rgba(239,68,68,0.1)" :
                                  n.category === "warning" ? "rgba(245,158,11,0.1)" : "rgba(59,130,246,0.1)",
                      color: n.category === "urgent" ? "#EF4444" :
                             n.category === "warning" ? "#F59E0B" : "#3B82F6",
                    }}>
                      {categoryLabel[n.category]}
                    </span>
                    <span style={{ fontSize: "10px", color: "#CBD5E1", fontFamily: "Cairo" }}>
                      {formatDistanceToNow(n.time, { locale: ar, addSuffix: true })}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        {notifications.length > 0 && (
          <div
            style={{
              padding: "10px 20px",
              borderTop: "1px solid #F1F5F9",
              textAlign: "center",
            }}
          >
            <span style={{ fontSize: "11px", color: "#9CA3AF", fontFamily: "Cairo" }}>
              آخر تحديث: {formatDistanceToNow(new Date(), { locale: ar, addSuffix: true })}
            </span>
          </div>
        )}
      </div>

      {/* Keyframe for spinner */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
};
