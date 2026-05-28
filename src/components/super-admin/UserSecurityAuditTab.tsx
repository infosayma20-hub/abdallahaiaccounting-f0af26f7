import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  RefreshCw,
  Search,
  Eye,
  AlertTriangle,
  LogIn,
  LogOut,
  UserPlus,
  KeyRound,
  Monitor,
  Smartphone,
  Tablet,
  MapPin,
  Globe,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { ar } from "date-fns/locale";
import { toast } from "sonner";

interface AuditEvent {
  id: string;
  user_id: string;
  user_email: string | null;
  user_name: string | null;
  event_type: string;
  auth_method: string | null;
  ip_address: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  is_new_device: boolean;
  is_suspicious: boolean;
  risk_score: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

const EVENT_LABELS: Record<string, { label: string; icon: typeof LogIn; color: string }> = {
  login_success: { label: "دخول ناجح", icon: LogIn, color: "text-emerald-400" },
  login_failed: { label: "فشل دخول", icon: AlertTriangle, color: "text-red-400" },
  logout: { label: "خروج", icon: LogOut, color: "text-slate-400" },
  signup: { label: "تسجيل جديد", icon: UserPlus, color: "text-blue-400" },
  password_changed: { label: "تغيير كلمة المرور", icon: KeyRound, color: "text-amber-400" },
  password_recovery: { label: "استعادة كلمة المرور", icon: KeyRound, color: "text-amber-400" },
  user_updated: { label: "تحديث الحساب", icon: KeyRound, color: "text-cyan-400" },
};

const DEVICE_ICONS = {
  desktop: Monitor,
  mobile: Smartphone,
  tablet: Tablet,
};

interface Props {
  cardBg: string;
  cardBorder: string;
  divider: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textFaint: string;
  cardHover: string;
}

export default function UserSecurityAuditTab({
  cardBg,
  cardBorder,
  divider,
  textPrimary,
  textSecondary,
  textMuted,
  textFaint,
  cardHover,
}: Props) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterRisk, setFilterRisk] = useState<string>("all");
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("user_security_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      if (filterType !== "all") query = query.eq("event_type", filterType);
      if (filterRisk === "suspicious") query = query.eq("is_suspicious", true);
      if (filterRisk === "new_device") query = query.eq("is_new_device", true);

      const { data, error } = await query;
      if (error) throw error;
      setEvents((data || []) as AuditEvent[]);
    } catch (e: any) {
      toast.error("فشل تحميل السجل: " + e.message);
    } finally {
      setLoading(false);
    }
  }, [filterType, filterRisk]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: live updates for new security events
  useEffect(() => {
    const channel = supabase
      .channel("topic-super-admin-user-security-audit")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "user_security_audit" },
        (payload) => {
          const newEvent = payload.new as AuditEvent;
          setEvents((prev) => {
            // Respect current filter
            if (filterType !== "all" && newEvent.event_type !== filterType) return prev;
            if (filterRisk === "suspicious" && !newEvent.is_suspicious) return prev;
            if (filterRisk === "new_device" && !newEvent.is_new_device) return prev;
            return [newEvent, ...prev].slice(0, 500);
          });
          if (newEvent.is_suspicious) {
            toast.warning(`🚨 نشاط مشبوه: ${newEvent.user_email || newEvent.user_id.slice(0, 8)}`);
          }
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [filterType, filterRisk]);

  const filtered = events.filter((e) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.user_email?.toLowerCase().includes(q) ||
      e.user_name?.toLowerCase().includes(q) ||
      e.ip_address?.toLowerCase().includes(q) ||
      e.country?.toLowerCase().includes(q) ||
      e.city?.toLowerCase().includes(q)
    );
  });

  const stats = {
    total: events.length,
    suspicious: events.filter((e) => e.is_suspicious).length,
    newDevices: events.filter((e) => e.is_new_device).length,
    failed: events.filter((e) => e.event_type === "login_failed").length,
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: textPrimary }}>
          <Shield className="h-5 w-5 text-emerald-400" /> السجل الأمني للمستخدمين
          <span className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            </span>
            LIVE
          </span>
        </h2>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading} style={{ color: textMuted }}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي الأحداث", value: stats.total, color: "text-blue-400" },
          { label: "أنشطة مشبوهة", value: stats.suspicious, color: "text-red-400" },
          { label: "أجهزة جديدة", value: stats.newDevices, color: "text-amber-400" },
          { label: "محاولات فاشلة", value: stats.failed, color: "text-orange-400" },
        ].map((s) => (
          <div
            key={s.label}
            className="rounded-xl p-3"
            style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
          >
            <div className="text-xs mb-1" style={{ color: textFaint }}>
              {s.label}
            </div>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: textFaint }}
          />
          <Input
            placeholder="ابحث بالبريد، الاسم، IP، البلد..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-10"
            style={{ background: cardBg, border: `1px solid ${cardBorder}`, color: textPrimary }}
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-[180px]" style={{ background: cardBg, border: `1px solid ${cardBorder}`, color: textPrimary }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأحداث</SelectItem>
            <SelectItem value="login_success">دخول ناجح</SelectItem>
            <SelectItem value="login_failed">فشل دخول</SelectItem>
            <SelectItem value="logout">خروج</SelectItem>
            <SelectItem value="password_changed">تغيير كلمة المرور</SelectItem>
            <SelectItem value="user_updated">تحديث الحساب</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterRisk} onValueChange={setFilterRisk}>
          <SelectTrigger className="w-full sm:w-[180px]" style={{ background: cardBg, border: `1px solid ${cardBorder}`, color: textPrimary }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المخاطر</SelectItem>
            <SelectItem value="suspicious">مشبوهة فقط</SelectItem>
            <SelectItem value="new_device">أجهزة جديدة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {filtered.map((e) => {
          const meta = EVENT_LABELS[e.event_type] || { label: e.event_type, icon: Shield, color: "text-slate-400" };
          const Icon = meta.icon;
          return (
            <div
              key={e.id}
              onClick={() => setSelectedEvent(e)}
              className="rounded-xl p-3 cursor-pointer"
              style={{
                background: cardBg,
                border: `1px solid ${e.is_suspicious ? "rgb(239,68,68,0.4)" : cardBorder}`,
              }}
            >
              <div className="flex items-start justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${meta.color}`} />
                  <span className="text-sm font-medium" style={{ color: textPrimary }}>
                    {meta.label}
                  </span>
                </div>
                {e.is_suspicious && (
                  <Badge variant="destructive" className="text-[10px] h-5">
                    مشبوه
                  </Badge>
                )}
                {e.is_new_device && !e.is_suspicious && (
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] h-5">
                    جهاز جديد
                  </Badge>
                )}
              </div>
              <div className="text-xs mb-1" style={{ color: textSecondary }}>
                {e.user_email || e.user_name || e.user_id.slice(0, 8)}
              </div>
              <div className="flex items-center justify-between text-[10px]" style={{ color: textFaint }}>
                <span className="font-mono">
                  {e.ip_address} · {e.country || "?"}
                </span>
                <span>{formatDistanceToNow(new Date(e.created_at), { addSuffix: true, locale: ar })}</span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && !loading && (
          <p className="text-center py-8 text-sm" style={{ color: textFaint }}>
            لا توجد سجلات
          </p>
        )}
      </div>

      {/* Desktop table */}
      <div
        className="hidden md:block rounded-2xl overflow-hidden"
        style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: `1px solid ${divider}` }}>
                {["الوقت", "المستخدم", "الحدث", "الجهاز", "الموقع", "IP", "المخاطر", ""].map((h) => (
                  <th
                    key={h}
                    className="text-right font-medium px-3 py-3 text-xs"
                    style={{ color: textMuted }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const meta = EVENT_LABELS[e.event_type] || {
                  label: e.event_type,
                  icon: Shield,
                  color: "text-slate-400",
                };
                const Icon = meta.icon;
                const DeviceIcon =
                  DEVICE_ICONS[(e.device_type as keyof typeof DEVICE_ICONS) || "desktop"] || Monitor;
                return (
                  <tr
                    key={e.id}
                    style={{ borderBottom: `1px solid ${divider}` }}
                    onMouseEnter={(ev) => (ev.currentTarget.style.background = cardHover)}
                    onMouseLeave={(ev) => (ev.currentTarget.style.background = "")}
                  >
                    <td
                      className="px-3 py-3 tabular-nums text-xs font-mono whitespace-nowrap"
                      style={{ color: textMuted }}
                    >
                      {format(new Date(e.created_at), "dd/MM HH:mm:ss")}
                    </td>
                    <td className="px-3 py-3 max-w-[200px]">
                      <div className="text-xs font-medium truncate" style={{ color: textPrimary }}>
                        {e.user_name || "—"}
                      </div>
                      <div className="text-[10px] truncate" style={{ color: textFaint }}>
                        {e.user_email}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <Icon className={`h-3.5 w-3.5 ${meta.color}`} />
                        <span className="text-xs" style={{ color: textSecondary }}>
                          {meta.label}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5">
                        <DeviceIcon className="h-3.5 w-3.5" style={{ color: textFaint }} />
                        <span className="text-xs" style={{ color: textMuted }}>
                          {e.browser || "?"} · {e.os || "?"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 text-xs" style={{ color: textMuted }}>
                        <MapPin className="h-3 w-3" />
                        {e.city || e.country || "—"}
                      </div>
                    </td>
                    <td
                      className="px-3 py-3 text-xs font-mono whitespace-nowrap"
                      style={{ color: textFaint }}
                    >
                      {e.ip_address || "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1">
                        {e.is_suspicious && (
                          <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
                            مشبوه
                          </Badge>
                        )}
                        {e.is_new_device && (
                          <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px] h-5 px-1.5">
                            جديد
                          </Badge>
                        )}
                        {!e.is_suspicious && !e.is_new_device && e.event_type === "login_success" && (
                          <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px] h-5 px-1.5">
                            آمن
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedEvent(e)}
                        className="h-7 w-7 p-0"
                        style={{ color: textMuted }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && !loading && (
                <tr>
                  <td colSpan={8} className="text-center py-8" style={{ color: textFaint }}>
                    لا توجد سجلات
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!selectedEvent} onOpenChange={() => setSelectedEvent(null)}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              تفاصيل الحدث الأمني
            </DialogTitle>
          </DialogHeader>
          {selectedEvent && (
            <div className="space-y-3 text-sm">
              {[
                { k: "المستخدم", v: selectedEvent.user_name || "—" },
                { k: "البريد", v: selectedEvent.user_email || "—" },
                { k: "User ID", v: selectedEvent.user_id, mono: true },
                {
                  k: "الحدث",
                  v: EVENT_LABELS[selectedEvent.event_type]?.label || selectedEvent.event_type,
                },
                { k: "طريقة الدخول", v: selectedEvent.auth_method || "—" },
                { k: "IP", v: selectedEvent.ip_address || "—", mono: true },
                {
                  k: "الموقع",
                  v: [selectedEvent.city, selectedEvent.country].filter(Boolean).join(", ") || "—",
                },
                { k: "الجهاز", v: selectedEvent.device_type || "—" },
                { k: "المتصفح", v: selectedEvent.browser || "—" },
                { k: "نظام التشغيل", v: selectedEvent.os || "—" },
                {
                  k: "الوقت",
                  v: format(new Date(selectedEvent.created_at), "yyyy/MM/dd HH:mm:ss"),
                },
                { k: "نقاط المخاطر", v: `${selectedEvent.risk_score} / 100` },
                { k: "User-Agent", v: selectedEvent.user_agent || "—", mono: true, small: true },
              ].map((row) => (
                <div key={row.k} className="flex items-start justify-between gap-3 border-b pb-2">
                  <span className="text-muted-foreground shrink-0">{row.k}</span>
                  <span
                    className={`text-end ${row.mono ? "font-mono" : ""} ${row.small ? "text-[10px]" : ""}`}
                    style={{ wordBreak: "break-all" }}
                  >
                    {row.v}
                  </span>
                </div>
              ))}
              {selectedEvent.metadata && Object.keys(selectedEvent.metadata).length > 0 && (
                <div>
                  <div className="text-muted-foreground mb-1">بيانات إضافية</div>
                  <pre className="bg-muted/50 rounded p-2 text-[10px] font-mono overflow-auto max-h-[200px]">
                    {JSON.stringify(selectedEvent.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
