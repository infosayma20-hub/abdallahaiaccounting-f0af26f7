import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import SubscriptionEditDialog from "@/components/super-admin/SubscriptionEditDialog";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Crown, Users, ShoppingCart, DollarSign, Activity, Shield, Clock,
  Lock, Unlock, Trash2, KeyRound, Eye, RefreshCw, AlertTriangle,
  ChevronLeft, ChevronRight, Search, X, LogOut, Database, FileText, ChevronDown,
  TrendingUp, Wifi, Download, Table2, Play, Pause, Settings, Package,
  Zap, Server, Bell, HardDrive, CreditCard, BarChart3, PieChart, ArrowUpRight, ArrowDownRight, CalendarDays,
  Sun, Moon, LayoutDashboard, UserPlus,
} from "lucide-react";
import SamiLeadsPanel from "@/components/superadmin/SamiLeadsPanel";
import { SignupNotificationsBell } from "@/components/super-admin/SignupNotificationsBell";
import UserSecurityAuditTab from "@/components/super-admin/UserSecurityAuditTab";
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

import { setNextExportBranding } from "@/lib/excel-export";
// ─── Theme CSS ───
const LIGHT_THEME_STYLES = `
  [data-sa-theme] * {
    direction: rtl;
  }
  [data-sa-theme] input,
  [data-sa-theme] [dir="ltr"] {
    direction: ltr;
  }
  [data-sa-theme] table {
    direction: rtl;
    text-align: right;
  }
  [data-sa-theme="light"] {
    --sa-bg: #F0F2F5;
    --sa-bg-gradient: linear-gradient(180deg, #F0F2F5 0%, #E8ECF3 100%);
    --sa-header-bg: linear-gradient(180deg, #ffffff, #fafbfc);
    --sa-header-border: rgba(0,0,0,0.06);
    --sa-card-bg: #ffffff;
    --sa-card-border: rgba(0,0,0,0.06);
    --sa-card-hover: rgba(0,0,0,0.015);
    --sa-text-primary: #1B3A5C;
    --sa-text-secondary: #374151;
    --sa-text-muted: #6b7280;
    --sa-text-faint: #9ca3af;
    --sa-surface: rgba(0,0,0,0.025);
    --sa-surface-hover: rgba(0,0,0,0.05);
    --sa-divider: rgba(0,0,0,0.05);
    --sa-kpi-gradient: linear-gradient(135deg, #f5f7fa 0%, #eef1f6 100%);
    --sa-input-bg: #ffffff;
    --sa-input-border: rgba(0,0,0,0.12);
    --sa-dialog-bg: #ffffff;
    --sa-dialog-border: rgba(0,0,0,0.1);
    --sa-table-header-bg: #f8f9fb;
    --sa-logo-bg: linear-gradient(135deg, #1B3A5C, #2A7B9B);
    --sa-tab-active-bg: rgba(42,123,155,0.08);
    --sa-tab-active-text: #2A7B9B;
    --sa-tab-inactive-text: #6b7280;
  }
  [data-sa-theme="dark"] {
    --sa-bg: #080d18;
    --sa-bg-gradient: linear-gradient(180deg, #050F1E 0%, #0A2342 100%);
    --sa-header-bg: linear-gradient(180deg, #050F1E, #0A2342);
    --sa-header-border: rgba(255,255,255,0.06);
    --sa-card-bg: rgba(255,255,255,0.03);
    --sa-card-border: rgba(255,255,255,0.06);
    --sa-card-hover: rgba(255,255,255,0.02);
    --sa-text-primary: #ffffff;
    --sa-text-secondary: rgba(255,255,255,0.7);
    --sa-text-muted: rgba(255,255,255,0.4);
    --sa-text-faint: rgba(255,255,255,0.15);
    --sa-surface: rgba(255,255,255,0.03);
    --sa-surface-hover: rgba(255,255,255,0.06);
    --sa-divider: rgba(255,255,255,0.06);
    --sa-kpi-gradient: linear-gradient(135deg, #0A2342 0%, #0D3158 100%);
    --sa-input-bg: rgba(255,255,255,0.03);
    --sa-input-border: rgba(255,255,255,0.06);
    --sa-dialog-bg: #0f1524;
    --sa-dialog-border: rgba(255,255,255,0.1);
    --sa-table-header-bg: #0a1020;
    --sa-logo-bg: linear-gradient(135deg, #0A2342, #006D8F);
    --sa-tab-active-bg: rgba(0,180,216,0.2);
    --sa-tab-active-text: #00B4D8;
    --sa-tab-inactive-text: rgba(255,255,255,0.4);
  }
`;

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
      <DialogContent style={{ background: "var(--sa-dialog-bg)", borderColor: "var(--sa-dialog-border)", color: "var(--sa-text-primary)" }} dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-amber-400" />
            تأكيد الهوية — {title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm" style={{ color: "var(--sa-text-muted)" }}>أدخل كلمة المرور الخاصة بك لتأكيد هذا الإجراء</p>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleVerify()}
            placeholder="كلمة المرور"
            style={{ background: "var(--sa-input-bg)", borderColor: "var(--sa-input-border)", color: "var(--sa-text-primary)" }}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} style={{ color: "var(--sa-text-muted)" }}>إلغاء</Button>
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
      className="rounded-xl p-3 sm:p-5 space-y-2 sm:space-y-3 transition-all duration-150 hover:shadow-lg"
      style={{
        background: "var(--sa-kpi-gradient)",
        borderRight: `4px solid ${accentColor || "#00B4D8"}`,
        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
      }}
    >
      <div className="flex items-center gap-2 sm:gap-3">
        <div className={`w-9 h-9 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        <span className="text-[11px] sm:text-sm" style={{ color: "var(--sa-text-muted)", fontFamily: "Tajawal, sans-serif" }}>{label}</span>
      </div>
      <div className="text-xl sm:text-[32px] font-bold font-mono tabular-nums" style={{ color: "var(--sa-text-primary)", fontFamily: "JetBrains Mono, monospace" }}>{value}</div>
      {sub && <p className="text-[11px] sm:text-[13px]" style={{ color: "var(--sa-text-muted)", fontFamily: "Tajawal, sans-serif" }}>{sub}</p>}
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
    setNextExportBranding({ title: "تقرير" });
    XLSX.writeFile(wb, `${selectedTable}_export.xlsx`);
    toast.success("تم التصدير بنجاح");
  };

  const tableInfo = ALLOWED_TABLES.find((t) => t.key === selectedTable);

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row gap-4">
        {/* Sidebar - Table List */}
        <div className="w-full lg:w-56 shrink-0 space-y-1">
          <p className="text-xs font-medium px-2 mb-2" style={{ color: "var(--sa-text-faint)" }}>📋 الجداول</p>
          {ALLOWED_TABLES.map((t) => (
            <button
              key={t.key}
              onClick={() => { setSelectedTable(t.key); setTableSearch(""); }}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors text-right ${
                selectedTable === t.key
                  ? "bg-amber-500/20 text-amber-400 font-medium"
                  : ""
              }`}
              style={selectedTable !== t.key ? { color: "var(--sa-text-muted)" } : undefined}
              onMouseEnter={(e) => { if (selectedTable !== t.key) { (e.target as HTMLElement).style.background = "var(--sa-surface-hover)"; } }}
              onMouseLeave={(e) => { if (selectedTable !== t.key) { (e.target as HTMLElement).style.background = ""; } }}
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
            <h3 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--sa-text-primary)" }}>
              <Table2 className="h-5 w-5 text-amber-400" />
              {tableInfo?.icon} {tableInfo?.label}
              <Badge style={{ background: "var(--sa-surface)", color: "var(--sa-text-faint)" }} className="border-0 text-xs">{tableTotal} سجل</Badge>
            </h3>
            <div className="mr-auto flex items-center gap-2">
              <div className="relative">
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--sa-text-faint)" }} />
                <Input
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="بحث في البيانات..."
                  className="pr-8 h-8 text-xs w-48"
                  style={{ background: "var(--sa-input-bg)", borderColor: "var(--sa-input-border)", color: "var(--sa-text-primary)" }}
                />
              </div>
              <Button size="sm" variant="ghost" onClick={exportToExcel} className="h-8" style={{ color: "var(--sa-text-muted)" }} title="تصدير Excel">
                <Download className="h-3.5 w-3.5 ml-1" /> تصدير
              </Button>
              <Button size="sm" variant="ghost" onClick={() => loadTableData(selectedTable, tablePage)} disabled={loadingTable} className="h-8" style={{ color: "var(--sa-text-muted)" }}>
                <RefreshCw className={`h-3.5 w-3.5 ${loadingTable ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          <div className="rounded-xl overflow-hidden" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
            <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0" style={{ background: "var(--sa-table-header-bg)" }}>
                  <tr style={{ borderBottom: "1px solid var(--sa-divider)" }}>
                    {columns.map((col) => (
                      <th key={col} className="text-right font-medium px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--sa-text-muted)" }}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loadingTable ? (
                    <tr>
                      <td colSpan={columns.length || 1} className="text-center py-12" style={{ color: "var(--sa-text-faint)" }}>
                        <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-amber-400" />
                        جاري التحميل...
                      </td>
                    </tr>
                  ) : filteredData.length === 0 ? (
                    <tr>
                      <td colSpan={columns.length || 1} className="text-center py-12" style={{ color: "var(--sa-text-faint)" }}>لا توجد بيانات</td>
                    </tr>
                  ) : (
                    filteredData.map((row, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--sa-divider)" }} className="transition-colors"
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sa-card-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                        {columns.map((col) => (
                          <td key={col} className="px-3 py-2 max-w-[200px] truncate whitespace-nowrap" style={{ color: "var(--sa-text-muted)" }} title={String(row[col] ?? "")}>
                            {row[col] === null ? <span style={{ color: "var(--sa-text-faint)" }} className="italic">null</span> :
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
              <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderTop: "1px solid var(--sa-divider)" }}>
                <span className="text-[11px]" style={{ color: "var(--sa-text-faint)" }}>
                  صفحة {tablePage + 1} من {Math.ceil(tableTotal / 50)}
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" disabled={tablePage === 0} onClick={() => loadTableData(selectedTable, tablePage - 1)} className="h-7" style={{ color: "var(--sa-text-muted)" }}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" disabled={(tablePage + 1) * 50 >= tableTotal} onClick={() => loadTableData(selectedTable, tablePage + 1)} className="h-7" style={{ color: "var(--sa-text-muted)" }}>
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
    const channel = supabase
      .channel("topic-super-admin-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "transactions" }, (payload) => {
        if (pausedRef.current) return;
        const t = payload.new as any;
        const ev: LiveEvent = {
          id: t.id, time: new Date().toISOString(), user: t.user_id?.substring(0, 8) || "—",
          action: `معاملة ${t.transaction_type || "جديدة"}`,
          details: t.amount ? `₪${Number(t.amount).toLocaleString()}` : undefined, type: "transaction",
        };
        eventsRef.current = [ev, ...eventsRef.current].slice(0, 100);
        setEvents([...eventsRef.current]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pos_sessions" }, (payload) => {
        if (pausedRef.current) return;
        const s = payload.new as any;
        const ev: LiveEvent = { id: s.id, time: new Date().toISOString(), user: s.user_id?.substring(0, 8) || "—", action: "فتح وردية جديدة", type: "pos" };
        eventsRef.current = [ev, ...eventsRef.current].slice(0, 100);
        setEvents([...eventsRef.current]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pos_sessions" }, (payload) => {
        if (pausedRef.current) return;
        const s = payload.new as any;
        if (s.status === "closed") {
          const ev: LiveEvent = {
            id: s.id + "-close", time: new Date().toISOString(), user: s.user_id?.substring(0, 8) || "—",
            action: "إغلاق وردية", details: s.total_sales ? `₪${Number(s.total_sales).toLocaleString()}` : undefined, type: "pos",
          };
          eventsRef.current = [ev, ...eventsRef.current].slice(0, 100);
          setEvents([...eventsRef.current]);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pos_orders" }, (payload) => {
        if (pausedRef.current) return;
        const o = payload.new as any;
        const ev: LiveEvent = {
          id: o.id, time: new Date().toISOString(), user: o.user_id?.substring(0, 8) || "—",
          action: "طلب POS جديد", details: o.total_amount ? `₪${Number(o.total_amount).toLocaleString()}` : undefined, type: "pos",
        };
        eventsRef.current = [ev, ...eventsRef.current].slice(0, 100);
        setEvents([...eventsRef.current]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "super_admin_audit_logs" }, (payload) => {
        if (pausedRef.current) return;
        const l = payload.new as any;
        const ev: LiveEvent = { id: l.id, time: new Date().toISOString(), user: "Super Admin", action: l.action, type: "system" };
        eventsRef.current = [ev, ...eventsRef.current].slice(0, 100);
        setEvents([...eventsRef.current]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
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
    transaction: "💰", auth: "🔐", system: "⚙️", pos: "🛒",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--sa-text-primary)" }}>
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
            <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5" style={{ color: "var(--sa-text-faint)" }} />
            <Input
              value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="فلتر..."
              className="pr-8 h-8 text-xs w-40"
              style={{ background: "var(--sa-input-bg)", borderColor: "var(--sa-input-border)", color: "var(--sa-text-primary)" }}
            />
          </div>
          <Button size="sm" variant="ghost" onClick={() => setIsPaused(!isPaused)}
            className={`h-8 ${isPaused ? "text-yellow-400" : ""}`}
            style={!isPaused ? { color: "var(--sa-text-muted)" } : undefined}>
            {isPaused ? <Play className="h-3.5 w-3.5 ml-1" /> : <Pause className="h-3.5 w-3.5 ml-1" />}
            {isPaused ? "استئناف" : "إيقاف"}
          </Button>
        </div>
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
        <div className="max-h-[600px] overflow-y-auto">
          {filteredEvents.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <Activity className="h-8 w-8 mx-auto" style={{ color: "var(--sa-text-faint)" }} />
              <p className="text-sm" style={{ color: "var(--sa-text-faint)" }}>في انتظار النشاط...</p>
              <p className="text-[11px]" style={{ color: "var(--sa-text-faint)" }}>ستظهر الأحداث هنا فور حدوثها في الوقت الفعلي</p>
            </div>
          ) : (
            filteredEvents.map((ev) => (
              <div key={ev.id} className="px-4 py-3 flex items-center gap-3 transition-colors"
                style={{ borderBottom: "1px solid var(--sa-divider)" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sa-card-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                <span className="text-lg shrink-0">{typeIcons[ev.type]}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm" style={{ color: "var(--sa-text-secondary)" }}>{ev.action}</span>
                    {ev.details && (
                      <Badge className={`text-[10px] border-0 ${typeColors[ev.type]}`}>{ev.details}</Badge>
                    )}
                  </div>
                  <p className="text-[11px] font-mono" style={{ color: "var(--sa-text-faint)" }}>{ev.user}</p>
                </div>
                <span className="text-[11px] tabular-nums font-mono shrink-0" style={{ color: "var(--sa-text-faint)" }}>
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

// ─── Reset Categories ───
const RESET_CATEGORIES = [
  { key: "pos", label: "نقطة البيع (POS)", icon: "🖥️", desc: "طلبات، مدفوعات، ورديات" },
  { key: "call_center", label: "الكول سنتر", icon: "📞", desc: "طلبات الكول سنتر" },
  { key: "invoices", label: "فواتير المبيعات", icon: "🧾", desc: "فواتير وبنودها" },
  { key: "purchase_invoices", label: "فواتير المشتريات", icon: "📦", desc: "فواتير المشتريات وبنودها" },
  { key: "vouchers", label: "السندات", icon: "📋", desc: "سندات قبض وصرف وقيد" },
  { key: "cheques", label: "الشيكات", icon: "💳", desc: "شيكات وتاريخ حالاتها" },
  { key: "cash_transfers", label: "تحويلات الصناديق", icon: "🔄", desc: "تحويلات بين الصناديق" },
  { key: "loans", label: "القروض والسلف", icon: "💰", desc: "قروض حسنة وأقساطها" },
  { key: "payroll", label: "الرواتب والمسحوبات", icon: "💵", desc: "كشوف رواتب، مسحوبات، خصومات" },
  { key: "leaves", label: "الإجازات", icon: "🏖️", desc: "إجازات الموظفين" },
  { key: "attendance", label: "الحضور", icon: "⏰", desc: "بصمات وأيام الحضور" },
  { key: "procurement", label: "المشتريات (Procurement)", icon: "🛒", desc: "طلبات وأوامر الشراء" },
  { key: "contractor", label: "المقاولات", icon: "🏗️", desc: "حركات المقاولين" },
  { key: "journals", label: "القيود المحاسبية", icon: "📒", desc: "جميع المعاملات المالية" },
  { key: "other", label: "أخرى", icon: "🗃️", desc: "عمولات، تنبيهات، سجلات، AI" },
];

// ─── Reset Transactions Tool ───
function ResetTransactionsTool() {
  const [users, setUsers] = useState<{ user_id: string; display_name: string; email?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState("");
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [resetting, setResetting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [userSearch, setUserSearch] = useState("");
  const [selectedCategories, setSelectedCategories] = useState<string[]>(RESET_CATEGORIES.map(c => c.key));

  useEffect(() => {
    (async () => {
      try {
        const res = await apiCall("users");
        setUsers(res.users || []);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const filteredUsers = users.filter(u =>
    !userSearch || u.display_name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase())
  );

  const selectedUserInfo = users.find(u => u.user_id === selectedUser);

  const toggleCategory = (key: string) => {
    setSelectedCategories(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const allSelected = selectedCategories.length === RESET_CATEGORIES.length;
  const toggleAll = () => {
    setSelectedCategories(allSelected ? [] : RESET_CATEGORIES.map(c => c.key));
  };

  const handleReset = async () => {
    if (!selectedUser || !password || confirmText !== "RESET" || selectedCategories.length === 0) return;
    setResetting(true);
    setResult(null);
    try {
      const res = await apiCall("reset_user_transactions", undefined, {
        target_user_id: selectedUser,
        password,
        categories: selectedCategories,
      });
      setResult(res);
      toast.success(`تم حذف ${res.total_deleted} سجل بنجاح`);
      setPassword("");
      setConfirmText("");
    } catch (e: any) {
      toast.error(e.message);
    }
    setResetting(false);
  };

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--sa-text-primary)" }}>
        <Zap className="h-5 w-5 text-amber-400" /> أدوات إدارية
      </h2>

      <div className="rounded-2xl p-6 space-y-5" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
            <Trash2 className="h-6 w-6 text-red-400" />
          </div>
          <div>
            <h3 className="font-bold text-lg" style={{ color: "var(--sa-text-primary)" }}>إعادة تعيين حركات مستخدم</h3>
            <p className="text-sm" style={{ color: "var(--sa-text-muted)" }}>
              اختر الأقسام المراد تصفيرها مع الحفاظ على التعريفات
            </p>
          </div>
        </div>

        {/* User selector */}
        <div className="space-y-2">
          <label className="text-sm font-bold" style={{ color: "var(--sa-text-primary)" }}>اختر المستخدم</label>
          <div className="relative">
            <Search className="absolute right-3 top-2.5 h-4 w-4" style={{ color: "var(--sa-text-faint)" }} />
            <Input
              value={userSearch}
              onChange={e => setUserSearch(e.target.value)}
              placeholder="ابحث عن مستخدم..."
              className="pr-9"
              style={{ background: "var(--sa-input-bg)", borderColor: "var(--sa-input-border)", color: "var(--sa-text-primary)" }}
            />
          </div>
          {loading ? (
            <p className="text-sm" style={{ color: "var(--sa-text-muted)" }}>جاري التحميل...</p>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1 rounded-lg p-1" style={{ background: "var(--sa-surface)" }}>
              {filteredUsers.map(u => (
                <button
                  key={u.user_id}
                  onClick={() => setSelectedUser(u.user_id)}
                  className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                    selectedUser === u.user_id ? "bg-amber-500/20 text-amber-400 font-medium" : ""
                  }`}
                  style={selectedUser !== u.user_id ? { color: "var(--sa-text-secondary)" } : undefined}
                >
                  <span>{u.display_name || u.email}</span>
                  <span className="text-[10px] font-mono" style={{ color: "var(--sa-text-faint)" }}>
                    {u.email}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedUser && (
          <div className="space-y-4 pt-2 border-t" style={{ borderColor: "var(--sa-divider)" }}>
            <div className="p-3 rounded-lg" style={{ background: "var(--sa-surface)" }}>
              <p className="text-sm" style={{ color: "var(--sa-text-muted)" }}>
                المستخدم المحدد: <strong style={{ color: "var(--sa-text-primary)" }}>{selectedUserInfo?.display_name}</strong>
                <span className="text-xs font-mono mr-2" style={{ color: "var(--sa-text-faint)" }}>{selectedUserInfo?.email}</span>
              </p>
            </div>

            {/* Category Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold" style={{ color: "var(--sa-text-primary)" }}>اختر الأقسام المراد تصفيرها</label>
                <button
                  onClick={toggleAll}
                  className="text-xs px-3 py-1 rounded-lg transition-colors"
                  style={{ background: "var(--sa-surface)", color: "var(--sa-text-secondary)" }}
                >
                  {allSelected ? "إلغاء تحديد الكل" : "تحديد الكل"}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                {RESET_CATEGORIES.map(cat => {
                  const isSelected = selectedCategories.includes(cat.key);
                  return (
                    <button
                      key={cat.key}
                      onClick={() => toggleCategory(cat.key)}
                      className={`flex items-start gap-2 p-2.5 rounded-xl text-right transition-all border ${
                        isSelected
                          ? "border-red-500/40 bg-red-500/10"
                          : "border-transparent"
                      }`}
                      style={!isSelected ? { background: "var(--sa-surface)", color: "var(--sa-text-muted)" } : undefined}
                    >
                      <div className={`w-5 h-5 rounded-md flex items-center justify-center text-xs flex-shrink-0 mt-0.5 ${
                        isSelected ? "bg-red-500 text-white" : ""
                      }`} style={!isSelected ? { background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" } : undefined}>
                        {isSelected && "✓"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold ${isSelected ? "text-red-400" : ""}`} style={!isSelected ? { color: "var(--sa-text-secondary)" } : undefined}>
                          {cat.icon} {cat.label}
                        </p>
                        <p className="text-[10px] truncate" style={{ color: "var(--sa-text-faint)" }}>{cat.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {selectedCategories.length > 0 && (
                <p className="text-xs text-amber-400">
                  ✅ سيتم تصفير {selectedCategories.length} من {RESET_CATEGORIES.length} قسم
                </p>
              )}
            </div>

            <div className="p-4 rounded-xl bg-red-500/5 border border-red-500/10 space-y-2">
              <p className="text-sm font-bold text-red-400 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> تحذير: هذا الإجراء لا يمكن التراجع عنه
              </p>
              <ul className="text-xs space-y-1 mr-6" style={{ color: "var(--sa-text-muted)" }}>
                <li>• سيتم حذف البيانات في الأقسام المحددة فقط</li>
                <li>• سيتم إعادة أرصدة جهات الاتصال إلى صفر</li>
                <li className="text-emerald-400 font-medium">✓ ستبقى الحسابات والأصناف والموظفين وإعدادات POS كما هي</li>
              </ul>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold" style={{ color: "var(--sa-text-primary)" }}>كلمة مرور Super Admin</label>
              <Input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="أدخل كلمة المرور الخاصة بك"
                style={{ background: "var(--sa-input-bg)", borderColor: "var(--sa-input-border)", color: "var(--sa-text-primary)" }}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm" style={{ color: "var(--sa-text-muted)" }}>
                اكتب <strong className="text-red-400 font-mono">RESET</strong> للتأكيد
              </label>
              <Input
                value={confirmText}
                onChange={e => setConfirmText(e.target.value)}
                placeholder="RESET"
                className="font-mono"
                style={{ background: "var(--sa-input-bg)", borderColor: "var(--sa-input-border)", color: "var(--sa-text-primary)" }}
              />
            </div>

            <Button
              onClick={handleReset}
              disabled={resetting || !password || confirmText !== "RESET" || selectedCategories.length === 0}
              className="w-full bg-red-500 hover:bg-red-600 text-white h-11 text-base font-bold gap-2"
            >
              {resetting ? (
                <><RefreshCw className="h-4 w-4 animate-spin" /> جاري الحذف...</>
              ) : (
                <><Trash2 className="h-4 w-4" /> حذف الحركات المحددة ({selectedCategories.length} قسم)</>
              )}
            </Button>
          </div>
        )}

        {result && (
          <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/10 space-y-2">
            <p className="text-sm font-bold text-emerald-400">✅ تم بنجاح — حُذف {result.total_deleted} سجل</p>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(result.deleted || {}).map(([table, count]) => (
                <div key={table} className="flex justify-between text-xs px-2 py-1 rounded" style={{ background: "var(--sa-surface)" }}>
                  <span style={{ color: "var(--sa-text-muted)" }}>{table}</span>
                  <span className="font-mono text-emerald-400">{String(count)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── App Visibility Manager ───
const MANAGEABLE_APPS = [
  { id: "pos", label: "نقطة البيع", icon: "🖥️" },
  { id: "inventory", label: "المخزون", icon: "📦" },
  { id: "fixed-assets", label: "الأصول الثابتة", icon: "🏛️" },
  { id: "contractor", label: "المقاولات", icon: "🏗️" },
  { id: "workshops", label: "الورشات", icon: "🪵" },
  { id: "ecommerce", label: "المتاجر الإلكترونية", icon: "🛍️" },
  { id: "travel", label: "السياحة والسفر", icon: "✈️" },
  { id: "tasks", label: "إدارة المهام", icon: "📋" },
  { id: "hr", label: "الموارد البشرية", icon: "👥" },
  { id: "purchases", label: "المشتريات", icon: "🛒" },
  { id: "sales", label: "المبيعات", icon: "🧾" },
  { id: "reports", label: "التقارير", icon: "📊" },
  { id: "warranty", label: "إدارة الكفالات", icon: "🛡️" },
  { id: "settings", label: "الإعدادات", icon: "⚙️" },
];

function AppVisibilityManager() {
  const [users, setUsers] = useState<{ user_id: string; display_name: string; email?: string; roles?: string[] }[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState("");
  const [hiddenApps, setHiddenApps] = useState<string[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await apiCall("users");
        setUsers(res.users || []);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, []);

  const loadHiddenApps = async (userId: string) => {
    setLoadingApps(true);
    try {
      const res = await apiCall("get_hidden_apps", { target_user_id: userId });
      setHiddenApps(res.hidden_apps || []);
    } catch {
      setHiddenApps([]);
    }
    setLoadingApps(false);
  };

  const handleSelectUser = (userId: string) => {
    setSelectedUser(userId);
    loadHiddenApps(userId);
  };

  const toggleApp = (appId: string) => {
    setHiddenApps(prev =>
      prev.includes(appId) ? prev.filter(a => a !== appId) : [...prev, appId]
    );
  };

  const handleSave = async () => {
    if (!selectedUser) return;
    setSaving(true);
    try {
      await apiCall("update_hidden_apps", undefined, {
        target_user_id: selectedUser,
        hidden_apps: hiddenApps,
      });
      toast.success("تم حفظ إعدادات التطبيقات");
    } catch (e: any) {
      toast.error(e.message);
    }
    setSaving(false);
  };

  const filteredUsers = users
    .filter(u => u.roles?.includes('admin'))
    .filter(u =>
      !userSearch || u.display_name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase())
    );

  const selectedUserInfo = users.find(u => u.user_id === selectedUser);

  return (
    <div className="rounded-2xl p-6 space-y-5" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
          <Eye className="h-6 w-6 text-purple-400" />
        </div>
        <div>
          <h3 className="font-bold text-lg" style={{ color: "var(--sa-text-primary)" }}>إدارة التطبيقات المرئية</h3>
          <p className="text-sm" style={{ color: "var(--sa-text-muted)" }}>
            إخفاء أو إظهار تطبيقات معينة لكل مستخدم
          </p>
        </div>
      </div>

      {/* User selector */}
      <div className="space-y-2">
        <label className="text-sm font-bold" style={{ color: "var(--sa-text-primary)" }}>اختر المستخدم</label>
        <div className="relative">
          <Search className="absolute right-3 top-2.5 h-4 w-4" style={{ color: "var(--sa-text-faint)" }} />
          <Input
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            placeholder="ابحث عن مستخدم..."
            className="pr-9"
            style={{ background: "var(--sa-input-bg)", borderColor: "var(--sa-input-border)", color: "var(--sa-text-primary)" }}
          />
        </div>
        {loading ? (
          <p className="text-sm" style={{ color: "var(--sa-text-muted)" }}>جاري التحميل...</p>
        ) : (
          <div className="max-h-36 overflow-y-auto space-y-1 rounded-lg p-1" style={{ background: "var(--sa-surface)" }}>
            {filteredUsers.map(u => (
              <button
                key={u.user_id}
                onClick={() => handleSelectUser(u.user_id)}
                className={`w-full text-right px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${
                  selectedUser === u.user_id ? "bg-purple-500/20 text-purple-400 font-medium" : ""
                }`}
                style={selectedUser !== u.user_id ? { color: "var(--sa-text-secondary)" } : undefined}
              >
                <span>{u.display_name || u.email}</span>
                <span className="text-[10px] font-mono" style={{ color: "var(--sa-text-faint)" }}>{u.email}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedUser && !loadingApps && (
        <div className="space-y-4 pt-2 border-t" style={{ borderColor: "var(--sa-divider)" }}>
          <p className="text-sm" style={{ color: "var(--sa-text-muted)" }}>
            التطبيقات لـ <strong style={{ color: "var(--sa-text-primary)" }}>{selectedUserInfo?.display_name}</strong>
            — أوقف التطبيقات الغير لازمة
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
            {MANAGEABLE_APPS.map(app => {
              const isHidden = hiddenApps.includes(app.id);
              return (
                <button
                  key={app.id}
                  onClick={() => toggleApp(app.id)}
                  className={`flex items-center gap-2 p-3 rounded-xl text-right transition-all border ${
                    isHidden
                      ? "border-red-500/30 bg-red-500/5 opacity-60"
                      : "border-emerald-500/30 bg-emerald-500/5"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-lg ${
                    isHidden ? "bg-red-500/10" : "bg-emerald-500/10"
                  }`}>
                    {app.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold" style={{ color: isHidden ? "#ef4444" : "var(--sa-text-primary)" }}>
                      {app.label}
                    </p>
                    <p className="text-[10px]" style={{ color: "var(--sa-text-faint)" }}>
                      {isHidden ? "🚫 مخفي" : "✅ مرئي"}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>

          <Button
            onClick={handleSave}
            disabled={saving}
            className="w-full bg-purple-500 hover:bg-purple-600 text-white h-10 font-bold gap-2"
          >
            {saving ? <><RefreshCw className="h-4 w-4 animate-spin" /> جاري الحفظ...</> : "💾 حفظ الإعدادات"}
          </Button>
        </div>
      )}

      {loadingApps && (
        <p className="text-sm text-center py-4" style={{ color: "var(--sa-text-muted)" }}>جاري التحميل...</p>
      )}
    </div>
  );
}

function SubscriptionsManager() {
  const [subs, setSubs] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
   const [editSub, setEditSub] = useState<any | null>(null);

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
    cancelled: { text: "ملغي", cls: "bg-gray-500/10 text-gray-400 border-gray-500/20" },
    suspended: { text: "موقوف", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
  };

   const openEdit = (sub: any) => {
     setEditSub(sub);
   };

   const saveEdit = async (payload: any) => {
     try {
       const res = await apiCall("update_subscription", undefined, payload);
       const cascaded = res?.cascaded_count ?? 0;
       const diffCount = res?.diff ? Object.keys(res.diff).length : 0;
       if (cascaded > 0) {
         toast.success(`تم تحديث الاشتراك (${diffCount} تغيير) — وتم مزامنة ${cascaded} عضو من الفريق`);
       } else {
         toast.success(`تم تحديث الاشتراك (${diffCount} تغيير)`);
       }
       loadData();
       return res;
     } catch (e: any) {
       toast.error(e.message);
       throw e;
     }
   };

  const filtered = subs.filter((s) =>
    !search || s.display_name?.toLowerCase().includes(search.toLowerCase()) || s.email?.toLowerCase().includes(search.toLowerCase())
  );

  const trialCount = subs.filter(s => s.status === "trial").length;
  const activeCount = subs.filter(s => s.status === "active").length;
  const expiredCount = subs.filter(s => s.status === "expired").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--sa-text-primary)" }}>
          <CreditCard className="h-5 w-5 text-amber-400" /> إدارة الاشتراكات
        </h2>
        <Button variant="ghost" size="sm" onClick={loadData} disabled={loading} style={{ color: "var(--sa-text-muted)" }}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-2xl bg-blue-500/5 border border-blue-500/10 p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{trialCount}</p>
          <p className="text-xs" style={{ color: "var(--sa-text-muted)" }}>تجريبي</p>
        </div>
        <div className="rounded-2xl bg-emerald-500/5 border border-emerald-500/10 p-4 text-center">
          <p className="text-2xl font-bold text-emerald-400">{activeCount}</p>
          <p className="text-xs" style={{ color: "var(--sa-text-muted)" }}>نشط</p>
        </div>
        <div className="rounded-2xl bg-red-500/5 border border-red-500/10 p-4 text-center">
          <p className="text-2xl font-bold text-red-400">{expiredCount}</p>
          <p className="text-xs" style={{ color: "var(--sa-text-muted)" }}>منتهي</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--sa-text-faint)" }} />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث بالاسم أو الإيميل..."
          className="pr-10" style={{ background: "var(--sa-input-bg)", borderColor: "var(--sa-input-border)", color: "var(--sa-text-primary)" }} />
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--sa-divider)" }}>
                <th className="text-right font-medium px-4 py-3" style={{ color: "var(--sa-text-muted)" }}>المستخدم</th>
                <th className="text-right font-medium px-4 py-3" style={{ color: "var(--sa-text-muted)" }}>الباقة</th>
                <th className="text-right font-medium px-4 py-3" style={{ color: "var(--sa-text-muted)" }}>الدورة</th>
                <th className="text-right font-medium px-4 py-3" style={{ color: "var(--sa-text-muted)" }}>الحالة</th>
                <th className="text-right font-medium px-4 py-3" style={{ color: "var(--sa-text-muted)" }}>انتهاء الفترة</th>
                <th className="text-center font-medium px-4 py-3" style={{ color: "var(--sa-text-muted)" }}>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((sub) => {
                const st = statusLabel[sub.status] || statusLabel.trial;
                return (
                  <tr key={sub.id} style={{ borderBottom: "1px solid var(--sa-divider)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sa-card-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-sm" style={{ color: "var(--sa-text-secondary)" }}>{sub.display_name}</p>
                        <p className="text-xs font-mono" style={{ color: "var(--sa-text-faint)" }}>{sub.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="text-[10px]" style={{ borderColor: "var(--sa-card-border)", color: "var(--sa-text-muted)" }}>
                        {sub.plans?.name || "—"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-xs" style={{ color: "var(--sa-text-muted)" }}>
                      {sub.billing_cycle === "annual" ? "سنوي" : "شهري"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={`text-[10px] ${st.cls}`}>{st.text}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums" style={{ color: "var(--sa-text-muted)" }}>
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
                <tr><td colSpan={6} className="text-center py-8" style={{ color: "var(--sa-text-faint)" }}>لا توجد اشتراكات</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <SubscriptionEditDialog
        sub={editSub}
        plans={plans as any}
        open={!!editSub}
        onClose={() => setEditSub(null)}
        onSave={saveEdit}
      />
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
      monthly_price: Number(editPrice), annual_discount_pct: Number(editDiscount),
      max_users: Number(editMaxUsers), max_companies: Number(editMaxCompanies),
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
      <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--sa-text-primary)" }}>
        <Settings className="h-5 w-5 text-amber-400" /> إعدادات المنصة
      </h2>

      <div className="flex gap-2 flex-wrap">
        {[
          { key: "plans", label: "الباقات", icon: Package },
          { key: "rates", label: "أسعار الصرف", icon: DollarSign },
          { key: "notifications", label: "الإشعارات", icon: Bell },
          { key: "maintenance", label: "الصيانة", icon: Server },
        ].map((t) => (
          <button key={t.key} onClick={() => setSettingsTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm transition-colors ${
              settingsTab === t.key ? "bg-amber-500/20 text-amber-400 font-medium" : ""
            }`}
            style={settingsTab !== t.key ? { background: "var(--sa-surface)", color: "var(--sa-text-muted)" } : undefined}>
            <t.icon className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>

      {settingsTab === "plans" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm" style={{ color: "var(--sa-text-muted)" }}>إدارة الباقات والأسعار</p>
            <Button variant="ghost" size="sm" onClick={loadPlans} disabled={loadingPlans} style={{ color: "var(--sa-text-muted)" }}>
              <RefreshCw className={`h-4 w-4 ${loadingPlans ? "animate-spin" : ""}`} />
            </Button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {dbPlans.map((plan) => (
              <div key={plan.id} className={`rounded-2xl p-6 space-y-4 relative ${!plan.is_active ? "opacity-50" : ""}`}
                style={{ background: "var(--sa-card-bg)", border: `1px solid ${plan.plan_key === "growth" ? "rgba(16,185,129,0.4)" : "var(--sa-card-border)"}` }}>
                {plan.plan_key === "growth" && (
                  <div className="absolute -top-3 right-4">
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-[10px]">⭐ الأكثر اختياراً</Badge>
                  </div>
                )}
                <div>
                  <h3 className="text-lg font-bold" style={{ color: "var(--sa-text-primary)" }}>{plan.name}</h3>
                  <p className="text-xs" style={{ color: "var(--sa-text-faint)" }}>{plan.name_ar}</p>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-3xl font-bold" style={{ color: "var(--sa-text-primary)" }}>₪{plan.monthly_price}</span>
                    <span className="text-sm" style={{ color: "var(--sa-text-muted)" }}>/شهر</span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: "var(--sa-text-muted)" }}>₪{Math.round(plan.monthly_price * 12 * (1 - plan.annual_discount_pct / 100))} سنوياً (خصم {plan.annual_discount_pct}%)</p>
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--sa-text-muted)" }}>المستخدمون</span>
                    <span style={{ color: "var(--sa-text-secondary)" }}>{plan.max_users === -1 ? "غير محدود" : plan.max_users}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span style={{ color: "var(--sa-text-muted)" }}>الشركات</span>
                    <span style={{ color: "var(--sa-text-secondary)" }}>{plan.max_companies === -1 ? "غير محدود" : plan.max_companies}</span>
                  </div>
                </div>
                <div className="pt-3 space-y-1.5" style={{ borderTop: "1px solid var(--sa-divider)" }}>
                  {((plan.features as any[]) || []).map((f: string) => (
                    <p key={f} className="text-xs flex items-center gap-1.5" style={{ color: "var(--sa-text-muted)" }}>
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

          {editingPlan && (
            <Dialog open={!!editingPlan} onOpenChange={() => setEditingPlan(null)}>
              <DialogContent style={{ background: "var(--sa-dialog-bg)", borderColor: "var(--sa-dialog-border)", color: "var(--sa-text-primary)" }}>
                <DialogHeader>
                  <DialogTitle style={{ color: "var(--sa-text-primary)" }}>تعديل باقة {editingPlan.name}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  {[
                    { label: "السعر الشهري (₪)", value: editPrice, setter: setEditPrice },
                    { label: "نسبة خصم السنوي (%)", value: editDiscount, setter: setEditDiscount },
                    { label: "عدد المستخدمين (-1 = غير محدود)", value: editMaxUsers, setter: setEditMaxUsers },
                    { label: "عدد الشركات (-1 = غير محدود)", value: editMaxCompanies, setter: setEditMaxCompanies },
                  ].map(f => (
                    <div key={f.label}>
                      <label className="text-xs block mb-1" style={{ color: "var(--sa-text-muted)" }}>{f.label}</label>
                      <Input value={f.value} onChange={e => f.setter(e.target.value)} type="number"
                        style={{ background: "var(--sa-input-bg)", borderColor: "var(--sa-input-border)", color: "var(--sa-text-primary)" }} />
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setEditingPlan(null)} style={{ color: "var(--sa-text-muted)" }}>إلغاء</Button>
                  <Button onClick={savePlan} className="bg-amber-500 hover:bg-amber-600 text-black">حفظ التعديلات</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      )}

      {settingsTab === "rates" && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
          <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--sa-divider)" }}>
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--sa-text-primary)" }}>
              💱 أسعار الصرف مقابل الشيكل
            </h3>
            <Button size="sm" variant="ghost" className="text-amber-400 h-7 text-xs">
              <RefreshCw className="h-3 w-3 ml-1" /> تحديث من API
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--sa-divider)" }}>
                <th className="text-right font-medium px-5 py-3" style={{ color: "var(--sa-text-muted)" }}>العملة</th>
                <th className="text-right font-medium px-5 py-3" style={{ color: "var(--sa-text-muted)" }}>السعر (₪)</th>
                <th className="text-right font-medium px-5 py-3" style={{ color: "var(--sa-text-muted)" }}>تحديث تلقائي</th>
              </tr>
            </thead>
            <tbody>
              {currencies.map((c) => (
                <tr key={c.code} style={{ borderBottom: "1px solid var(--sa-divider)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sa-card-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                  <td className="px-5 py-3">
                    <span className="text-lg ml-2">{c.flag}</span>
                    <span className="font-medium" style={{ color: "var(--sa-text-secondary)" }}>{c.name}</span>
                    <span className="text-xs mr-2" style={{ color: "var(--sa-text-faint)" }}>({c.code})</span>
                  </td>
                  <td className="px-5 py-3">
                    <Input defaultValue={c.rate} className="w-24 h-8 text-xs inline-block"
                      style={{ background: "var(--sa-input-bg)", borderColor: "var(--sa-input-border)", color: "var(--sa-text-primary)" }} />
                  </td>
                  <td className="px-5 py-3">
                    <Badge className={`text-[10px] border-0 ${c.auto ? "bg-emerald-500/10 text-emerald-400" : "bg-gray-500/10 text-gray-400"}`}>
                      {c.auto ? "☑ مفعّل" : "☐ يدوي"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {settingsTab === "notifications" && (
        <div className="space-y-4">
          <div className="rounded-2xl p-5 space-y-4" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
            <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--sa-text-primary)" }}>
              <Bell className="h-4 w-4 text-amber-400" /> إعدادات التنبيهات
            </h3>
            {[
              { label: "تسجيل مستخدم جديد", desc: "تنبيه عند إنشاء حساب جديد", enabled: true },
              { label: "محاولة دخول فاشلة (3+)", desc: "تنبيه عند فشل تسجيل الدخول متكرر", enabled: true },
              { label: "انتهاء اشتراك", desc: "تنبيه قبل 7 أيام من انتهاء الباقة", enabled: true },
              { label: "إغلاق وردية بمبلغ عالي", desc: "تنبيه عند إغلاق وردية تتجاوز ₪10,000", enabled: false },
              { label: "حذف بيانات", desc: "تنبيه عند حذف سجلات مهمة", enabled: true },
            ].map((notif) => (
              <div key={notif.label} className="flex items-center justify-between py-2 last:border-0" style={{ borderBottom: "1px solid var(--sa-divider)" }}>
                <div>
                  <p className="text-sm" style={{ color: "var(--sa-text-secondary)" }}>{notif.label}</p>
                  <p className="text-[11px]" style={{ color: "var(--sa-text-faint)" }}>{notif.desc}</p>
                </div>
                <Badge className={`text-[10px] border-0 cursor-pointer ${notif.enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-gray-500/10 text-gray-400"}`}>
                  {notif.enabled ? "مفعّل" : "معطّل"}
                </Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {settingsTab === "maintenance" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl p-5 space-y-4" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--sa-text-primary)" }}>
                <Server className="h-4 w-4 text-amber-400" /> وضع الصيانة
              </h3>
              <p className="text-xs" style={{ color: "var(--sa-text-muted)" }}>عند التفعيل، سيظهر للمستخدمين رسالة "النظام تحت الصيانة"</p>
              <Button
                onClick={() => {
                  setMaintenanceMode(!maintenanceMode);
                  toast.success(maintenanceMode ? "تم إلغاء وضع الصيانة" : "تم تفعيل وضع الصيانة");
                }}
                className={`w-full ${maintenanceMode ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
                style={!maintenanceMode ? { background: "var(--sa-surface)", color: "var(--sa-text-primary)" } : undefined}>
                {maintenanceMode ? "🔴 إيقاف الصيانة" : "⚙️ تفعيل وضع الصيانة"}
              </Button>
            </div>

            <div className="rounded-2xl p-5 space-y-4" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--sa-text-primary)" }}>
                <HardDrive className="h-4 w-4 text-amber-400" /> النسخ الاحتياطي
              </h3>
              <div className="space-y-2">
                {[
                  { label: "آخر نسخة", value: "منذ ساعتين" },
                  { label: "الحجم الكلي", value: "~45 MB" },
                ].map(i => (
                  <div key={i.label} className="flex justify-between text-sm">
                    <span style={{ color: "var(--sa-text-muted)" }}>{i.label}</span>
                    <span className="text-xs" style={{ color: "var(--sa-text-secondary)" }}>{i.value}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm">
                  <span style={{ color: "var(--sa-text-muted)" }}>تكرار تلقائي</span>
                  <Badge className="bg-emerald-500/10 text-emerald-400 border-0 text-[10px]">كل 6 ساعات</Badge>
                </div>
              </div>
              <Button className="w-full" style={{ background: "var(--sa-surface)", color: "var(--sa-text-primary)" }}
                onClick={() => toast.success("جاري إنشاء نسخة احتياطية...")}>
                <HardDrive className="h-4 w-4 ml-1" /> نسخة احتياطية الآن
              </Button>
            </div>

            <div className="rounded-2xl p-5 space-y-4 md:col-span-2" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--sa-text-primary)" }}>
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
                    <p className="text-[11px]" style={{ color: "var(--sa-text-faint)" }}>{info.label}</p>
                    <p className="text-sm font-medium" style={{ color: "var(--sa-text-secondary)" }}>{info.value}</p>
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
    try { const res = await apiCall("revenue_stats"); setData(res); } catch (e: any) { toast.error(e.message); }
    setLoading(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="h-6 w-6 animate-spin text-amber-400" />
      </div>
    );
  }

  if (!data) return <p className="text-center py-12" style={{ color: "var(--sa-text-faint)" }}>فشل تحميل البيانات</p>;

  const maxBarRevenue = Math.max(...(data.monthly_trend || []).map((m: any) => m.revenue), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--sa-text-primary)" }}>
          <BarChart3 className="h-5 w-5 text-amber-400" /> إحصائيات الإيرادات
        </h2>
        <Button variant="ghost" size="sm" onClick={loadStats} disabled={loading} style={{ color: "var(--sa-text-muted)" }}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: DollarSign, label: "MRR", value: `₪${data.mrr?.toLocaleString()}`, sub: "الإيراد الشهري المتكرر", cls: "from-emerald-500/10 to-emerald-600/5 border-emerald-500/20", tcls: "text-emerald-400" },
          { icon: TrendingUp, label: "ARR", value: `₪${data.arr?.toLocaleString()}`, sub: "الإيراد السنوي المتكرر", cls: "from-blue-500/10 to-blue-600/5 border-blue-500/20", tcls: "text-blue-400" },
          { icon: Users, label: "المشتركون النشطون", value: data.active_subscribers, sub: `من أصل ${data.total_subscribers} إجمالي`, cls: "from-amber-500/10 to-amber-600/5 border-amber-500/20", tcls: "text-amber-400" },
          { icon: CalendarDays, label: "تجريبي", value: data.trial_subscribers, sub: "في فترة تجريبية", cls: "from-purple-500/10 to-purple-600/5 border-purple-500/20", tcls: "text-purple-400" },
        ].map(kpi => (
          <div key={kpi.label} className={`rounded-2xl bg-gradient-to-br ${kpi.cls} border p-5 space-y-2`}>
            <div className="flex items-center gap-2">
              <kpi.icon className={`h-5 w-5 ${kpi.tcls}`} />
              <span className="text-sm" style={{ color: "var(--sa-text-muted)" }}>{kpi.label}</span>
            </div>
            <p className={`text-3xl font-bold ${kpi.tcls}`}>{kpi.value}</p>
            <p className="text-[11px]" style={{ color: "var(--sa-text-faint)" }}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "شهري / سنوي", value: `${data.monthly_count} / ${data.annual_count}`, tcls: "" },
          { label: "إلغاءات (30 يوم)", value: data.recent_cancelled, tcls: "text-red-400", icon: ArrowDownRight },
          { label: "تنتهي قريباً (7 أيام)", value: data.expiring_soon, tcls: "text-amber-400" },
          { label: "معدل التحويل", value: `${data.total_subscribers > 0 ? Math.round((data.converted_from_trial / data.total_subscribers) * 100) : 0}%`, tcls: "text-emerald-400", icon: ArrowUpRight },
        ].map(s => (
          <div key={s.label} className="rounded-2xl p-4 text-center space-y-1" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
            <p className="text-xs" style={{ color: "var(--sa-text-muted)" }}>{s.label}</p>
            <p className={`text-lg font-bold flex items-center justify-center gap-1 ${s.tcls}`} style={!s.tcls ? { color: "var(--sa-text-primary)" } : undefined}>
              {s.icon && <s.icon className="h-4 w-4" />} {s.value}
            </p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl p-5 space-y-4" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--sa-text-primary)" }}>
            <BarChart3 className="h-4 w-4 text-amber-400" /> الاتجاه الشهري (آخر 6 أشهر)
          </h3>
          <div className="space-y-3">
            {(data.monthly_trend || []).map((m: any) => (
              <div key={m.month} className="flex items-center gap-3">
                <span className="text-xs w-16 shrink-0 font-mono" style={{ color: "var(--sa-text-muted)" }}>{m.month}</span>
                <div className="flex-1 h-7 rounded-lg overflow-hidden relative" style={{ background: "var(--sa-surface)" }}>
                  <div className="h-full bg-gradient-to-r from-amber-500/40 to-amber-400/20 rounded-lg transition-all"
                    style={{ width: `${Math.max((m.revenue / maxBarRevenue) * 100, 2)}%` }} />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px]" style={{ color: "var(--sa-text-muted)" }}>
                    ₪{m.revenue.toLocaleString()} · {m.count} مشترك
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl p-5 space-y-4" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--sa-text-primary)" }}>
            <PieChart className="h-4 w-4 text-amber-400" /> الإيرادات حسب الباقة
          </h3>
          {(data.revenue_by_plan || []).length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: "var(--sa-text-faint)" }}>لا توجد بيانات بعد</p>
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
                        <span className="text-sm font-medium" style={{ color: "var(--sa-text-secondary)" }}>{p.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge className={`text-[10px] border-0 ${bgColors[i % 3]}`}>{p.count} مشترك</Badge>
                        <span className="text-sm font-mono" style={{ color: "var(--sa-text-muted)" }}>₪{p.revenue.toLocaleString()}/شهر</span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--sa-surface)" }}>
                      <div className={`h-full bg-gradient-to-r ${colors[i % 3]} rounded-full opacity-60`}
                        style={{ width: `${data.mrr > 0 ? (p.revenue / data.mrr) * 100 : 0}%` }} />
                    </div>
                  </div>
                );
              })}
              <div className="pt-3" style={{ borderTop: "1px solid var(--sa-divider)" }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: "var(--sa-text-muted)" }}>إجمالي MRR</span>
                  <span className="text-lg font-bold" style={{ color: "var(--sa-text-primary)" }}>₪{data.mrr?.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-2xl p-5 space-y-4 lg:col-span-2" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
          <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--sa-text-primary)" }}>
            <Activity className="h-4 w-4 text-amber-400" /> توزيع حالات الاشتراكات
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {Object.entries(data.status_breakdown || {}).map(([status, count]) => {
              const styles: Record<string, { bg: string; text: string; label: string }> = {
                trial: { bg: "bg-blue-500/10 border-blue-500/20", text: "text-blue-400", label: "تجريبي" },
                active: { bg: "bg-emerald-500/10 border-emerald-500/20", text: "text-emerald-400", label: "نشط" },
                expired: { bg: "bg-red-500/10 border-red-500/20", text: "text-red-400", label: "منتهي" },
                cancelled: { bg: "bg-gray-500/10 border-gray-500/20", text: "text-gray-400", label: "ملغي" },
                suspended: { bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400", label: "موقوف" },
              };
              const s = styles[status] || styles.cancelled;
              return (
                <div key={status} className={`rounded-xl border p-4 text-center ${s.bg}`}>
                  <p className={`text-2xl font-bold ${s.text}`}>{count as number}</p>
                  <p className="text-xs mt-1" style={{ color: "var(--sa-text-muted)" }}>{s.label}</p>
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
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    return (localStorage.getItem("sa-theme") as "dark" | "light") || "light";
  });

  // Dashboard state
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentActivity, setRecentActivity] = useState<AuditLog[]>([]);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  // Users state
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [portalMembers, setPortalMembers] = useState<Record<string, { id: string; full_name: string; email: string | null; username: string; role: string; is_active: boolean; last_login: string | null }[]>>({});

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

  // Theme toggle
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("sa-theme", next);
  };

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
    } catch (e: any) { toast.error(e.message); }
    setLoadingDashboard(false);
  }, []);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const res = await apiCall("users");
      setUsers(res.users || []);
      // Load portal members for all users
      const { data: portalData } = await supabase
        .from("malaki_portal_users")
        .select("id, full_name, email, username, role, is_active, last_login, user_id")
        .order("created_at");
      if (portalData) {
        const grouped: typeof portalMembers = {};
        portalData.forEach((m: any) => {
          if (m.user_id) {
            if (!grouped[m.user_id]) grouped[m.user_id] = [];
            grouped[m.user_id].push(m);
          }
        });
        setPortalMembers(grouped);
      }
    } catch (e: any) { toast.error(e.message); }
    setLoadingUsers(false);
  }, []);

  const loadAuditLogs = useCallback(async (page = 0) => {
    setLoadingAudit(true);
    try {
      const res = await apiCall("audit_logs", { page: String(page) });
      setAuditLogs(res.logs || []);
      setAuditTotal(res.total || 0);
      setAuditPage(page);
    } catch (e: any) { toast.error(e.message); }
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
      open: true, title: `تعليق ${name}`,
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
    const newPw = prompt(`أدخل كلمة المرور الجديدة لـ ${name} (3 أحرف على الأقل):`);
    if (!newPw || newPw.length < 3) { toast.error("كلمة مرور قصيرة جداً"); return; }
    setPwDialog({
      open: true, title: `إعادة تعيين كلمة مرور ${name}`,
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
      await apiCall("delete_user", undefined, { user_id: deleteDialog.userId, confirmation: "DELETE" });
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

  const { owners, subUsersMap, standaloneUsers, companyCount } = useMemo(() => {
    const ownerSet = new Set<string>();
    const subMap = new Map<string, UserRecord[]>();
    const standalone: UserRecord[] = [];

    const inviterIds = new Set(
      filteredUsers.filter(u => u.invited_by).map(u => u.invited_by!)
    );

    filteredUsers.forEach(u => {
      if (u.invited_by && filteredUsers.some(o => o.user_id === u.invited_by)) {
        const existing = subMap.get(u.invited_by!) || [];
        existing.push(u);
        subMap.set(u.invited_by!, existing);
      } else if (inviterIds.has(u.user_id)) {
        ownerSet.add(u.user_id);
      } else if (u.company_id) {
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

    const ownerUsers = filteredUsers.filter(u => ownerSet.has(u.user_id) || subMap.has(u.user_id));
    
    // Count unique companies: each owner is a company, plus standalone admins with unique company_id or without
    const companyIds = new Set<string>();
    ownerUsers.forEach(u => { if (u.company_id) companyIds.add(u.company_id); else companyIds.add(u.user_id); });
    standalone.forEach(u => {
      const roles = (u as any).roles || [];
      const isAdmin = roles.includes('admin') || roles.includes('super_admin');
      if (isAdmin || (!u.invited_by)) {
        if (u.company_id) companyIds.add(u.company_id); else companyIds.add(u.user_id);
      }
    });
    
    return { owners: ownerUsers, subUsersMap: subMap, standaloneUsers: standalone, companyCount: companyIds.size };
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
    view_dashboard: "عرض لوحة التحكم", view_users: "عرض المستخدمين",
    suspend_user: "تعليق مستخدم", unsuspend_user: "إلغاء التعليق",
    reset_password: "إعادة تعيين كلمة المرور", delete_user: "حذف مستخدم",
    verify_password: "تأكيد الهوية", view_table: "تصفح جدول",
    view_subscriptions: "عرض الاشتراكات", update_subscription: "تحديث اشتراك",
    assign_subscription: "تعيين اشتراك", view_revenue_stats: "عرض إحصائيات الإيرادات",
  };

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--sa-bg)" }} data-sa-theme={theme}>
        <style>{LIGHT_THEME_STYLES}</style>
        <RefreshCw className="h-8 w-8 animate-spin text-amber-400" />
      </div>
    );
  }
  if (!authorized) return null;

  // Helper for rendering user rows
  // Mobile card view for users
  const renderUserCard = (u: UserRecord, isSub = false) => (
    <div key={u.user_id + "-card"} className="p-3 space-y-2"
      style={{ borderBottom: "1px solid var(--sa-divider)", ...(isSub ? { borderRight: "3px solid rgba(0,180,216,0.15)", paddingRight: 8 } : {}) }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {!isSub && ((subUsersMap.get(u.user_id) || []).length > 0 || (portalMembers[u.user_id] || []).length > 0) && (
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform cursor-pointer ${expandedOwners.has(u.user_id) ? "" : "-rotate-90"}`}
              style={{ color: "var(--sa-text-muted)" }}
              onClick={() => toggleOwnerExpand(u.user_id)} />
          )}
          <div className={`${isSub ? "w-7 h-7" : "w-8 h-8"} rounded-xl flex items-center justify-center font-bold shrink-0`}
            style={{ background: isSub ? "var(--sa-surface)" : "var(--sa-logo-bg)", color: isSub ? "var(--sa-text-muted)" : "#00B4D8", fontSize: isSub ? 10 : 12 }}>
            {(u.display_name || "?")[0]}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`${isSub ? "text-[13px]" : "text-sm font-semibold"} truncate`} style={{ color: "var(--sa-text-secondary)" }}>{u.display_name || "—"}</span>
              {u.is_banned ? (
                <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[9px]">معلق</Badge>
              ) : (
                <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px]">نشط</Badge>
              )}
            </div>
            <p className="text-[11px] font-mono truncate" style={{ color: "var(--sa-text-muted)" }}>{u.email || "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          {u.is_banned ? (
            <Button size="icon" variant="ghost" onClick={() => handleUnsuspendUser(u.user_id, u.display_name)} className="h-7 w-7 text-emerald-400"><Unlock className="h-3.5 w-3.5" /></Button>
          ) : (
            <Button size="icon" variant="ghost" onClick={() => handleSuspendUser(u.user_id, u.display_name)} className="h-7 w-7 text-amber-400"><Lock className="h-3.5 w-3.5" /></Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => handleResetPassword(u.user_id, u.display_name)} className="h-7 w-7 text-blue-400"><KeyRound className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" onClick={() => setDeleteDialog({ open: true, userId: u.user_id, name: u.display_name })}
            className="h-7 w-7 text-red-400" disabled={u.roles.includes("super_admin")}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {u.roles.map((r) => (
          <Badge key={r} variant="outline" className={`text-[9px] ${
            r === "super_admin" ? "text-amber-400 border-amber-400/30" :
            r === "admin" ? "text-blue-400 border-blue-400/30" :
            r === "cashier" ? "text-purple-400 border-purple-400/20" :
            r === "accountant_senior" ? "text-cyan-400 border-cyan-400/20" : ""
          }`}
          style={{ borderColor: !["super_admin", "admin", "cashier", "accountant_senior"].includes(r) ? "var(--sa-card-border)" : undefined,
                   color: !["super_admin", "admin", "cashier", "accountant_senior"].includes(r) ? "var(--sa-text-muted)" : undefined }}>
            {r}
          </Badge>
        ))}
        {u.last_sign_in && <span className="text-[10px] mr-auto" style={{ color: "var(--sa-text-faint)" }}>{format(new Date(u.last_sign_in), "dd/MM HH:mm", { locale: ar })}</span>}
      </div>
    </div>
  );

  const renderUserRow = (u: UserRecord, isSub = false) => (
    <tr key={u.user_id}
      className={`transition-colors`}
      style={{
        borderBottom: "1px solid var(--sa-divider)",
        ...(isSub ? { borderRight: "3px solid rgba(0,180,216,0.15)" } : {}),
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sa-card-hover)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
      <td className="px-3 py-3 text-center">
        {!isSub && ((subUsersMap.get(u.user_id) || []).length > 0 || (portalMembers[u.user_id] || []).length > 0) ? (
          <ChevronDown className={`h-4 w-4 transition-transform inline-block cursor-pointer ${expandedOwners.has(u.user_id) ? "" : "-rotate-90"}`}
            style={{ color: "var(--sa-text-muted)" }}
            onClick={() => toggleOwnerExpand(u.user_id)} />
        ) : isSub ? null : (
          <span className="text-xs" style={{ color: "var(--sa-text-faint)" }}>—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5" style={isSub ? { paddingRight: 16 } : undefined}>
          {isSub && <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "var(--sa-text-faint)" }} />}
          <div className={`${isSub ? "w-7 h-7" : "w-9 h-9"} rounded-xl flex items-center justify-center font-bold`}
            style={{
              background: isSub ? "var(--sa-surface)" : "var(--sa-logo-bg)",
              color: isSub ? "var(--sa-text-muted)" : "#00B4D8",
              fontSize: isSub ? 10 : 12,
            }}>
            {(u.display_name || "?")[0]}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={`${isSub ? "text-[13px]" : "font-semibold"}`} style={{ color: "var(--sa-text-secondary)" }}>{u.display_name || "—"}</span>
              {!isSub && ((subUsersMap.get(u.user_id) || []).length > 0 || (portalMembers[u.user_id] || []).length > 0) && (
                <>
                  {(subUsersMap.get(u.user_id) || []).length > 0 && (
                    <Badge className="bg-[#00B4D8]/10 text-[#00B4D8] border-0 text-[9px] px-1.5">
                      {(subUsersMap.get(u.user_id) || []).length} عضو
                    </Badge>
                  )}
                  {(portalMembers[u.user_id] || []).length > 0 && (
                    <Badge className="bg-amber-500/10 text-amber-400 border-0 text-[9px] px-1.5">
                      {(portalMembers[u.user_id] || []).length} بوابة
                    </Badge>
                  )}
                </>
              )}
            </div>
            {u.company_name && (
              <span className="text-[11px]" style={{ color: "var(--sa-text-faint)" }}>{u.company_name}</span>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3 font-mono" style={{ color: "var(--sa-text-muted)", fontSize: isSub ? 11 : 12 }}>{u.email || "—"}</td>
      <td className="px-4 py-3">
        <div className="flex gap-1 flex-wrap">
          {u.roles.map((r) => (
            <Badge key={r} variant="outline" className={`text-[${isSub ? 9 : 10}px] ${
              r === "super_admin" ? "text-amber-400 border-amber-400/30" :
              r === "admin" ? "text-blue-400 border-blue-400/30" :
              r === "cashier" ? "text-purple-400 border-purple-400/20" :
              r === "accountant_senior" ? "text-cyan-400 border-cyan-400/20" :
              ""
            }`}
            style={{ borderColor: !["super_admin", "admin", "cashier", "accountant_senior"].includes(r) ? "var(--sa-card-border)" : undefined,
                     color: !["super_admin", "admin", "cashier", "accountant_senior"].includes(r) ? "var(--sa-text-muted)" : undefined }}>
              {r}
            </Badge>
          ))}
        </div>
      </td>
      <td className="px-4 py-3 text-xs" style={{ color: "var(--sa-text-muted)" }}>
        {u.last_sign_in ? format(new Date(u.last_sign_in), "dd/MM HH:mm", { locale: ar }) : "—"}
      </td>
      <td className="px-4 py-3">
        {u.is_banned ? (
          <Badge className={`bg-red-500/10 text-red-400 border-red-500/20 text-[${isSub ? 9 : 10}px]`}>معلق</Badge>
        ) : (
          <Badge className={`bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[${isSub ? 9 : 10}px]`}>نشط</Badge>
        )}
      </td>
      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-center gap-1">
          {u.is_banned ? (
            <Button size="icon" variant="ghost" onClick={() => handleUnsuspendUser(u.user_id, u.display_name)} className={`${isSub ? "h-6 w-6" : "h-7 w-7"} text-emerald-400 hover:bg-emerald-500/10`} title="إلغاء التعليق">
              <Unlock className={`${isSub ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
            </Button>
          ) : (
            <Button size="icon" variant="ghost" onClick={() => handleSuspendUser(u.user_id, u.display_name)} className={`${isSub ? "h-6 w-6" : "h-7 w-7"} text-amber-400 hover:bg-amber-500/10`} title="تعليق">
              <Lock className={`${isSub ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
            </Button>
          )}
          <Button size="icon" variant="ghost" onClick={() => handleResetPassword(u.user_id, u.display_name)} className={`${isSub ? "h-6 w-6" : "h-7 w-7"} text-blue-400 hover:bg-blue-500/10`} title="إعادة تعيين كلمة المرور">
            <KeyRound className={`${isSub ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setDeleteDialog({ open: true, userId: u.user_id, name: u.display_name })}
            className={`${isSub ? "h-6 w-6" : "h-7 w-7"} text-red-400 hover:bg-red-500/10`} title="حذف" disabled={u.roles.includes("super_admin")}>
            <Trash2 className={`${isSub ? "h-3 w-3" : "h-3.5 w-3.5"}`} />
          </Button>
        </div>
      </td>
    </tr>
  );

  return (
     <div className="min-h-screen" data-sa-theme={theme}
       style={{ background: "var(--sa-bg-gradient)", fontFamily: "Tajawal, sans-serif", paddingTop: "env(safe-area-inset-top, 0px)" }} dir="rtl">
      <style>{LIGHT_THEME_STYLES}</style>

      {/* Header */}
      <header className="sticky top-0 z-50" style={{
        background: "var(--sa-header-bg)",
        borderBottom: "1px solid var(--sa-header-border)",
        backdropFilter: "blur(16px)",
        height: 60,
      }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-full flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logos/amwali-mark-navy.png" alt="أموالي" className="w-8 h-8 sm:w-9 sm:h-9" />
            <h1 className="text-base sm:text-lg font-bold hidden sm:block" style={{ color: "var(--sa-text-primary)", fontFamily: "Tajawal, sans-serif" }}>AMWALI</h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] font-semibold" style={{ background: "#4A9EE8", color: "#0A2342" }}>
              Super Admin
            </span>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-3">
            <SignupNotificationsBell />
            <button onClick={toggleTheme}
              className="p-1.5 sm:p-2 rounded-lg transition-colors"
              style={{ background: "var(--sa-surface)", color: "var(--sa-text-muted)" }}
              title={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}>
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full" style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)" }}>
              <Wifi className="h-3 w-3 text-red-400" />
              <span className="text-[11px] text-red-400 font-medium">LIVE</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate("/apps")} style={{ color: "var(--sa-text-muted)" }} className="px-2 sm:px-3">
              <LogOut className="h-4 w-4 sm:ml-1" /> <span className="hidden sm:inline">خروج</span>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0 mb-4 sm:mb-6">
            <TabsList className="border p-1 flex-nowrap sm:flex-wrap h-auto gap-1 w-max sm:w-auto"
              style={{ background: "var(--sa-surface)", borderColor: "var(--sa-card-border)" }}>
              {[
                { value: "dashboard", icon: Activity, label: "لوحة التحكم" },
                { value: "users", icon: Users, label: "المستخدمون" },
                { value: "database", icon: Database, label: "قاعدة البيانات" },
                { value: "live", icon: Wifi, label: "مراقبة حية" },
                { value: "audit", icon: FileText, label: "سجل التدقيق" },
                { value: "user_security", icon: Shield, label: "السجل الأمني" },
                { value: "settings", icon: Settings, label: "إعدادات المنصة" },
                { value: "tools", icon: Zap, label: "أدوات" },
                { value: "subscriptions", icon: CreditCard, label: "الاشتراكات" },
                { value: "leads", icon: UserPlus, label: "زبائن سامي" },
                { value: "revenue", icon: BarChart3, label: "الإيرادات" },
              ].map(tab => (
                <TabsTrigger key={tab.value} value={tab.value} className="whitespace-nowrap text-xs sm:text-sm"
                  style={{
                    color: activeTab === tab.value ? "var(--sa-tab-active-text)" : "var(--sa-tab-inactive-text)",
                    background: activeTab === tab.value ? "var(--sa-tab-active-bg)" : "transparent",
                  }}>
                  <tab.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 ml-1" /> <span className="hidden sm:inline">{tab.label}</span><span className="sm:hidden">{tab.label}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* ─── DASHBOARD TAB ─── */}
          <TabsContent value="dashboard" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold" style={{ color: "var(--sa-text-primary)" }}>نظرة عامة</h2>
              <Button variant="ghost" size="sm" onClick={loadDashboard} disabled={loadingDashboard} style={{ color: "var(--sa-text-muted)" }}>
                <RefreshCw className={`h-4 w-4 ml-1 ${loadingDashboard ? "animate-spin" : ""}`} /> تحديث
              </Button>
            </div>

            {stats && (
              <div className="grid grid-cols-2 gap-2 sm:gap-4">
                <KPICard icon={Users} label="إجمالي الشركات" value={stats.total_users} sub={`+${stats.new_users_today} اليوم`} color="bg-[#00B4D8]/20 text-[#00B4D8]" accentColor="#00B4D8" />
                <KPICard icon={ShoppingCart} label="المستخدمون النشطون" value={stats.active_sessions} sub={`₪${stats.active_sessions_revenue.toLocaleString()}`} color="bg-[#4A9EE8]/20 text-[#4A9EE8]" accentColor="#4A9EE8" />
                <KPICard icon={DollarSign} label="القيود اليوم" value={`₪${stats.today_revenue.toLocaleString()}`} sub={`${stats.today_transactions} عملية`} color="bg-[#16A34A]/20 text-[#16A34A]" accentColor="#16A34A" />
                <KPICard icon={Database} label="تنبيهات النظام" value={stats.total_accounts} sub={`${stats.total_contacts} جهة اتصال`} color="bg-[#DC2626]/20 text-[#DC2626]" accentColor="#DC2626" />
              </div>
            )}

            {/* Recent Activity */}
            <div className="rounded-2xl overflow-hidden" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
              <div className="px-5 py-4 flex items-center gap-2" style={{ borderBottom: "1px solid var(--sa-divider)" }}>
                <Clock className="h-4 w-4 text-amber-400" />
                <h3 className="text-sm font-semibold" style={{ color: "var(--sa-text-primary)" }}>آخر الأحداث</h3>
              </div>
              <div className="max-h-[400px] overflow-y-auto">
                {recentActivity.length === 0 && (
                  <p className="text-center py-8 text-sm" style={{ color: "var(--sa-text-faint)" }}>لا توجد أحداث بعد</p>
                )}
                {recentActivity.map((log) => (
                  <div key={log.id} className="px-5 py-3 flex items-center gap-3 transition-colors"
                    style={{ borderBottom: "1px solid var(--sa-divider)" }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sa-card-hover)")}
                    onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--sa-surface)" }}>
                      <Activity className="h-3.5 w-3.5" style={{ color: "var(--sa-text-muted)" }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate" style={{ color: "var(--sa-text-secondary)" }}>{actionLabel[log.action] || log.action}</p>
                      {log.target_id && <p className="text-[11px] truncate" style={{ color: "var(--sa-text-faint)" }}>{log.target_type}: {log.target_id}</p>}
                    </div>
                    <span className="text-[11px] shrink-0 tabular-nums" style={{ color: "var(--sa-text-faint)" }}>
                      {format(new Date(log.created_at), "HH:mm:ss")}
                    </span>
                    {log.ip_address && (
                      <span className="text-[10px] shrink-0 font-mono" style={{ color: "var(--sa-text-faint)" }}>{log.ip_address.substring(0, 12)}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* ─── USERS TAB ─── */}
          <TabsContent value="users" className="space-y-4">
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--sa-text-faint)" }} />
                <Input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="بحث بالاسم أو الإيميل..."
                  className="pr-10 text-sm" style={{ background: "var(--sa-input-bg)", borderColor: "var(--sa-input-border)", color: "var(--sa-text-primary)" }} />
              </div>
              <Badge style={{ background: "var(--sa-surface)", color: "var(--sa-text-muted)" }} className="border-0 text-[10px] sm:text-xs whitespace-nowrap">
                {companyCount} شركة · {filteredUsers.length} مستخدم
              </Badge>
              <Button variant="ghost" size="sm" onClick={loadUsers} disabled={loadingUsers} style={{ color: "var(--sa-text-muted)" }}>
                <RefreshCw className={`h-4 w-4 ${loadingUsers ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {/* Mobile card view */}
            <div className="md:hidden rounded-2xl overflow-hidden" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
              {owners.map((owner) => {
                const subs = subUsersMap.get(owner.user_id) || [];
                const portalMems = portalMembers[owner.user_id] || [];
                const isExpanded = expandedOwners.has(owner.user_id);
                return (
                  <div key={owner.user_id + "-mc"}>
                    {renderUserCard(owner)}
                    {isExpanded && subs.map((sub) => renderUserCard(sub, true))}
                    {isExpanded && portalMems.length > 0 && (
                      <>
                        <div className="px-3 py-2 flex items-center gap-2" style={{ borderBottom: "1px solid var(--sa-divider)", background: "var(--sa-surface)" }}>
                          <LayoutDashboard className="h-3.5 w-3.5 text-amber-400" />
                          <span className="text-[11px] font-semibold" style={{ color: "var(--sa-text-muted)" }}>أعضاء بوابة الإدارة ({portalMems.length})</span>
                        </div>
                        {portalMems.map(pm => (
                          <div key={`portal-m-${pm.id}`} className="p-3 flex items-center gap-2"
                            style={{ borderBottom: "1px solid var(--sa-divider)", borderRight: "3px solid rgba(74,158,232,0.25)" }}>
                            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0"
                              style={{ background: "rgba(74,158,232,0.15)", color: "#4A9EE8" }}>{pm.full_name?.[0] || '?'}</div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[13px] truncate" style={{ color: "var(--sa-text-secondary)" }}>{pm.full_name}</span>
                                <Badge className="bg-amber-500/10 text-amber-400 border-0 text-[9px] px-1.5">بوابة</Badge>
                              </div>
                              <p className="text-[10px] font-mono truncate" style={{ color: "var(--sa-text-muted)" }}>{pm.email || pm.username}</p>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                );
              })}
              {standaloneUsers.map((u) => renderUserCard(u))}
              {filteredUsers.length === 0 && (
                <p className="text-center py-8 text-sm" style={{ color: "var(--sa-text-faint)" }}>لا توجد نتائج</p>
              )}
            </div>

            {/* Desktop table view */}
            <div className="hidden md:block rounded-2xl overflow-hidden" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--sa-divider)" }}>
                      {["", "المستخدم", "الإيميل", "الأدوار", "آخر دخول", "الحالة", "إجراءات"].map((h, i) => (
                        <th key={i} className={`${i === 0 ? "w-8" : ""} ${i === 6 ? "text-center" : "text-right"} font-medium px-4 py-3`}
                          style={{ color: "var(--sa-text-muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {owners.map((owner) => {
                      const subs = subUsersMap.get(owner.user_id) || [];
                      const portalMems = portalMembers[owner.user_id] || [];
                      const isExpanded = expandedOwners.has(owner.user_id);
                      return (
                        <>{renderUserRow(owner)}
                          {isExpanded && subs.map((sub) => renderUserRow(sub, true))}
                          {isExpanded && portalMems.length > 0 && (
                            <>
                              <tr style={{ borderBottom: "1px solid var(--sa-divider)" }}>
                                <td></td>
                                <td colSpan={6} className="px-4 py-2" style={{ paddingRight: 32 }}>
                                  <div className="flex items-center gap-2">
                                    <LayoutDashboard className="h-3.5 w-3.5 text-amber-400" />
                                    <span className="text-xs font-semibold" style={{ color: "var(--sa-text-muted)" }}>
                                      أعضاء بوابة الإدارة ({portalMems.length})
                                    </span>
                                  </div>
                                </td>
                              </tr>
                              {portalMems.map(pm => (
                                <tr key={`portal-${pm.id}`}
                                  style={{
                                    borderBottom: "1px solid var(--sa-divider)",
                                    borderRight: "3px solid rgba(74,158,232,0.25)",
                                  }}
                                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sa-card-hover)")}
                                  onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                                  <td></td>
                                  <td className="px-4 py-2.5" style={{ paddingRight: 40 }}>
                                    <div className="flex items-center gap-2">
                                      <div className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold"
                                        style={{ background: "rgba(74,158,232,0.15)", color: "#4A9EE8" }}>
                                        {pm.full_name?.[0] || '?'}
                                      </div>
                                      <div>
                                        <span className="text-[13px]" style={{ color: "var(--sa-text-secondary)" }}>{pm.full_name}</span>
                                        <Badge className="bg-amber-500/10 text-amber-400 border-0 text-[9px] px-1.5 mr-2">بوابة</Badge>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 font-mono text-[11px]" style={{ color: "var(--sa-text-muted)" }}>{pm.email || pm.username}</td>
                                  <td className="px-4 py-2.5">
                                    <Badge variant="outline" className="text-[9px]" style={{ color: "var(--sa-text-muted)", borderColor: "var(--sa-card-border)" }}>
                                      {pm.role === 'owner' ? 'مالك' : pm.role === 'manager' ? 'مدير' : 'مشاهد'}
                                    </Badge>
                                  </td>
                                  <td className="px-4 py-2.5 text-xs" style={{ color: "var(--sa-text-muted)" }}>
                                    {pm.last_login ? format(new Date(pm.last_login), "dd/MM HH:mm", { locale: ar }) : "—"}
                                  </td>
                                  <td className="px-4 py-2.5">
                                    {pm.is_active ? (
                                      <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[9px]">نشط</Badge>
                                    ) : (
                                      <Badge className="bg-red-500/10 text-red-400 border-red-500/20 text-[9px]">معطل</Badge>
                                    )}
                                  </td>
                                  <td></td>
                                </tr>
                              ))}
                            </>
                          )}
                        </>
                      );
                    })}
                    {standaloneUsers.map((u) => renderUserRow(u))}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={7} className="text-center py-8" style={{ color: "var(--sa-text-faint)" }}>لا توجد نتائج</td></tr>
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
              <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--sa-text-primary)" }}>
                <Shield className="h-5 w-5 text-amber-400" /> سجل التدقيق
              </h2>
              <Button variant="ghost" size="sm" onClick={() => loadAuditLogs(0)} disabled={loadingAudit} style={{ color: "var(--sa-text-muted)" }}>
                <RefreshCw className={`h-4 w-4 ${loadingAudit ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {/* Mobile audit cards */}
            <div className="md:hidden rounded-2xl overflow-hidden" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
              {auditLogs.map((log) => (
                <div key={log.id} className="px-3 py-2.5 space-y-1" style={{ borderBottom: "1px solid var(--sa-divider)" }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: "var(--sa-text-secondary)" }}>{actionLabel[log.action] || log.action}</span>
                    <span className="text-[10px] tabular-nums font-mono" style={{ color: "var(--sa-text-faint)" }}>{format(new Date(log.created_at), "HH:mm:ss")}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    {log.target_id && <p className="text-[10px] font-mono truncate flex-1" style={{ color: "var(--sa-text-muted)" }}>{log.target_type}: {log.target_id.substring(0, 18)}...</p>}
                    {log.ip_address && <span className="text-[10px] font-mono shrink-0" style={{ color: "var(--sa-text-faint)" }}>{log.ip_address.substring(0, 12)}</span>}
                  </div>
                </div>
              ))}
              {auditLogs.length === 0 && (
                <p className="text-center py-8 text-sm" style={{ color: "var(--sa-text-faint)" }}>لا توجد سجلات</p>
              )}
            </div>

            {/* Desktop audit table */}
            <div className="hidden md:block rounded-2xl overflow-hidden" style={{ background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" }}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--sa-divider)" }}>
                      {["التاريخ", "الإجراء", "الهدف", "IP"].map(h => (
                        <th key={h} className="text-right font-medium px-4 py-3" style={{ color: "var(--sa-text-muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: "1px solid var(--sa-divider)" }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--sa-card-hover)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                        <td className="px-4 py-3 tabular-nums text-xs font-mono" style={{ color: "var(--sa-text-muted)" }}>
                          {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss")}
                        </td>
                        <td className="px-4 py-3" style={{ color: "var(--sa-text-secondary)" }}>{actionLabel[log.action] || log.action}</td>
                        <td className="px-4 py-3 text-xs font-mono truncate max-w-[200px]" style={{ color: "var(--sa-text-muted)" }}>
                          {log.target_id ? `${log.target_type}: ${log.target_id}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono" style={{ color: "var(--sa-text-faint)" }}>{log.ip_address || "—"}</td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr><td colSpan={4} className="text-center py-8" style={{ color: "var(--sa-text-faint)" }}>لا توجد سجلات</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {auditTotal > 50 && (
                <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: "1px solid var(--sa-divider)" }}>
                  <span className="text-xs" style={{ color: "var(--sa-text-faint)" }}>{auditTotal} سجل</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" disabled={auditPage === 0} onClick={() => loadAuditLogs(auditPage - 1)} style={{ color: "var(--sa-text-muted)" }}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <span className="text-xs flex items-center" style={{ color: "var(--sa-text-muted)" }}>صفحة {auditPage + 1}</span>
                    <Button size="sm" variant="ghost" disabled={(auditPage + 1) * 50 >= auditTotal} onClick={() => loadAuditLogs(auditPage + 1)} style={{ color: "var(--sa-text-muted)" }}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="user_security" className="space-y-4">
            <UserSecurityAuditTab
              cardBg="var(--sa-card-bg)"
              cardBorder="var(--sa-card-border)"
              divider="var(--sa-divider)"
              textPrimary="var(--sa-text-primary)"
              textSecondary="var(--sa-text-secondary)"
              textMuted="var(--sa-text-muted)"
              textFaint="var(--sa-text-faint)"
              cardHover="var(--sa-card-hover)"
            />
          </TabsContent>

          <TabsContent value="subscriptions">
            <SubscriptionsManager />
          </TabsContent>

          <TabsContent value="settings">
            <PlatformSettings />
          </TabsContent>

          <TabsContent value="tools" className="space-y-6">
            <ResetTransactionsTool />
            <AppVisibilityManager />
          </TabsContent>

          <TabsContent value="revenue">
            <RevenueReports />
          </TabsContent>
          <TabsContent value="leads">
            <SamiLeadsPanel />
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
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-500">
              <AlertTriangle className="h-5 w-5" /> حذف مستخدم نهائياً
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600">أنت على وشك حذف <strong className="text-gray-900">{deleteDialog.name}</strong> نهائياً. هذا الإجراء لا يمكن التراجع عنه.</p>
            <p className="text-sm text-gray-600">اكتب <strong className="text-red-500 font-mono">DELETE</strong> للتأكيد:</p>
            <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE"
              className="font-mono text-center bg-gray-50 border-gray-300 text-gray-900" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setDeleteDialog({ open: false, userId: "", name: "" }); setDeleteConfirmText(""); }} className="text-gray-500">إلغاء</Button>
            <Button onClick={handleDeleteUser} disabled={deleteConfirmText !== "DELETE"} className="bg-red-500 hover:bg-red-600 text-white">
              حذف نهائي
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
