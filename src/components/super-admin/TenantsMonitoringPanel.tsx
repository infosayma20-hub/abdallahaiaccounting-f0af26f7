import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  RefreshCw, Search, AlertTriangle, ArrowUpCircle, CheckCircle2,
  HardDrive, Activity, Server, Eye,
} from "lucide-react";

type TenantRow = {
  owner_id: string;
  company_id: string;
  company_name: string | null;
  plan_key: string | null;
  plan_name: string | null;
  sub_status: string | null;
  period_end: string | null;
  max_users: number | null;
  max_branches: number | null;
  max_invoices_per_month: number | null;
  users_count: number;
  branches_count: number;
  employees_count: number;
  contacts_count: number;
  pos_orders_count: number;
  invoices_count: number;
  transactions_count: number;
  last_activity: string | null;
  alert_level: "critical" | "warning" | "ok" | string;
  alert_reasons: string[] | null;
};

type PlatformHealth = {
  db_size_pretty?: string;
  db_size_bytes?: number;
  generated_at?: string;
  top_tables_by_size?: { table_name: string; total_pretty: string; live_rows: number }[];
  top_tables_by_writes?: { table_name: string; writes: number; live_rows: number }[];
  realtime_tables?: string[];
};

const LEVEL_META: Record<string, { label: string; bg: string; fg: string }> = {
  critical: { label: "يحتاج إجراء", bg: "rgba(220,38,38,0.12)", fg: "#DC2626" },
  warning: { label: "مراقبة", bg: "rgba(217,119,6,0.12)", fg: "#D97706" },
  ok: { label: "سليم", bg: "rgba(22,163,74,0.12)", fg: "#16A34A" },
};

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString("en-US");

const TenantsMonitoringPanel = () => {
  const [rows, setRows] = useState<TenantRow[]>([]);
  const [health, setHealth] = useState<PlatformHealth | null>(null);
  const [loading, setLoading] = useState(false);
  const [days, setDays] = useState(30);
  const [search, setSearch] = useState("");
  const [levelFilter, setLevelFilter] = useState<"all" | "critical" | "warning" | "ok">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tenantsRes, healthRes] = await Promise.all([
        supabase.rpc("get_tenants_usage_overview" as never, { _days: days } as never),
        supabase.rpc("get_platform_health_overview" as never),
      ]);
      if (tenantsRes.error) throw tenantsRes.error;
      setRows((tenantsRes.data as unknown as TenantRow[]) || []);
      if (!healthRes.error) setHealth((healthRes.data as unknown as PlatformHealth) || null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "تعذر تحميل بيانات المراقبة";
      toast.error(msg.includes("ACCESS_DENIED") ? "هذه الشاشة للمدير العام فقط" : msg);
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (levelFilter !== "all" && r.alert_level !== levelFilter) return false;
      if (!q) return true;
      return (r.company_name || "").toLowerCase().includes(q) || (r.plan_name || "").toLowerCase().includes(q);
    });
  }, [rows, search, levelFilter]);

  const counts = useMemo(() => ({
    critical: rows.filter((r) => r.alert_level === "critical").length,
    warning: rows.filter((r) => r.alert_level === "warning").length,
    ok: rows.filter((r) => r.alert_level === "ok").length,
  }), [rows]);

  const upgradeCandidates = useMemo(
    () => rows.filter((r) => (r.alert_reasons || []).some((x) => x.includes("حمل تشغيلي") || x.includes("تجاوز"))),
    [rows],
  );

  const cardStyle = { background: "var(--sa-card-bg)", border: "1px solid var(--sa-card-border)" };

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold" style={{ color: "var(--sa-text-primary)" }}>مراقبة المشتركين</h2>
          <p className="text-xs" style={{ color: "var(--sa-text-muted)" }}>
            شاشة قراءة فقط — لا تُعدّل أي بيانات. تُظهر حجم استخدام كل مشترك ومتى يحتاج ترقية أو موارد إضافية.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[7, 30, 90].map((d) => (
            <Button key={d} size="sm" variant={days === d ? "default" : "ghost"} onClick={() => setDays(d)}
              className="text-xs px-2.5" style={days !== d ? { color: "var(--sa-text-muted)" } : undefined}>
              {d} يوم
            </Button>
          ))}
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} style={{ color: "var(--sa-text-muted)" }}>
            <RefreshCw className={`h-4 w-4 ml-1 ${loading ? "animate-spin" : ""}`} /> تحديث
          </Button>
        </div>
      </div>

      {/* Alert summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <button onClick={() => setLevelFilter(levelFilter === "critical" ? "all" : "critical")}
          className="rounded-xl p-3 text-right transition-colors" style={cardStyle}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-xs" style={{ color: "var(--sa-text-muted)" }}>يحتاج إجراء</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "var(--sa-text-primary)" }}>{counts.critical}</div>
        </button>
        <button onClick={() => setLevelFilter(levelFilter === "warning" ? "all" : "warning")}
          className="rounded-xl p-3 text-right transition-colors" style={cardStyle}>
          <div className="flex items-center gap-2 mb-1">
            <Eye className="h-4 w-4 text-amber-500" />
            <span className="text-xs" style={{ color: "var(--sa-text-muted)" }}>تحت المراقبة</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "var(--sa-text-primary)" }}>{counts.warning}</div>
        </button>
        <div className="rounded-xl p-3" style={cardStyle}>
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpCircle className="h-4 w-4" style={{ color: "#4A9EE8" }} />
            <span className="text-xs" style={{ color: "var(--sa-text-muted)" }}>مرشّح للترقية</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "var(--sa-text-primary)" }}>{upgradeCandidates.length}</div>
        </div>
        <div className="rounded-xl p-3" style={cardStyle}>
          <div className="flex items-center gap-2 mb-1">
            <HardDrive className="h-4 w-4" style={{ color: "#16A34A" }} />
            <span className="text-xs" style={{ color: "var(--sa-text-muted)" }}>حجم قاعدة البيانات</span>
          </div>
          <div className="text-2xl font-bold" style={{ color: "var(--sa-text-primary)" }}>{health?.db_size_pretty || "—"}</div>
        </div>
      </div>

      {/* Search */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "var(--sa-text-faint)" }} />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث باسم المشترك أو الباقة..."
            className="pr-9 h-9 text-sm"
            style={{ background: "var(--sa-input-bg)", borderColor: "var(--sa-input-border)", color: "var(--sa-text-primary)" }} />
        </div>
        {levelFilter !== "all" && (
          <Button size="sm" variant="ghost" onClick={() => setLevelFilter("all")} style={{ color: "var(--sa-text-muted)" }}>
            إلغاء الفلتر
          </Button>
        )}
        <span className="text-xs" style={{ color: "var(--sa-text-muted)" }}>{filtered.length} مشترك</span>
      </div>

      {/* Table */}
      <div className="rounded-2xl overflow-hidden" style={cardStyle}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--sa-table-header-bg)" }}>
                {["المشترك", "الباقة", "الحالة", "المستخدمون", "الفروع", "الموظفون", "طلبات POS", "الفواتير", "القيود", "آخر نشاط", "التنبيه"].map((h) => (
                  <th key={h} className="px-3 py-2.5 text-right text-xs font-semibold whitespace-nowrap"
                    style={{ color: "var(--sa-text-secondary)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && rows.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-xs" style={{ color: "var(--sa-text-muted)" }}>جاري التحميل...</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-xs" style={{ color: "var(--sa-text-muted)" }}>لا توجد نتائج</td></tr>
              )}
              {filtered.map((r) => {
                const meta = LEVEL_META[r.alert_level] || LEVEL_META.ok;
                const isOpen = expanded === r.company_id;
                return (
                  <>
                    <tr key={r.company_id} onClick={() => setExpanded(isOpen ? null : r.company_id)}
                      className="cursor-pointer transition-colors"
                      style={{ borderTop: "1px solid var(--sa-divider)" }}>
                      <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: "var(--sa-text-primary)" }}>
                        {r.company_name || "—"}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--sa-text-secondary)" }}>{r.plan_name || r.plan_key || "—"}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-xs" style={{ color: "var(--sa-text-muted)" }}>{r.sub_status || "—"}</td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--sa-text-secondary)" }}>
                        {fmt(r.users_count)}{r.max_users ? <span style={{ color: "var(--sa-text-faint)" }}> / {r.max_users}</span> : null}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--sa-text-secondary)" }}>
                        {fmt(r.branches_count)}{r.max_branches ? <span style={{ color: "var(--sa-text-faint)" }}> / {r.max_branches}</span> : null}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--sa-text-secondary)" }}>{fmt(r.employees_count)}</td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--sa-text-secondary)" }}>{fmt(r.pos_orders_count)}</td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--sa-text-secondary)" }}>
                        {fmt(r.invoices_count)}{r.max_invoices_per_month ? <span style={{ color: "var(--sa-text-faint)" }}> / {r.max_invoices_per_month}</span> : null}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums" style={{ color: "var(--sa-text-secondary)" }}>{fmt(r.transactions_count)}</td>
                      <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={{ color: "var(--sa-text-muted)" }}>
                        {r.last_activity && !r.last_activity.startsWith("1970")
                          ? new Date(r.last_activity).toLocaleDateString("en-GB")
                          : "—"}
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge className="text-[11px] border-0" style={{ background: meta.bg, color: meta.fg }}>
                          {r.alert_level === "ok" ? <CheckCircle2 className="h-3 w-3 ml-1" /> : <AlertTriangle className="h-3 w-3 ml-1" />}
                          {meta.label}
                        </Badge>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr key={`${r.company_id}-d`} style={{ background: "var(--sa-surface)" }}>
                        <td colSpan={11} className="px-4 py-3">
                          {(r.alert_reasons || []).length === 0 ? (
                            <span className="text-xs" style={{ color: "var(--sa-text-muted)" }}>لا توجد ملاحظات — الاستخدام ضمن حدود الباقة.</span>
                          ) : (
                            <ul className="space-y-1">
                              {(r.alert_reasons || []).map((reason, i) => (
                                <li key={i} className="text-xs flex items-center gap-2" style={{ color: "var(--sa-text-secondary)" }}>
                                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.fg }} />
                                  {reason}
                                </li>
                              ))}
                            </ul>
                          )}
                          <div className="mt-2 text-[11px]" style={{ color: "var(--sa-text-faint)" }}>
                            جهات الاتصال: {fmt(r.contacts_count)}
                            {r.period_end ? ` • انتهاء الاشتراك: ${new Date(r.period_end).toLocaleDateString("en-GB")}` : ""}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Platform health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-2xl overflow-hidden" style={cardStyle}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--sa-divider)" }}>
            <HardDrive className="h-4 w-4" style={{ color: "#4A9EE8" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--sa-text-primary)" }}>أكبر الجداول حجماً</span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--sa-divider)" }}>
            {(health?.top_tables_by_size || []).slice(0, 8).map((t) => (
              <div key={t.table_name} className="px-4 py-2 flex items-center justify-between text-xs">
                <span style={{ color: "var(--sa-text-secondary)" }} dir="ltr">{t.table_name}</span>
                <span className="tabular-nums" style={{ color: "var(--sa-text-muted)" }}>
                  {t.total_pretty} • {fmt(t.live_rows)} صف
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-2xl overflow-hidden" style={cardStyle}>
          <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--sa-divider)" }}>
            <Activity className="h-4 w-4" style={{ color: "#D97706" }} />
            <span className="text-sm font-semibold" style={{ color: "var(--sa-text-primary)" }}>أكثر الجداول كتابة</span>
          </div>
          <div className="divide-y" style={{ borderColor: "var(--sa-divider)" }}>
            {(health?.top_tables_by_writes || []).slice(0, 8).map((t) => (
              <div key={t.table_name} className="px-4 py-2 flex items-center justify-between text-xs">
                <span style={{ color: "var(--sa-text-secondary)" }} dir="ltr">{t.table_name}</span>
                <span className="tabular-nums" style={{ color: "var(--sa-text-muted)" }}>{fmt(t.writes)} كتابة</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-[11px] px-1" style={{ color: "var(--sa-text-faint)" }}>
        <Server className="h-3 w-3" />
        البثّ الفوري مفعّل على {health?.realtime_tables?.length ?? 0} جدول
        {health?.generated_at ? ` • آخر تحديث: ${new Date(health.generated_at).toLocaleTimeString("en-GB")}` : ""}
      </div>
    </div>
  );
};

export default TenantsMonitoringPanel;
