import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Crown, Users, ShoppingCart, DollarSign, Activity, Shield, Clock,
  Lock, Unlock, Trash2, KeyRound, Eye, RefreshCw, AlertTriangle,
  ChevronLeft, ChevronRight, Search, X, LogOut, Database, FileText, ChevronDown,
  TrendingUp, Wifi, Download, Table2, Play, Pause, Settings, Package,
  Zap, Server, Bell, HardDrive, CreditCard, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, CalendarDays,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import * as XLSX from "xlsx";

type DashboardStats = {
  total_users: number;
  new_users_today: number;
  total_accounts: number;
  total_contacts: number;
  active_sessions: number;
  active_sessions_revenue: number;
  today_revenue: number;
  today_transactions: number;
};

type AuditLog = {
  id: string;
  admin_user_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: any;
  ip_address: string | null;
  created_at: string;
};

type UserRecord = {
  user_id: string;
  display_name: string;
  email?: string;
  phone?: string;
  last_sign_in?: string;
  is_banned?: boolean;
  roles: string[];
  created_at: string;
  company_name?: string;
  business_type?: string;
  invited_by?: string | null;
  company_id?: string | null;
};

type LiveEvent = {
  id: string;
  time: string;
  user: string;
  action: string;
  details?: string;
  type: "transaction" | "auth" | "system" | "pos";
};

const API_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/super-admin-api`;

const ALLOWED_TABLES = [
  { key: "profiles", label: "المستخدمون", icon: "👥" },
  { key: "accounts", label: "الحسابات", icon: "📊" },
  { key: "transactions", label: "المعاملات", icon: "💰" },
  { key: "contacts", label: "جهات الاتصال", icon: "📇" },
  { key: "employees", label: "الموظفون", icon: "👷" },
  { key: "pos_sessions", label: "ورديات POS", icon: "🕐" },
  { key: "pos_orders", label: "طلبات POS", icon: "🛒" },
  { key: "cheques", label: "الشيكات", icon: "📝" },
  { key: "currencies", label: "العملات", icon: "💱" },
  { key: "branches", label: "الفروع", icon: "🏢" },
  { key: "user_roles", label: "الأدوار", icon: "🔑" },
  { key: "products", label: "المنتجات", icon: "📦" },
  { key: "invoices", label: "الفواتير", icon: "🧾" },
  { key: "employee_payroll", label: "الرواتب", icon: "💳" },
];

async function apiCall(action: string, params?: Record<string, string>, body?: any) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("غير مسجل الدخول");

  const url = new URL(API_BASE);
  url.searchParams.set("action", action);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "خطأ غير متوقع");
  return data;
}

// ─── Password Confirmation Dialog ───
function PasswordConfirmDialog({
  open, onClose, onConfirmed, title,
}: { open: boolean; onClose: () => void; onConfirmed: () => void; title: string }) {
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await apiCall("verify_password", undefined, { password });
      if (res.verified) {
        onConfirmed();
        onClose();
      } else {
        toast.error("كلمة المرور غير صحيحة");
      }
    } catch {
      toast.error("فشل التحقق");
    }
    setVerifying(false);
    setPassword("");
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-[#0f1524] border-white/10 text-white" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-400" />
            تأكيد الهوية — {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm text-white/50">أدخل كلمة المرور الخاصة بك لتأكيد هذا الإجراء</p>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            placeholder="كلمة المرور"
            className="bg-white/5 border-white/10 text-white"
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} className="text-white/50">إلغاء</Button>
          <Button onClick={handleVerify} disabled={!password || verifying} className="bg-amber-500 hover:bg-amber-600 text-black">
            {verifying ? "جاري التحقق..." : "تأكيد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── KPI Card ───
function KPICard({ icon: Icon, label, value, sub, color, accentColor }: {
  icon: any; label: string; value: string | number; sub?: string; color: string; accentColor?: string;
}) {
  return (
    <div
      className="rounded-xl p-5 space-y-3 transition-all duration-150 hover:shadow-medium"
      style={{
        background: "linear-gradient(135deg, #0A2342 0%, #0D3158 100%)",
        borderRight: `4px solid ${accentColor || "#00B4D8"}`,
        boxShadow: "0 4px 16px rgba(10,35,66,0.14)",
      }}
    >
      <div className="flex items-center gap-3">
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-white/50 text-sm" style={{ fontFamily: "Tajawal, sans-serif" }}>{label}</span>
      </div>
      <div className="text-[32px] font-bold text-white font-mono tabular-nums" style={{ fontFamily: "JetBrains Mono, monospace" }}>{value}</div>
      {sub && <p className="text-[13px]" style={{ color: "#8B9BB4", fontFamily: "Tajawal, sans-serif" }}>{sub}</p>}
    </div>
  );
}

// ─── Database Browser Component ───
function DatabaseBrowser() {
  const [selectedTable, setSelectedTable] = useState("profiles");
  const [tableData, setTableData] = useState<any[]>([]);
  const [tablePage, setTablePage] = useState(0);
  const [tableTotal, setTableTotal] = useState(0);
  const [loadingTable, setLoadingTable] = useState(false);
  const [tableSearch, setTableSearch] = useState("");

  const loadTableData = useCallback(async (table: string, page = 0) => {
    setLoadingTable(true);
    try {
      const res = await apiCall("table_data", { table, page: String(page) });
      setTableData(res.data || []);
      setTableTotal(res.total || 0);
      setTablePage(page);
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoadingTable(false);
  }, []);

  useEffect(() => {
    loadTableData(selectedTable, 0);
  }, [selectedTable, loadTableData]);

  const columns = tableData.length > 0 ? Object.keys(tableData[0]) : [];
  
  const filteredData = tableSearch
    ? tableData.filter((row) =>
        Object.values(row).some((v) =>
          String(v ?? "").toLowerCase().includes(tableSearch.toLowerCase())
        )
      )
    : tableData;

  const exportToExcel = () => {
    if (tableData.length === 0) return;
    const ws = XLSX.utils.json_to_sheet(tableData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, selectedTable);
    XLSX.writeFile(wb, `${selectedTable}_export.xlsx`);
    toast.success("تم التصدير بنجاح");
  };

  const tableInfo = ALLOWED_TABLES.find((t) => t.key === selectedTable);

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Sidebar - Table List */}
        <div className="w-full lg:w-56 shrink-0 space-y-1">
          <p className="text-xs text-white/30 font-medium px-2 mb-2">📋 الجداول</p>
          {ALLOWED_TABLES.map((t) => (
            <button
              key={t.key}
              onClick={() => { setSelectedTable(t.key); setTableSearch(""); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-right ${
                selectedTable === t.key
                  ? "bg-amber-500/20 text-amber-400 font-medium"
                  : "text-white/40 hover:bg-white/5 hover:text-white/60"
              }`}
            >
              <span>{t.icon}</span>
              <span>{t.label}</span>
              {selectedTable === t.key && tableTotal > 0 && (
                <Badge className="mr-auto bg-amber-500/10 text-amber-400 border-0 text-[10px]">{tableTotal}</Badge>
              )}
            </button>
          ))}
        </div>

        {/* Main - Data Table */}
        <div className="flex-1 min-w-0 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Table2 className="h-5 w-5 text-amber-400" />
              {tableInfo?.icon} {tableInfo?.label}
              <Badge className="bg-white/5 text-white/30 border-0 text-xs">{tableTotal} سجل</Badge>
            </h3>
            <div className="mr-auto flex items-center gap-2">
              <div className="relative">
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
                <Input
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="بحث في البيانات..."
                  className="pr-8 h-8 text-xs w-48 bg-white/[0.03] border-white/[0.06] text-white placeholder:text-white/20"
                />
              </div>
              <Button size="sm" variant="ghost" onClick={exportToExcel} className="text-white/40 h-8" title="تصدير Excel">
                <Download className="h-3.5 w-3.5 ml-1" /> تصدير
              </Button>
              <Button size="sm" variant="ghost" onClick={() => loadTableData(selectedTable, tablePage)} disabled={loadingTable} className="text-white/40 h-8">
                <RefreshCw className={`h-3.5 w-3.5 ${loadingTable ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-[#0a1020]">
                  <tr className="border-b border-white/[0.06]">
                    {columns.map((col) => (
                      <th key={col} className="text-right text-white/30 font-medium px-3 py-2.5 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/[0.04]">
                  {loadingTable ? (
                    <tr>
                      <td colSpan={columns.length || 1} className="text-center py-12 text-white/20">
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-amber-400" />
                        جاري التحميل...
                      </td>
                    </tr>
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length || 1} className="text-center py-12 text-white/20">لا توجد بيانات</td>
                    </tr>
                  ) : (
                    filteredData.map((row, i) => (
                      <tr key={i} className="hover:bg-white/[0.02]">
                        {columns.map((col) => (
                          <td key={col} className="px-3 py-2 text-white/50 max-w-[200px] truncate whitespace-nowrap" title={String(row[col] ?? "")}>
                            {row[col] === null ? <span className="text-white/15 italic">null</span> :
                             typeof row[col] === "object" ? <span className="text-amber-400/50 font-mono">{JSON.stringify(row[col]).substring(0, 50)}</span> :
                             typeof row[col] === "boolean" ? (
                              <Badge className={`text-[9px] ${row[col] ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"} border-0`}>
                                {row[col] ? "true" : "false"}
                              </Badge>
                             ) : String(row[col])}
                          </td>
                        ))}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {tableTotal > 50 && (
              <div className="px-4 py-2.5 border-t border-white/[0.06] flex items-center justify-between">
                <span className="text-[11px] text-white/20">
                  صفحة {tablePage + 1} من {Math.ceil(tableTotal / 50)}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" disabled={tablePage === 0} onClick={() => loadTableData(selectedTable, tablePage - 1)} className="text-white/40 h-7">
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" disabled={(tablePage + 1) * 50 >= tableTotal} onClick={() => loadTableData(selectedTable, tablePage + 1)} className="text-white/40 h-7">
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Live Monitor Component ───
function LiveMonitor() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const eventsRef = useRef<LiveEvent[]>([]);
  const pausedRef = useRef(false);

  useEffect(() => {
    pausedRef.current = isPaused;
  }, [isPaused]);

  useEffect(() => {
    // Subscribe to realtime changes on key tables
    const channel = supabase
      .channel("super-admin-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, (payload) => {
        if (pausedRef.current) return;
        const t = payload.new as any;
        const ev: LiveEvent = {
          id: t.id,
          time: new Date().toISOString(),
          user: t.user_id?.substring(0, 8) || "—",
          action: `معاملة ${t.transaction_type || "جديدة"}`,
          details: t.amount ? `₪${Number(t.amount).toLocaleString()}` : undefined,
          type: "transaction",
        };
        eventsRef.current = [ev, ...eventsRef.current].slice(0, 100);
        setEvents([...eventsRef.current]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pos_sessions" }, (payload) => {
        if (pausedRef.current) return;
        const s = payload.new as any;
        const ev: LiveEvent = {
          id: s.id,
          time: new Date().toISOString(),
          user: s.user_id?.substring(0, 8) || "—",
          action: "فتح وردية جديدة",
          type: "pos",
        };
        eventsRef.current = [ev, ...eventsRef.current].slice(0, 100);
        setEvents([...eventsRef.current]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pos_sessions" }, (payload) => {
        if (pausedRef.current) return;
        const s = payload.new as any;
        if (s.status === "closed") {
          const ev: LiveEvent = {
            id: s.id + "-close",
            time: new Date().toISOString(),
            user: s.user_id?.substring(0, 8) || "—",
            action: "إغلاق وردية",
            details: s.total_sales ? `₪${Number(s.total_sales).toLocaleString()}` : undefined,
            type: "pos",
          };
          eventsRef.current = [ev, ...eventsRef.current].slice(0, 100);
          setEvents([...eventsRef.current]);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pos_orders" }, (payload) => {
        if (pausedRef.current) return;
        const o = payload.new as any;
        const ev: LiveEvent = {
          id: o.id,
          time: new Date().toISOString(),
          user: o.user_id?.substring(0, 8) || "—",
          action: "طلب POS جديد",
          details: o.total_amount ? `₪${Number(o.total_amount).toLocaleString()}` : undefined,
          type: "pos",
        };
        eventsRef.current = [ev, ...eventsRef.current].slice(0, 100);
        setEvents([...eventsRef.current]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "super_admin_audit_logs" }, (payload) => {
        if (pausedRef.current) return;
        const l = payload.new as any;
        const ev: LiveEvent = {
          id: l.id,
          time: new Date().toISOString(),
          user: "Super Admin",
          action: l.action,
          type: "system",
        };
        eventsRef.current = [ev, ...eventsRef.current].slice(0, 100);
        setEvents([...eventsRef.current]);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredEvents = filter
    ? events.filter((e) => e.action.includes(filter) || e.user.includes(filter) || e.details?.includes(filter))
    : events;

  const typeColors: Record<string, string> = {
    transaction: "bg-emerald-500/20 text-emerald-400",
    auth: "bg-blue-500/20 text-blue-400",
    system: "bg-amber-500/20 text-amber-400",
    pos: "bg-purple-500/20 text-purple-400",
  };

  const typeIcons: Record<string, string> = {
    transaction: "💰",
    auth: "🔐",
    system: "⚙️",
    pos: "🛒",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full ${isPaused ? "bg-yellow-500/10 border border-yellow-500/20" : "bg-red-500/10 border border-red-500/20"}`}>
            <div className={`w-2 h-2 rounded-full ${isPaused ? "bg-yellow-400" : "bg-red-400 animate-pulse"}`} />
            <span className={`text-[11px] font-medium ${isPaused ? "text-yellow-400" : "text-red-400"}`}>
              {isPaused ? "متوقف" : "LIVE"}
            </span>
          </div>
          مراقبة النشاط
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="فلتر..."
              className="pr-8 h-8 text-xs w-40 bg-white/[0.03] border-white/[0.06] text-white placeholder:text-white/20"
            />
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setIsPaused(!isPaused)}
            className={`h-8 ${isPaused ? "text-yellow-400" : "text-white/40"}`}
          >
            {isPaused ? <Play className="h-3.5 w-3.5 ml-1" /> : <Pause className="h-3.5 w-3.5 ml-1" />}
            {isPaused ? "استئناف" : "إيقاف"}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
        <div className="divide-y divide-white/[0.04] max-h-[600px] overflow-y-auto">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Activity className="h-8 w-8 text-white/10 mx-auto" />
              <p className="text-sm text-white/20">في انتظار النشاط...</p>
              <p className="text-[11px] text-white/10">ستظهر الأحداث هنا فور حدوثها في الوقت الفعلي</p>
            </div>
          ) : (
            filteredEvents.map((ev) => (
              <div key={ev.id} className="px-4 py-3 flex items-center gap-3 hover:bg-white/[0.02] transition-colors">
                <span className="text-lg shrink-0">{typeIcons[ev.type]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-white/70">{ev.action}</span>
                    {ev.details && (
                      <Badge className={`text-[10px] border-0 ${typeColors[ev.type]}`}>{ev.details}</Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-white/25 font-mono">{ev.user}</p>
                </div>
                <span className="text-[11px] text-white/20 tabular-nums font-mono shrink-0">
                  {format(new Date(ev.time), "HH:mm:ss")}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Subscriptions Manager Component ───
function SubscriptionsManager() {
  const [subs, setSubs] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editSub, setEditSub] = useState<any | null>(null);
  const [editPlanId, setEditPlanId] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editBilling, setEditBilling] = useState("");

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    const [subsRes, plansRes] = await Promise.all([
      apiCall("subscriptions"),
      supabase.from("plans").select("*").order("display_order"),
    ]);
    setSubs(subsRes.subscriptions || []);
    setPlans(plansRes.data || []);
    setLoading(false);
  };

  const statusLabel: Record<string, { text: string; cls: string }> = {
    trial: { text: "تجريبي", cls: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
    active: { text: "نشط", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    expired: { text: "منتهي", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
    cancelled: { text: "ملغي", cls: "bg-white/5 text-white/30 border-white/10" },
    suspended: { text: "موقوف", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  };

  const openEdit = (sub: any) => {
    setEditSub(sub);
    setEditPlanId(sub.plan_id);
    setEditStatus(sub.status);
    setEditBilling(sub.billing_cycle);
  };

  const saveEdit = async () => {
    if (!editSub) return;
    try {
      await apiCall("update_subscription", undefined, {
        subscription_id: editSub.id,
        plan_id: editPlanId,
        status: editStatus,
        billing_cycle: editBilling,
      });
      toast.success("تم تحديث الاشتراك");
      setEditSub(null);
      loadData();
    } catch (e: any) { toast.error(e.message); }
  };

  const filtered = subs.filter((s) =>
    !search || s.display_name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase())
  );

  // Stats
  const trialCount = subs.filter(s => s.status === "trial").length;
  const activeCount = subs.filter(s => s.status === "active").length;
  const expiredCount = subs.filter(s => s.status === "expired").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-amber-400" /> إدارة الاشتراكات
        </h2>
        <Button variant="ghost" size="sm" onClick={loadData} disabled={loading} className="text-white/40">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl bg-blue-500/5 border border-blue-500/10 p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{trialCount}</p>
          <p className="text-xs text-white/30">تجريبي</p>
        </div>
        <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/10 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{activeCount}</p>
          <p className="text-xs text-white/30">نشط</p>
        </div>
        <div className="rounded-2xl bg-red-500/5 border border-red-500/10 p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{expiredCount}</p>
          <p className="text-xs text-white/30">منتهي</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو الإيميل..."
          className="pr-10 bg-white/[0.03] border-white/[0.06] text-white placeholder:text-white/20"
        />
      </div>

      {/* Table */}
      <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-right text-white/30 font-medium px-4 py-3">المستخدم</th>
                <th className="text-right text-white/30 font-medium px-4 py-3">الباقة</th>
                <th className="text-right text-white/30 font-medium px-4 py-3">الدورة</th>
                <th className="text-right text-white/30 font-medium px-4 py-3">الحالة</th>
                <th className="text-right text-white/30 font-medium px-4 py-3">انتهاء الفترة</th>
                <th className="text-center text-white/30 font-medium px-4 py-3">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {filtered.map((sub) => {
                const st = statusLabel[sub.status] || statusLabel.trial;
                return (
                  <tr key={sub.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3">
                      <div>
                        <p className="text-white/80 font-medium text-sm">{sub.display_name}</p>
                        <p className="text-white/25 text-xs font-mono">{sub.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px] border-white/10 text-white/60">
                        {sub.plans?.name || "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-white/40 text-xs">
                      {sub.billing_cycle === "annual" ? "سنوي" : "شهري"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${st.cls}`}>{st.text}</Badge>
                    </td>
                    <td className="px-4 py-3 text-white/30 text-xs tabular-nums">
                      {sub.current_period_end ? format(new Date(sub.current_period_end), "dd/MM/yyyy") : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(sub)} className="text-amber-400 hover:bg-amber-500/10 text-xs h-7">
                        ✏️ تعديل
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-white/20">لا توجد اشتراكات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Edit Dialog */}
      {editSub && (
        <Dialog open={!!editSub} onOpenChange={() => setEditSub(null)}>
          <DialogContent className="bg-[#0f1629] border-white/10 text-white" dir="rtl">
            <DialogHeader>
              <DialogTitle className="text-white">تعديل اشتراك {editSub.display_name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-white/40 block mb-1">الباقة</label>
                <select value={editPlanId} onChange={e => setEditPlanId(e.target.value)} className="w-full h-10 rounded-md bg-white/5 border border-white/10 text-white px-3 text-sm">
                  {plans.map(p => (
                    <option key={p.id} value={p.id} className="bg-[#0f1629]">{p.name} (₪{p.monthly_price}/شهر)</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">الحالة</label>
                <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="w-full h-10 rounded-md bg-white/5 border border-white/10 text-white px-3 text-sm">
                  <option value="trial" className="bg-[#0f1629]">تجريبي</option>
                  <option value="active" className="bg-[#0f1629]">نشط</option>
                  <option value="expired" className="bg-[#0f1629]">منتهي</option>
                  <option value="cancelled" className="bg-[#0f1629]">ملغي</option>
                  <option value="suspended" className="bg-[#0f1629]">موقوف</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-white/40 block mb-1">دورة الفوترة</label>
                <select value={editBilling} onChange={e => setEditBilling(e.target.value)} className="w-full h-10 rounded-md bg-white/5 border border-white/10 text-white px-3 text-sm">
                  <option value="monthly" className="bg-[#0f1629]">شهري</option>
                  <option value="annual" className="bg-[#0f1629]">سنوي</option>
                </select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditSub(null)} className="text-white/40">إلغاء</Button>
              <Button onClick={saveEdit} className="bg-amber-500 hover:bg-amber-600 text-black">حفظ</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}


function PlatformSettings() {
  const [settingsTab, setSettingsTab] = useState("plans");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [dbPlans, setDbPlans] = useState<any[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
  const [editPrice, setEditPrice] = useState("");
  const [editDiscount, setEditDiscount] = useState("");
  const [editMaxUsers, setEditMaxUsers] = useState("");
  const [editMaxCompanies, setEditMaxCompanies] = useState("");

  useEffect(() => { loadPlans(); }, []);

  const loadPlans = async () => {
    setLoadingPlans(true);
    const { data } = await supabase.from("plans").select("*").order("display_order");
    if (data) setDbPlans(data);
    setLoadingPlans(false);
  };

  const openEditPlan = (plan: any) => {
    setEditingPlan(plan);
    setEditPrice(String(plan.monthly_price));
    setEditDiscount(String(plan.annual_discount_pct));
    setEditMaxUsers(String(plan.max_users));
    setEditMaxCompanies(String(plan.max_companies));
  };

  const savePlan = async () => {
    if (!editingPlan) return;
    const { error } = await supabase.from("plans").update({
      monthly_price: Number(editPrice),
      annual_discount_pct: Number(editDiscount),
      max_users: Number(editMaxUsers),
      max_companies: Number(editMaxCompanies),
    }).eq("id", editingPlan.id);
    if (error) { toast.error("فشل التحديث: " + error.message); return; }
    toast.success(`تم تحديث ${editingPlan.name}`);
    setEditingPlan(null);
    loadPlans();
  };

  const togglePlanActive = async (plan: any) => {
    await supabase.from("plans").update({ is_active: !plan.is_active }).eq("id", plan.id);
    toast.success(plan.is_active ? `تم تعطيل ${plan.name}` : `تم تفعيل ${plan.name}`);
    loadPlans();
  };

  const currencies = [
    { code: "USD", name: "دولار أمريكي", flag: "🇺🇸", rate: 3.65, auto: true },
    { code: "JOD", name: "دينار أردني", flag: "🇯🇴", rate: 5.15, auto: true },
    { code: "EUR", name: "يورو", flag: "🇪🇺", rate: 4.05, auto: true },
    { code: "EGP", name: "جنيه مصري", flag: "🇪🇬", rate: 0.075, auto: false },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-white flex items-center gap-2">
        <Settings className="h-5 w-5 text-amber-400" /> إعدادات المنصة
      </h2>

      {/* Sub-tabs */}
      <div className="flex gap-2 flex-wrap">
        {[
          { key: "plans", label: "الباقات", icon: Package },
          { key: "rates", label: "أسعار الصرف", icon: DollarSign },
          { key: "notifications", label: "الإشعارات", icon: Bell },
          { key: "maintenance", label: "الصيانة", icon: Server },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setSettingsTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors ${
              settingsTab === t.key
                ? "bg-amber-500/20 text-amber-400 font-medium"
                : "bg-white/[0.03] text-white/40 hover:bg-white/[0.06] hover:text-white/60"
            }`}
          >
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Plans */}
      {settingsTab === "plans" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-white/40">إدارة الباقات والأسعار</p>
            <Button variant="ghost" size="sm" onClick={loadPlans} disabled={loadingPlans} className="text-white/40">
              <RefreshCw className={`h-4 w-4 ${loadingPlans ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {dbPlans.map((plan) => (
              <div key={plan.id} className={`rounded-2xl bg-white/[0.03] border ${plan.plan_key === "growth" ? "border-emerald-500/40" : "border-white/[0.06]"} p-6 space-y-4 relative ${!plan.is_active ? "opacity-50" : ""}`}>
                {plan.plan_key === "growth" && (
                  <div className="absolute -top-3 right-4">
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">
                      ⭐ الأكثر اختياراً
                    </Badge>
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold text-white">{plan.name}</h3>
                  <p className="text-xs text-white/25">{plan.name_ar}</p>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-bold text-white">₪{plan.monthly_price}</span>
                    <span className="text-sm text-white/30">/شهر</span>
                  </div>
                  <p className="text-xs text-white/30 mt-1">₪{Math.round(plan.monthly_price * 12 * (1 - plan.annual_discount_pct / 100))} سنوياً (خصم {plan.annual_discount_pct}%)</p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">المستخدمون</span>
                    <span className="text-white/70">{plan.max_users === -1 ? "غير محدود" : plan.max_users}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-white/40">الشركات</span>
                    <span className="text-white/70">{plan.max_companies === -1 ? "غير محدود" : plan.max_companies}</span>
                  </div>
                </div>
                <div className="border-t border-white/[0.06] pt-3 space-y-1.5">
                  {((plan.features as any[]) || []).map((f: string) => (
                    <p key={f} className="text-xs text-white/40 flex items-center gap-1.5">
                      <span className="text-emerald-400">✓</span> {f}
                    </p>
                  ))}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" className="flex-1 bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 text-xs" onClick={() => openEditPlan(plan)}>
                    ✏️ تعديل
                  </Button>
                  <Button size="sm" variant="ghost" className={`text-xs ${plan.is_active ? "text-red-400 hover:bg-red-500/10" : "text-emerald-400 hover:bg-emerald-500/10"}`} onClick={() => togglePlanActive(plan)}>
                    {plan.is_active ? "تعطيل" : "تفعيل"}
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Edit Plan Dialog */}
          {editingPlan && (
            <Dialog open={!!editingPlan} onOpenChange={() => setEditingPlan(null)}>
              <DialogContent className="bg-[#0f1629] border-white/10 text-white">
                <DialogHeader>
                  <DialogTitle className="text-white">تعديل باقة {editingPlan.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <label className="text-xs text-white/40 block mb-1">السعر الشهري (₪)</label>
                    <Input value={editPrice} onChange={e => setEditPrice(e.target.value)} className="bg-white/5 border-white/10 text-white" type="number" />
                  </div>
                  <div>
                    <label className="text-xs text-white/40 block mb-1">نسبة خصم السنوي (%)</label>
                    <Input value={editDiscount} onChange={e => setEditDiscount(e.target.value)} className="bg-white/5 border-white/10 text-white" type="number" />
                  </div>
                  <div>
                    <label className="text-xs text-white/40 block mb-1">عدد المستخدمين (-1 = غير محدود)</label>
                    <Input value={editMaxUsers} onChange={e => setEditMaxUsers(e.target.value)} className="bg-white/5 border-white/10 text-white" type="number" />
                  </div>
                  <div>
                    <label className="text-xs text-white/40 block mb-1">عدد الشركات (-1 = غير محدود)</label>
                    <Input value={editMaxCompanies} onChange={e => setEditMaxCompanies(e.target.value)} className="bg-white/5 border-white/10 text-white" type="number" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setEditingPlan(null)} className="text-white/40">إلغاء</Button>
                  <Button onClick={savePlan} className="bg-amber-500 hover:bg-amber-600 text-black">حفظ التعديلات</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {/* Exchange Rates */}
      {settingsTab === "rates" && (
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
          <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              💱 أسعار الصرف مقابل الشيكل
            </h3>
            <Button size="sm" variant="ghost" className="text-amber-400 h-7 text-xs">
              <RefreshCw className="h-3 w-3 ml-1" /> تحديث من API
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/[0.06]">
                <th className="text-right text-white/30 font-medium px-5 py-3">العملة</th>
                <th className="text-right text-white/30 font-medium px-5 py-3">السعر (₪)</th>
                <th className="text-right text-white/30 font-medium px-5 py-3">تحديث تلقائي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {currencies.map((c) => (
                <tr key={c.code} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-3">
                    <span className="text-lg ml-2">{c.flag}</span>
                    <span className="text-white/70 font-medium">{c.name}</span>
                    <span className="text-white/20 text-xs mr-2">({c.code})</span>
                  </td>
                  <td className="px-5 py-3">
                    <Input
                      defaultValue={c.rate}
                      className="w-24 h-8 text-xs bg-white/5 border-white/10 text-white inline-block"
                    />
                  </td>
                  <td className="px-5 py-3">
                    <Badge className={`text-[10px] border-0 ${c.auto ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-white/30"}`}>
                      {c.auto ? "☑ مفعّل" : "☐ يدوي"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Notifications */}
      {settingsTab === "notifications" && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5 space-y-4">
            <h3 className="text-sm font-semibold text-white flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-400" /> إعدادات التنبيهات
            </h3>
            {[
              { label: "تسجيل مستخدم جديد", desc: "تنبيه عند إنشاء حساب جديد", enabled: true },
              { label: "محاولة دخول فاشلة (3+)", desc: "تنبيه عند فشل تسجيل الدخول متكرر", enabled: true },
              { label: "انتهاء اشتراك", desc: "تنبيه قبل 7 أيام من انتهاء الباقة", enabled: true },
              { label: "إغلاق وردية بمبلغ عالي", desc: "تنبيه عند إغلاق وردية تتجاوز ₪10,000", enabled: false },
              { label: "حذف بيانات", desc: "تنبيه عند حذف سجلات مهمة", enabled: true },
            ].map((notif) => (
              <div key={notif.label} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                <div>
                  <p className="text-sm text-white/70">{notif.label}</p>
                  <p className="text-[11px] text-white/25">{notif.desc}</p>
                </div>
                <Badge className={`text-[10px] border-0 cursor-pointer ${notif.enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-white/5 text-white/30"}`}>
                  {notif.enabled ? "مفعّل" : "معطّل"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Maintenance */}
      {settingsTab === "maintenance" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Maintenance Mode */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Server className="h-4 w-4 text-amber-400" /> وضع الصيانة
              </h3>
              <p className="text-xs text-white/30">عند التفعيل، سيظهر للمستخدمين رسالة "النظام تحت الصيانة"</p>
              <Button
                onClick={() => {
                  setMaintenanceMode(!maintenanceMode);
                  toast.success(maintenanceMode ? "تم إلغاء وضع الصيانة" : "تم تفعيل وضع الصيانة");
                }}
                className={`w-full ${maintenanceMode ? "bg-red-500 hover:bg-red-600" : "bg-white/5 hover:bg-white/10"} text-white`}
              >
                {maintenanceMode ? "🔴 إيقاف الصيانة" : "⚙️ تفعيل وضع الصيانة"}
              </Button>
            </div>

            {/* Backup */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5 space-y-4">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <HardDrive className="h-4 w-4 text-amber-400" /> النسخ الاحتياطي
              </h3>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">آخر نسخة</span>
                  <span className="text-white/50 text-xs">منذ ساعتين</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">الحجم الكلي</span>
                  <span className="text-white/50 text-xs">~45 MB</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">تكرار تلقائي</span>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[10px]">كل 6 ساعات</Badge>
                </div>
              </div>
              <Button className="w-full bg-white/5 hover:bg-white/10 text-white" onClick={() => toast.success("جاري إنشاء نسخة احتياطية...")}>
                <HardDrive className="h-4 w-4 ml-1" /> نسخة احتياطية الآن
              </Button>
            </div>

            {/* System Info */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5 space-y-4 md:col-span-2">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" /> معلومات النظام
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: "الإصدار", value: "v2.4.0" },
                  { label: "قاعدة البيانات", value: "PostgreSQL 15" },
                  { label: "المنطقة", value: "EU Central" },
                  { label: "الحالة", value: "🟢 يعمل" },
                ].map((info) => (
                  <div key={info.label} className="space-y-1">
                    <p className="text-[11px] text-white/25">{info.label}</p>
                    <p className="text-sm text-white/60 font-medium">{info.value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ─── Revenue Reports Component ───
function RevenueReports() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadStats(); }, []);

  const loadStats = async () => {
    setLoading(true);
    try {
      const res = await apiCall("revenue_stats");
      setData(res);
    } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-amber-400" />
      </div>
    );
  }

  if (!data) return <p className="text-center text-white/20 py-12">فشل تحميل البيانات</p>;

  const maxBarRevenue = Math.max(...(data.monthly_trend || []).map((m: any) => m.revenue), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-amber-400" /> إحصائيات الإيرادات
        </h2>
        <Button variant="ghost" size="sm" onClick={loadStats} disabled={loading} className="text-white/40">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {/* Main KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 p-5 space-y-2">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-emerald-400" />
            <span className="text-sm text-white/40">MRR</span>
          </div>
          <p className="text-3xl font-bold text-emerald-400">₪{data.mrr?.toLocaleString()}</p>
          <p className="text-[11px] text-white/25">الإيراد الشهري المتكرر</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 p-5 space-y-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-blue-400" />
            <span className="text-sm text-white/40">ARR</span>
          </div>
          <p className="text-3xl font-bold text-blue-400">₪{data.arr?.toLocaleString()}</p>
          <p className="text-[11px] text-white/25">الإيراد السنوي المتكرر</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 p-5 space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-amber-400" />
            <span className="text-sm text-white/40">المشتركون النشطون</span>
          </div>
          <p className="text-3xl font-bold text-amber-400">{data.active_subscribers}</p>
          <p className="text-[11px] text-white/25">من أصل {data.total_subscribers} إجمالي</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-600/5 border border-purple-500/20 p-5 space-y-2">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-purple-400" />
            <span className="text-sm text-white/40">تجريبي</span>
          </div>
          <p className="text-3xl font-bold text-purple-400">{data.trial_subscribers}</p>
          <p className="text-[11px] text-white/25">في فترة تجريبية</p>
        </div>
      </div>

      {/* Secondary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 text-center space-y-1">
          <p className="text-xs text-white/30">شهري / سنوي</p>
          <p className="text-lg font-bold text-white">{data.monthly_count} / {data.annual_count}</p>
        </div>
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 text-center space-y-1">
          <p className="text-xs text-white/30">إلغاءات (30 يوم)</p>
          <p className="text-lg font-bold text-red-400 flex items-center justify-center gap-1">
            <ArrowDownRight className="h-4 w-4" /> {data.recent_cancelled}
          </p>
        </div>
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 text-center space-y-1">
          <p className="text-xs text-white/30">تنتهي قريباً (7 أيام)</p>
          <p className="text-lg font-bold text-amber-400">{data.expiring_soon}</p>
        </div>
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-4 text-center space-y-1">
          <p className="text-xs text-white/30">معدل التحويل</p>
          <p className="text-lg font-bold text-emerald-400 flex items-center justify-center gap-1">
            <ArrowUpRight className="h-4 w-4" />
            {data.total_subscribers > 0 ? Math.round((data.converted_from_trial / data.total_subscribers) * 100) : 0}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend Chart */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-amber-400" /> الاتجاه الشهري (آخر 6 أشهر)
          </h3>
          <div className="space-y-3">
            {(data.monthly_trend || []).map((m: any) => (
              <div key={m.month} className="flex items-center gap-3">
                <span className="text-xs text-white/30 w-16 shrink-0 font-mono">{m.month}</span>
                <div className="flex-1 h-7 bg-white/[0.03] rounded-lg overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500/40 to-amber-400/20 rounded-lg transition-all"
                    style={{ width: `${Math.max((m.revenue / maxBarRevenue) * 100, 2)}%` }}
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white/50">
                    ₪{m.revenue.toLocaleString()} · {m.count} مشترك
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Revenue by Plan */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5 space-y-4">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <PieChart className="h-4 w-4 text-amber-400" /> الإيرادات حسب الباقة
          </h3>
          {(data.revenue_by_plan || []).length === 0 ? (
            <p className="text-sm text-white/20 text-center py-6">لا توجد بيانات بعد</p>
          ) : (
            <div className="space-y-4">
              {(data.revenue_by_plan || []).map((p: any, i: number) => {
                const colors = ["from-emerald-500 to-emerald-400", "from-blue-500 to-blue-400", "from-purple-500 to-purple-400"];
                const bgColors = ["bg-emerald-500/10 text-emerald-400", "bg-blue-500/10 text-blue-400", "bg-purple-500/10 text-purple-400"];
                return (
                  <div key={p.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full bg-gradient-to-r ${colors[i % 3]}`} />
                        <span className="text-sm text-white/70 font-medium">{p.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={`text-[10px] border-0 ${bgColors[i % 3]}`}>{p.count} مشترك</Badge>
                        <span className="text-sm text-white/50 font-mono">₪{p.revenue.toLocaleString()}/شهر</span>
                      </div>
                    </div>
                    <div className="h-2 bg-white/[0.03] rounded-full overflow-hidden">
                      <div
                        className={`h-full bg-gradient-to-r ${colors[i % 3]} rounded-full opacity-60`}
                        style={{ width: `${data.mrr > 0 ? (p.revenue / data.mrr) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="pt-3 border-t border-white/[0.06]">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-white/40">إجمالي MRR</span>
                  <span className="text-lg font-bold text-white">₪{data.mrr?.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Status Distribution */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5 space-y-4 lg:col-span-2">
          <h3 className="text-sm font-semibold text-white flex items-center gap-2">
            <Activity className="h-4 w-4 text-amber-400" /> توزيع حالات الاشتراكات
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(data.status_breakdown || {}).map(([status, count]) => {
              const styles: Record<string, { bg: string; text: string; label: string }> = {
                trial: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400", label: "تجريبي" },
                active: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400", label: "نشط" },
                expired: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400", label: "منتهي" },
                cancelled: { bg: "bg-white/5 border-white/10", text: "text-white/40", label: "ملغي" },
                suspended: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400", label: "موقوف" },
              };
              const s = styles[status] || styles.cancelled;
              return (
                <div key={status} className={`rounded-xl border p-4 text-center ${s.bg}`}>
                  <p className={`text-2xl font-bold ${s.text}`}>{count as number}</p>
                  <p className="text-xs text-white/30 mt-1">{s.label}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───
export default function SuperAdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState("dashboard");

  // Dashboard state
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<AuditLog[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  // Users state
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Audit state
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditPage, setAuditPage] = useState(0);
  const [auditTotal, setAuditTotal] = useState(0);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Password confirm
  const [pwDialog, setPwDialog] = useState<{ open: boolean; title: string; onConfirmed: () => void }>({
    open: false, title: "", onConfirmed: () => {},
  });

  // Delete confirm
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; userId: string; name: string }>({
    open: false, userId: "", name: "",
  });
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Session timeout (30 min)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const resetTimeout = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      toast.error("انتهت الجلسة بسبب عدم النشاط");
      navigate("/apps");
    }, 30 * 60 * 1000);
  }, [navigate]);

  useEffect(() => {
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetTimeout));
    resetTimeout();
    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimeout));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [resetTimeout]);

  // Check authorization
  useEffect(() => {
    const check = async () => {
      if (!user) { navigate("/auth"); return; }
      try {
        const { data } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "super_admin")
          .maybeSingle();
        if (!data) {
          toast.error("ليس لديك صلاحية الوصول");
          navigate("/apps");
          return;
        }
        setAuthorized(true);
      } catch {
        navigate("/apps");
      }
      setChecking(false);
    };
    check();
  }, [user, navigate]);

  // Load dashboard
  const loadDashboard = useCallback(async () => {
    setLoadingDashboard(true);
    try {
      const res = await apiCall("dashboard");
      setStats(res.stats);
      setRecentActivity(res.recent_activity || []);
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoadingDashboard(false);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await apiCall("users");
      setUsers(res.users || []);
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoadingUsers(false);
  }, []);

  const loadAuditLogs = useCallback(async (page = 0) => {
    setLoadingAudit(true);
    try {
      const res = await apiCall("audit_logs", { page: String(page) });
      setAuditLogs(res.logs || []);
      setAuditTotal(res.total || 0);
      setAuditPage(page);
    } catch (e: any) {
      toast.error(e.message);
    }
    setLoadingAudit(false);
  }, []);

  useEffect(() => {
    if (!authorized) return;
    loadDashboard();
  }, [authorized, loadDashboard]);

  useEffect(() => {
    if (!authorized || activeTab !== "users") return;
    loadUsers();
  }, [authorized, activeTab, loadUsers]);

  useEffect(() => {
    if (!authorized || activeTab !== "audit") return;
    loadAuditLogs(0);
  }, [authorized, activeTab, loadAuditLogs]);

  // ─── User Actions ───
  const handleSuspendUser = (userId: string, name: string) => {
    setPwDialog({
      open: true,
      title: `تعليق ${name}`,
      onConfirmed: async () => {
        try {
          await apiCall("suspend_user", undefined, { user_id: userId, reason: "Super Admin action" });
          toast.success(`تم تعليق ${name}`);
          loadUsers();
        } catch (e: any) { toast.error(e.message); }
      },
    });
  };

  const handleUnsuspendUser = async (userId: string, name: string) => {
    try {
      await apiCall("unsuspend_user", undefined, { user_id: userId });
      toast.success(`تم إلغاء تعليق ${name}`);
      loadUsers();
    } catch (e: any) { toast.error(e.message); }
  };

  const handleResetPassword = (userId: string, name: string) => {
    const newPw = prompt(`أدخل كلمة المرور الجديدة لـ ${name} (6 أحرف على الأقل):`);
    if (!newPw || newPw.length < 6) { toast.error("كلمة مرور قصيرة جداً"); return; }
    setPwDialog({
      open: true,
      title: `إعادة تعيين كلمة مرور ${name}`,
      onConfirmed: async () => {
        try {
          await apiCall("reset_password", undefined, { user_id: userId, new_password: newPw });
          toast.success("تم تحديث كلمة المرور");
        } catch (e: any) { toast.error(e.message); }
      },
    });
  };

  const handleDeleteUser = async () => {
    if (deleteConfirmText !== "DELETE") { toast.error("اكتب DELETE للتأكيد"); return; }
    try {
      await apiCall("delete_user", undefined, {
        user_id: deleteDialog.userId,
        confirmation: "DELETE",
      });
      toast.success(`تم حذف ${deleteDialog.name}`);
      setDeleteDialog({ open: false, userId: "", name: "" });
      setDeleteConfirmText("");
      loadUsers();
    } catch (e: any) { toast.error(e.message); }
  };

  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(new Set());

  const filteredUsers = users.filter((u) =>
    !userSearch || (u.display_name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase()))
  );

  // Group users hierarchically: owners (no invited_by or self-registered) and their sub-users
  const { owners, subUsersMap, standaloneUsers } = useMemo(() => {
    const ownerSet = new Set<string>();
    const subMap = new Map<string, UserRecord[]>();
    const standalone: UserRecord[] = [];

    // First pass: identify all owner user_ids (those who invited others)
    const inviterIds = new Set(
      filteredUsers.filter(u => u.invited_by).map(u => u.invited_by!)
    );

    // Categorize users
    filteredUsers.forEach(u => {
      if (u.invited_by && filteredUsers.some(o => o.user_id === u.invited_by)) {
        // This user was invited by someone in the list → sub-user
        const existing = subMap.get(u.invited_by!) || [];
        existing.push(u);
        subMap.set(u.invited_by!, existing);
      } else if (inviterIds.has(u.user_id)) {
        // This user invited others → owner
        ownerSet.add(u.user_id);
      } else if (u.company_id) {
        // Has company_id → check if another user with same company_id and no invited_by exists
        const potentialOwner = filteredUsers.find(
          o => o.user_id !== u.user_id && o.company_id === u.company_id && !o.invited_by && inviterIds.has(o.user_id)
        );
        if (potentialOwner) {
          const existing = subMap.get(potentialOwner.user_id) || [];
          if (!existing.some(e => e.user_id === u.user_id)) {
            existing.push(u);
            subMap.set(potentialOwner.user_id, existing);
          }
        } else {
          standalone.push(u);
        }
      } else {
        standalone.push(u);
      }
    });

    // Owners are users who have sub-users
    const ownerUsers = filteredUsers.filter(u => ownerSet.has(u.user_id) || subMap.has(u.user_id));
    
    return { owners: ownerUsers, subUsersMap: subMap, standaloneUsers: standalone };
  }, [filteredUsers]);

  const toggleOwnerExpand = (userId: string) => {
    setExpandedOwners(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const actionLabel: Record<string, string> = {
    view_dashboard: "عرض لوحة التحكم",
    view_users: "عرض المستخدمين",
    suspend_user: "تعليق مستخدم",
    unsuspend_user: "إلغاء التعليق",
    reset_password: "إعادة تعيين كلمة المرور",
    delete_user: "حذف مستخدم",
    verify_password: "تأكيد الهوية",
    view_table: "تصفح جدول",
    view_subscriptions: "عرض الاشتراكات",
    update_subscription: "تحديث اشتراك",
    assign_subscription: "تعيين اشتراك",
    view_revenue_stats: "عرض إحصائيات الإيرادات",
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#080d18" }}>
        <RefreshCw className="h-8 w-8 animate-spin text-amber-400" />
      </div>
    );
  }
  if (!authorized) return null;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #050F1E 0%, #0A2342 100%)", fontFamily: "Tajawal, sans-serif" }} dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50" style={{ background: "linear-gradient(180deg, #050F1E, #0A2342)", borderBottom: "1px solid rgba(255,255,255,0.06)", backdropFilter: "blur(16px)", height: 60 }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0A2342, #006D8F)" }}>
              <span className="text-white font-bold text-sm" style={{ fontFamily: "Barlow, sans-serif" }}>Z</span>
            </div>
            <div>
              <h1 className="text-lg font-bold text-white" style={{ fontFamily: "Barlow, sans-serif" }}>FINIX</h1>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold" style={{ background: "#C9A84C", color: "#0A2342", fontFamily: "Inter, sans-serif" }}>
              Super Admin
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)" }}>
              <Wifi className="h-3 w-3 text-red-400" />
              <span className="text-[11px] text-red-400 font-medium">LIVE</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/apps")} className="text-white/40 hover:text-white">
              <LogOut className="h-4 w-4 ml-1" /> خروج
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="border p-1 mb-6 flex-wrap h-auto gap-1" style={{ background: "rgba(255,255,255,0.03)", borderColor: "rgba(255,255,255,0.06)" }}>
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-[#00B4D8]/20 data-[state=active]:text-[#00B4D8] text-white/40">
              <Activity className="h-4 w-4 ml-1" /> لوحة التحكم
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-[#00B4D8]/20 data-[state=active]:text-[#00B4D8] text-white/40">
              <Users className="h-4 w-4 ml-1" /> المستخدمون
            </TabsTrigger>
            <TabsTrigger value="database" className="data-[state=active]:bg-[#00B4D8]/20 data-[state=active]:text-[#00B4D8] text-white/40">
              <Database className="h-4 w-4 ml-1" /> قاعدة البيانات
            </TabsTrigger>
            <TabsTrigger value="live" className="data-[state=active]:bg-[#00B4D8]/20 data-[state=active]:text-[#00B4D8] text-white/40">
              <Wifi className="h-4 w-4 ml-1" /> مراقبة حية
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-[#00B4D8]/20 data-[state=active]:text-[#00B4D8] text-white/40">
              <FileText className="h-4 w-4 ml-1" /> سجل التدقيق
            </TabsTrigger>
            <TabsTrigger value="settings" className="data-[state=active]:bg-[#00B4D8]/20 data-[state=active]:text-[#00B4D8] text-white/40">
              <Settings className="h-4 w-4 ml-1" /> إعدادات المنصة
            </TabsTrigger>
            <TabsTrigger value="subscriptions" className="data-[state=active]:bg-[#00B4D8]/20 data-[state=active]:text-[#00B4D8] text-white/40">
              <CreditCard className="h-4 w-4 ml-1" /> الاشتراكات
            </TabsTrigger>
            <TabsTrigger value="revenue" className="data-[state=active]:bg-[#00B4D8]/20 data-[state=active]:text-[#00B4D8] text-white/40">
              <BarChart3 className="h-4 w-4 ml-1" /> الإيرادات
            </TabsTrigger>
          </TabsList>

          {/* ─── DASHBOARD TAB ─── */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">نظرة عامة</h2>
              <Button variant="ghost" size="sm" onClick={loadDashboard} disabled={loadingDashboard} className="text-white/40">
                <RefreshCw className={`h-4 w-4 ml-1 ${loadingDashboard ? "animate-spin" : ""}`} /> تحديث
              </Button>
            </div>

            {stats && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <KPICard icon={Users} label="إجمالي الشركات" value={stats.total_users} sub={`+${stats.new_users_today} اليوم`} color="bg-[#00B4D8]/20 text-[#00B4D8]" accentColor="#00B4D8" />
                <KPICard icon={ShoppingCart} label="المستخدمون النشطون" value={stats.active_sessions} sub={`₪${stats.active_sessions_revenue.toLocaleString()}`} color="bg-[#C9A84C]/20 text-[#C9A84C]" accentColor="#C9A84C" />
                <KPICard icon={DollarSign} label="القيود اليوم" value={`₪${stats.today_revenue.toLocaleString()}`} sub={`${stats.today_transactions} عملية`} color="bg-[#16A34A]/20 text-[#16A34A]" accentColor="#16A34A" />
                <KPICard icon={Database} label="تنبيهات النظام" value={stats.total_accounts} sub={`${stats.total_contacts} جهة اتصال`} color="bg-[#DC2626]/20 text-[#DC2626]" accentColor="#DC2626" />
              </div>
            )}

            {/* Recent Activity */}
            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
              <div className="px-5 py-4 border-b border-white/[0.06] flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold text-white">آخر الأحداث</h3>
              </div>
              <div className="divide-y divide-white/[0.04] max-h-[400px] overflow-y-auto">
                {recentActivity.length === 0 && (
                  <p className="text-center text-white/20 py-8 text-sm">لا توجد أحداث بعد</p>
                )}
                {recentActivity.map((log) => (
                  <div key={log.id} className="px-5 py-3 flex items-center gap-3 hover:bg-white/[0.02]">
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center shrink-0">
                      <Activity className="h-3.5 w-3.5 text-white/30" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white/70 truncate">{actionLabel[log.action] || log.action}</p>
                      {log.target_id && <p className="text-[11px] text-white/25 truncate">{log.target_type}: {log.target_id}</p>}
                    </div>
                    <span className="text-[11px] text-white/20 shrink-0 tabular-nums">
                      {format(new Date(log.created_at), "HH:mm:ss")}
                    </span>
                    {log.ip_address && (
                      <span className="text-[10px] text-white/15 shrink-0 font-mono">{log.ip_address.substring(0, 12)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ─── USERS TAB ─── */}
          <TabsContent value="users" className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/20" />
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="بحث بالاسم أو الإيميل..."
                  className="pr-10 bg-white/[0.03] border-white/[0.06] text-white placeholder:text-white/20"
                />
              </div>
              <Badge className="bg-white/5 text-white/30 border-0 text-xs">
                {owners.length} شركة · {filteredUsers.length} مستخدم
              </Badge>
              <Button variant="ghost" size="sm" onClick={loadUsers} disabled={loadingUsers} className="text-white/40">
                <RefreshCw className={`h-4 w-4 ${loadingUsers ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-right text-white/30 font-medium px-4 py-3 w-8"></th>
                      <th className="text-right text-white/30 font-medium px-4 py-3">المستخدم</th>
                      <th className="text-right text-white/30 font-medium px-4 py-3">الإيميل</th>
                      <th className="text-right text-white/30 font-medium px-4 py-3">الأدوار</th>
                      <th className="text-right text-white/30 font-medium px-4 py-3">آخر دخول</th>
                      <th className="text-right text-white/30 font-medium px-4 py-3">الحالة</th>
                      <th className="text-center text-white/30 font-medium px-4 py-3">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {/* ── Owner rows with expandable sub-users ── */}
                    {owners.map((owner) => {
                      const subs = subUsersMap.get(owner.user_id) || [];
                      const isExpanded = expandedOwners.has(owner.user_id);
                      return (
                        <>
                          <tr
                            key={owner.user_id}
                            className={`hover:bg-white/[0.02] cursor-pointer transition-colors ${isExpanded ? "bg-white/[0.02]" : ""}`}
                            onClick={() => subs.length > 0 && toggleOwnerExpand(owner.user_id)}
                          >
                            <td className="px-3 py-3 text-center">
                              {subs.length > 0 ? (
                                <ChevronDown className={`h-4 w-4 text-white/30 transition-transform inline-block ${isExpanded ? "" : "-rotate-90"}`} />
                              ) : (
                                <span className="text-white/10 text-xs">—</span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs"
                                  style={{ background: "linear-gradient(135deg, #0A2342 0%, #006D8F 100%)", color: "#00B4D8" }}>
                                  {(owner.display_name || "?")[0]}
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-white/90 font-semibold">{owner.display_name || "—"}</span>
                                    {subs.length > 0 && (
                                      <Badge className="bg-[#00B4D8]/10 text-[#00B4D8] border-0 text-[9px] px-1.5">
                                        {subs.length} عضو
                                      </Badge>
                                    )}
                                  </div>
                                  {owner.company_name && (
                                    <span className="text-[11px] text-white/25">{owner.company_name}</span>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-white/50 font-mono text-xs">{owner.email || "—"}</td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 flex-wrap">
                                {owner.roles.map((r) => (
                                  <Badge key={r} variant="outline" className={`text-[10px] border-white/10 ${r === "super_admin" ? "text-amber-400 border-amber-400/30" : r === "admin" ? "text-blue-400 border-blue-400/30" : "text-white/40"}`}>
                                    {r}
                                  </Badge>
                                ))}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-white/30 text-xs">
                              {owner.last_sign_in ? format(new Date(owner.last_sign_in), "dd/MM HH:mm", { locale: ar }) : "—"}
                            </td>
                            <td className="px-4 py-3">
                              {owner.is_banned ? (
                                <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px]">معلق</Badge>
                              ) : (
                                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">نشط</Badge>
                              )}
                            </td>
                            <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center justify-center gap-1">
                                {owner.is_banned ? (
                                  <Button size="icon" variant="ghost" onClick={() => handleUnsuspendUser(owner.user_id, owner.display_name)} className="h-7 w-7 text-emerald-400 hover:bg-emerald-500/10" title="إلغاء التعليق">
                                    <Unlock className="h-3.5 w-3.5" />
                                  </Button>
                                ) : (
                                  <Button size="icon" variant="ghost" onClick={() => handleSuspendUser(owner.user_id, owner.display_name)} className="h-7 w-7 text-amber-400 hover:bg-amber-500/10" title="تعليق">
                                    <Lock className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                                <Button size="icon" variant="ghost" onClick={() => handleResetPassword(owner.user_id, owner.display_name)} className="h-7 w-7 text-blue-400 hover:bg-blue-500/10" title="إعادة تعيين كلمة المرور">
                                  <KeyRound className="h-3.5 w-3.5" />
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => setDeleteDialog({ open: true, userId: owner.user_id, name: owner.display_name })} className="h-7 w-7 text-red-400 hover:bg-red-500/10" title="حذف" disabled={owner.roles.includes("super_admin")}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {/* Sub-users (expanded) */}
                          {isExpanded && subs.map((sub) => (
                            <tr key={sub.user_id} className="bg-white/[0.01] hover:bg-white/[0.03]" style={{ borderRight: "3px solid rgba(0,180,216,0.15)" }}>
                              <td className="px-3 py-2.5"></td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2 pr-4">
                                  <div className="w-1.5 h-1.5 rounded-full bg-white/10 shrink-0" />
                                  <div className="w-7 h-7 rounded-lg bg-white/[0.04] flex items-center justify-center text-white/30 font-bold text-[10px]">
                                    {(sub.display_name || "?")[0]}
                                  </div>
                                  <span className="text-white/60 text-[13px]">{sub.display_name || "—"}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-white/40 font-mono text-[11px]">{sub.email || "—"}</td>
                              <td className="px-4 py-2.5">
                                <div className="flex gap-1 flex-wrap">
                                  {sub.roles.map((r) => (
                                    <Badge key={r} variant="outline" className={`text-[9px] border-white/10 ${
                                      r === "cashier" ? "text-purple-400 border-purple-400/20" :
                                      r === "accountant_senior" ? "text-cyan-400 border-cyan-400/20" :
                                      r === "employee" ? "text-white/30" :
                                      r === "admin" ? "text-blue-400 border-blue-400/30" :
                                      "text-white/30"
                                    }`}>
                                      {r}
                                    </Badge>
                                  ))}
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-white/25 text-[11px]">
                                {sub.last_sign_in ? format(new Date(sub.last_sign_in), "dd/MM HH:mm", { locale: ar }) : "—"}
                              </td>
                              <td className="px-4 py-2.5">
                                {sub.is_banned ? (
                                  <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[9px]">معلق</Badge>
                                ) : (
                                  <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px]">نشط</Badge>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center justify-center gap-1">
                                  {sub.is_banned ? (
                                    <Button size="icon" variant="ghost" onClick={() => handleUnsuspendUser(sub.user_id, sub.display_name)} className="h-6 w-6 text-emerald-400 hover:bg-emerald-500/10" title="إلغاء التعليق">
                                      <Unlock className="h-3 w-3" />
                                    </Button>
                                  ) : (
                                    <Button size="icon" variant="ghost" onClick={() => handleSuspendUser(sub.user_id, sub.display_name)} className="h-6 w-6 text-amber-400 hover:bg-amber-500/10" title="تعليق">
                                      <Lock className="h-3 w-3" />
                                    </Button>
                                  )}
                                  <Button size="icon" variant="ghost" onClick={() => handleResetPassword(sub.user_id, sub.display_name)} className="h-6 w-6 text-blue-400 hover:bg-blue-500/10" title="إعادة تعيين كلمة المرور">
                                    <KeyRound className="h-3 w-3" />
                                  </Button>
                                  <Button size="icon" variant="ghost" onClick={() => setDeleteDialog({ open: true, userId: sub.user_id, name: sub.display_name })} className="h-6 w-6 text-red-400 hover:bg-red-500/10" title="حذف">
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </>
                      );
                    })}

                    {/* ── Standalone users (no team) ── */}
                    {standaloneUsers.map((u) => (
                      <tr key={u.user_id} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-3 text-center">
                          <span className="text-white/10 text-xs">—</span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 font-bold text-xs">
                              {(u.display_name || "?")[0]}
                            </div>
                            <div>
                              <span className="text-white/80 font-medium">{u.display_name || "—"}</span>
                              {u.company_name && (
                                <p className="text-[11px] text-white/20">{u.company_name}</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/50 font-mono text-xs">{u.email || "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {u.roles.map((r) => (
                              <Badge key={r} variant="outline" className={`text-[10px] border-white/10 ${r === "super_admin" ? "text-amber-400 border-amber-400/30" : r === "admin" ? "text-blue-400 border-blue-400/30" : "text-white/40"}`}>
                                {r}
                              </Badge>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/30 text-xs">
                          {u.last_sign_in ? format(new Date(u.last_sign_in), "dd/MM HH:mm", { locale: ar }) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          {u.is_banned ? (
                            <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[10px]">معلق</Badge>
                          ) : (
                            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">نشط</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-center gap-1">
                            {u.is_banned ? (
                              <Button size="icon" variant="ghost" onClick={() => handleUnsuspendUser(u.user_id, u.display_name)} className="h-7 w-7 text-emerald-400 hover:bg-emerald-500/10" title="إلغاء التعليق">
                                <Unlock className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button size="icon" variant="ghost" onClick={() => handleSuspendUser(u.user_id, u.display_name)} className="h-7 w-7 text-amber-400 hover:bg-amber-500/10" title="تعليق">
                                <Lock className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => handleResetPassword(u.user_id, u.display_name)} className="h-7 w-7 text-blue-400 hover:bg-blue-500/10" title="إعادة تعيين كلمة المرور">
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDeleteDialog({ open: true, userId: u.user_id, name: u.display_name })} className="h-7 w-7 text-red-400 hover:bg-red-500/10" title="حذف" disabled={u.roles.includes("super_admin")}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8 text-white/20">لا توجد نتائج</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </TabsContent>

          {/* ─── DATABASE BROWSER TAB ─── */}
          <TabsContent value="database">
            <DatabaseBrowser />
          </TabsContent>

          {/* ─── LIVE MONITOR TAB ─── */}
          <TabsContent value="live">
            <LiveMonitor />
          </TabsContent>

          {/* ─── AUDIT TAB ─── */}
          <TabsContent value="audit" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Shield className="h-5 w-5 text-amber-400" /> سجل التدقيق
              </h2>
              <Button variant="ghost" size="sm" onClick={() => loadAuditLogs(0)} disabled={loadingAudit} className="text-white/40">
                <RefreshCw className={`h-4 w-4 ${loadingAudit ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-right text-white/30 font-medium px-4 py-3">التاريخ</th>
                      <th className="text-right text-white/30 font-medium px-4 py-3">الإجراء</th>
                      <th className="text-right text-white/30 font-medium px-4 py-3">الهدف</th>
                      <th className="text-right text-white/30 font-medium px-4 py-3">IP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3 text-white/40 tabular-nums text-xs font-mono">
                          {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss")}
                        </td>
                        <td className="px-4 py-3 text-white/70">{actionLabel[log.action] || log.action}</td>
                        <td className="px-4 py-3 text-white/30 text-xs font-mono truncate max-w-[200px]">
                          {log.target_id ? `${log.target_type}: ${log.target_id}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-white/20 text-xs font-mono">{log.ip_address || "—"}</td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-8 text-white/20">لا توجد سجلات</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {auditTotal > 50 && (
                <div className="px-4 py-3 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-xs text-white/20">{auditTotal} سجل</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" disabled={auditPage === 0} onClick={() => loadAuditLogs(auditPage - 1)} className="text-white/40">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-white/30 flex items-center">صفحة {auditPage + 1}</span>
                    <Button size="sm" variant="ghost" disabled={(auditPage + 1) * 50 >= auditTotal} onClick={() => loadAuditLogs(auditPage + 1)} className="text-white/40">
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* ─── SUBSCRIPTIONS TAB ─── */}
          <TabsContent value="subscriptions">
            <SubscriptionsManager />
          </TabsContent>

          {/* ─── SETTINGS TAB ─── */}
          <TabsContent value="settings">
            <PlatformSettings />
          </TabsContent>

          {/* ─── REVENUE TAB ─── */}
          <TabsContent value="revenue">
            <RevenueReports />
          </TabsContent>
        </Tabs>
      </div>

      {/* Password Confirmation Dialog */}
      <PasswordConfirmDialog
        open={pwDialog.open}
        onClose={() => setPwDialog({ ...pwDialog, open: false })}
        onConfirmed={pwDialog.onConfirmed}
        title={pwDialog.title}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={() => { setDeleteDialog({ open: false, userId: "", name: "" }); setDeleteConfirmText(""); }}>
        <DialogContent className="bg-[#0f1524] border-white/10 text-white" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" /> حذف مستخدم نهائياً
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-white/50">أنت على وشك حذف <strong className="text-white">{deleteDialog.name}</strong> نهائياً. هذا الإجراء لا يمكن التراجع عنه.</p>
            <p className="text-sm text-white/50">اكتب <strong className="text-red-400 font-mono">DELETE</strong> للتأكيد:</p>
            <Input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="bg-white/5 border-white/10 text-white font-mono"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDeleteDialog({ open: false, userId: "", name: "" }); setDeleteConfirmText(""); }} className="text-white/50">إلغاء</Button>
            <Button onClick={handleDeleteUser} disabled={deleteConfirmText !== "DELETE"} className="bg-red-500 hover:bg-red-600 text-white">
              حذف نهائي
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
