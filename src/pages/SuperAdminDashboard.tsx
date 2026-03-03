import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  Crown, Users, ShoppingCart, DollarSign, Activity, Shield, Clock,
  Lock, Unlock, Trash2, KeyRound, Eye, RefreshCw, AlertTriangle,
  ChevronLeft, ChevronRight, Search, X, LogOut, Database, FileText,
  TrendingUp, Wifi,
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
};

const API_BASE = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/super-admin-api`;

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
function KPICard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string | number; sub?: string; color: string;
}) {
  return (
    <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5 space-y-3 hover:bg-white/[0.05] transition-colors">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
          <Icon className="h-5 w-5" />
        </div>
        <span className="text-white/40 text-sm">{label}</span>
      </div>
      <div className="text-3xl font-bold text-white tabular-nums">{value}</div>
      {sub && <p className="text-xs text-white/30">{sub}</p>}
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

  const filteredUsers = users.filter((u) =>
    !userSearch || (u.display_name?.toLowerCase().includes(userSearch.toLowerCase()) || u.email?.toLowerCase().includes(userSearch.toLowerCase()))
  );

  const actionLabel: Record<string, string> = {
    view_dashboard: "عرض لوحة التحكم",
    view_users: "عرض المستخدمين",
    suspend_user: "تعليق مستخدم",
    unsuspend_user: "إلغاء التعليق",
    reset_password: "إعادة تعيين كلمة المرور",
    delete_user: "حذف مستخدم",
    verify_password: "تأكيد الهوية",
    view_table: "تصفح جدول",
  };

  // ─── LOADING / UNAUTHORIZED ───
  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#080d18" }}>
        <RefreshCw className="h-8 w-8 animate-spin text-amber-400" />
      </div>
    );
  }
  if (!authorized) return null;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #080d18 0%, #0a1020 100%)", fontFamily: "'IBM Plex Sans Arabic', sans-serif" }} dir="rtl">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-[#080d18]/90 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 flex items-center justify-center">
              <Crown className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Super Admin Panel</h1>
              <p className="text-[11px] text-white/30">عبدالله AI للمحاسبة</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20">
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
          <TabsList className="bg-white/[0.03] border border-white/[0.06] p-1 mb-6">
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 text-white/40">
              <Activity className="h-4 w-4 ml-1" /> لوحة التحكم
            </TabsTrigger>
            <TabsTrigger value="users" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 text-white/40">
              <Users className="h-4 w-4 ml-1" /> المستخدمون
            </TabsTrigger>
            <TabsTrigger value="audit" className="data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-400 text-white/40">
              <FileText className="h-4 w-4 ml-1" /> سجل التدقيق
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
                <KPICard icon={Users} label="المستخدمون" value={stats.total_users} sub={`+${stats.new_users_today} اليوم`} color="bg-blue-500/20 text-blue-400" />
                <KPICard icon={ShoppingCart} label="الورديات المفتوحة" value={stats.active_sessions} sub={`₪${stats.active_sessions_revenue.toLocaleString()}`} color="bg-emerald-500/20 text-emerald-400" />
                <KPICard icon={DollarSign} label="إيرادات اليوم" value={`₪${stats.today_revenue.toLocaleString()}`} sub={`${stats.today_transactions} عملية`} color="bg-amber-500/20 text-amber-400" />
                <KPICard icon={Database} label="الحسابات" value={stats.total_accounts} sub={`${stats.total_contacts} جهة اتصال`} color="bg-purple-500/20 text-purple-400" />
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
              <Button variant="ghost" size="sm" onClick={loadUsers} disabled={loadingUsers} className="text-white/40">
                <RefreshCw className={`h-4 w-4 ${loadingUsers ? "animate-spin" : ""}`} />
              </Button>
            </div>

            <div className="rounded-2xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.06]">
                      <th className="text-right text-white/30 font-medium px-4 py-3">المستخدم</th>
                      <th className="text-right text-white/30 font-medium px-4 py-3">الإيميل</th>
                      <th className="text-right text-white/30 font-medium px-4 py-3">الأدوار</th>
                      <th className="text-right text-white/30 font-medium px-4 py-3">آخر دخول</th>
                      <th className="text-right text-white/30 font-medium px-4 py-3">الحالة</th>
                      <th className="text-center text-white/30 font-medium px-4 py-3">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.04]">
                    {filteredUsers.map((u) => (
                      <tr key={u.user_id} className="hover:bg-white/[0.02]">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-white/40 font-bold text-xs">
                              {(u.display_name || "?")[0]}
                            </div>
                            <span className="text-white/80 font-medium">{u.display_name || "—"}</span>
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
                            <Button
                              size="icon" variant="ghost"
                              onClick={() => setDeleteDialog({ open: true, userId: u.user_id, name: u.display_name })}
                              className="h-7 w-7 text-red-400 hover:bg-red-500/10" title="حذف"
                              disabled={u.roles.includes("super_admin")}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredUsers.length === 0 && (
                      <tr><td colSpan={6} className="text-center py-8 text-white/20">لا توجد نتائج</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
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
