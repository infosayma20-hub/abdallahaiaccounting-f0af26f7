import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useCrmLeads, useCrmOpportunities, useCrmActivities } from "./hooks/useCrmData";
import { useCsTickets, useCsCalls, useCsMeetings, useCsSubscriptions, useCsFeatureRequests } from "./hooks/useCsData";
import { STAGE_META, STAGES_ORDER, type CrmStage } from "./types";
import { TrendingUp, Users, Target, AlertCircle, CheckCircle2, XCircle, Clock, BarChart3, ArrowLeft, LifeBuoy, Phone, Calendar, Repeat, Lightbulb } from "lucide-react";

const KpiCard = ({
  label, value, sub, icon: Icon, color, bg, onClick,
}: {
  label: string; value: string | number; sub?: string;
  icon: any; color: string; bg: string; onClick?: () => void;
}) => (
  <button
    onClick={onClick}
    disabled={!onClick}
    className={`relative bg-white rounded-xl p-4 border border-slate-200 text-right ${onClick ? "hover:border-blue-300 hover:shadow-md transition-all cursor-pointer" : "cursor-default"}`}
  >
    <div className="flex items-start justify-between mb-3">
      <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: bg }}>
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      {onClick && <ArrowLeft className="h-3.5 w-3.5 text-slate-300" />}
    </div>
    <div className="text-[11px] text-slate-500 mb-1">{label}</div>
    <div className="text-xl font-bold text-slate-900">{value}</div>
    {sub && <div className="text-[10px] text-slate-400 mt-1">{sub}</div>}
  </button>
);

const fmt = (n: number) => new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n);
const today = () => new Date().toISOString().split("T")[0];
const startOfMonth = () => {
  const d = new Date(); d.setDate(1);
  return d.toISOString().split("T")[0];
};

export default function CrmDashboard() {
  const navigate = useNavigate();
  const { leads, loading: lLoad } = useCrmLeads();
  const { opportunities, loading: oLoad } = useCrmOpportunities();
  const { activities, loading: aLoad } = useCrmActivities();
  const { items: tickets } = useCsTickets();
  const { items: calls } = useCsCalls();
  const { items: meetings } = useCsMeetings();
  const { items: subs } = useCsSubscriptions();
  const { items: featureRequests } = useCsFeatureRequests();
  const loading = lLoad || oLoad || aLoad;

  const stats = useMemo(() => {
    const totalLeads = leads.length;
    const newLeads = leads.filter(l => l.status === "new").length;
    const qualifiedLeads = leads.filter(l => l.status === "qualified").length;

    const openOpps = opportunities.filter(o => !["won", "lost"].includes(o.stage));
    const openValue = openOpps.reduce((sum, o) => sum + Number(o.expected_value || 0), 0);
    const weightedValue = openOpps.reduce((sum, o) => sum + Number(o.weighted_value || 0), 0);

    const monthStart = startOfMonth();
    const wonThisMonth = opportunities.filter(o => o.stage === "won" && o.won_at && o.won_at >= monthStart);
    const lostThisMonth = opportunities.filter(o => o.stage === "lost" && o.lost_at && o.lost_at >= monthStart);
    const wonValue = wonThisMonth.reduce((sum, o) => sum + Number(o.expected_value || 0), 0);

    const closedDeals = opportunities.filter(o => ["won", "lost"].includes(o.stage));
    const conversionRate = closedDeals.length > 0
      ? (opportunities.filter(o => o.stage === "won").length / closedDeals.length) * 100
      : 0;

    const t = today();
    const dueToday = activities.filter(a => a.status === "pending" && a.due_date === t).length;
    const overdue = activities.filter(a => a.status === "pending" && a.due_date && a.due_date < t).length;

    // Pipeline by stage
    const byStage: Record<CrmStage, { count: number; value: number }> = {
      new: { count: 0, value: 0 }, contacted: { count: 0, value: 0 },
      qualified: { count: 0, value: 0 }, proposal: { count: 0, value: 0 },
      negotiation: { count: 0, value: 0 }, won: { count: 0, value: 0 },
      lost: { count: 0, value: 0 }, on_hold: { count: 0, value: 0 },
    };
    opportunities.forEach(o => {
      byStage[o.stage].count += 1;
      byStage[o.stage].value += Number(o.expected_value || 0);
    });

    // Lead sources
    const sourceMap: Record<string, number> = {};
    leads.forEach(l => {
      const s = l.source || "manual";
      sourceMap[s] = (sourceMap[s] || 0) + 1;
    });
    const topSources = Object.entries(sourceMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return {
      totalLeads, newLeads, qualifiedLeads,
      openOppsCount: openOpps.length, openValue, weightedValue,
      wonCount: wonThisMonth.length, lostCount: lostThisMonth.length, wonValue,
      conversionRate, dueToday, overdue, byStage, topSources,
    };
  }, [leads, opportunities, activities]);

  const cs = useMemo(() => {
    const t = today();
    const openTickets = tickets.filter((x) => !["resolved", "closed"].includes(x.status));
    const criticalTickets = openTickets.filter((x) => x.priority === "critical");
    const callsToday = calls.filter((c) => c.called_at.startsWith(t));
    const meetingsToday = meetings.filter((m) => m.meeting_date.startsWith(t));
    const renewals30 = subs.filter((s) => {
      const days = Math.ceil((new Date(s.renewal_date).getTime() - Date.now()) / 86400000);
      return days >= 0 && days <= 30;
    });
    const topFR = [...featureRequests].sort((a, b) => b.votes - a.votes).slice(0, 5);
    return { openTickets: openTickets.length, criticalTickets: criticalTickets.length, callsToday: callsToday.length, meetingsToday: meetingsToday.length, renewals30: renewals30.length, topFR };
  }, [tickets, calls, meetings, subs, featureRequests]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="إجمالي العملاء المحتملين" value={fmt(stats.totalLeads)}
          sub={`${stats.newLeads} جديد · ${stats.qualifiedLeads} مؤهل`}
          icon={Users} color="#0369A1" bg="#E0F2FE" onClick={() => navigate("/crm/leads")} />
        <KpiCard label="الفرص المفتوحة" value={fmt(stats.openOppsCount)}
          sub={`قيمة Pipeline: ${fmt(stats.openValue)} ₪`}
          icon={Target} color="#7C3AED" bg="#EDE9FE" onClick={() => navigate("/crm/pipeline")} />
        <KpiCard label="الإيراد المتوقع (مرجح)" value={`${fmt(stats.weightedValue)} ₪`}
          sub="Weighted Forecast"
          icon={TrendingUp} color="#15803D" bg="#DCFCE7" />
        <KpiCard label="نسبة التحويل" value={`${stats.conversionRate.toFixed(1)}%`}
          sub="من إجمالي الصفقات المغلقة"
          icon={BarChart3} color="#C2410C" bg="#FFEDD5" />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="فاز هذا الشهر" value={fmt(stats.wonCount)}
          sub={`بقيمة ${fmt(stats.wonValue)} ₪`}
          icon={CheckCircle2} color="#15803D" bg="#DCFCE7" />
        <KpiCard label="خسر هذا الشهر" value={fmt(stats.lostCount)}
          icon={XCircle} color="#B91C1C" bg="#FEE2E2" />
        <KpiCard label="متابعات اليوم" value={fmt(stats.dueToday)}
          icon={Clock} color="#0369A1" bg="#E0F2FE"
          onClick={() => navigate("/crm/activities")} />
        <KpiCard label="متابعات متأخرة" value={fmt(stats.overdue)}
          sub={stats.overdue > 0 ? "تحتاج اهتمام فوري" : "كله تمام ✓"}
          icon={AlertCircle} color={stats.overdue > 0 ? "#B91C1C" : "#15803D"}
          bg={stats.overdue > 0 ? "#FEE2E2" : "#DCFCE7"}
          onClick={() => navigate("/crm/activities")} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pipeline by stage */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-bold text-slate-900">خط سير المبيعات حسب المرحلة</h2>
            <button onClick={() => navigate("/crm/pipeline")} className="text-xs text-blue-600 hover:underline">
              عرض الخط الكامل ←
            </button>
          </div>
          <div className="space-y-2.5">
            {STAGES_ORDER.map(stage => {
              const meta = STAGE_META[stage];
              const data = stats.byStage[stage];
              const maxCount = Math.max(...STAGES_ORDER.map(s => stats.byStage[s].count), 1);
              const widthPct = (data.count / maxCount) * 100;
              return (
                <div key={stage}>
                  <div className="flex items-center justify-between mb-1 text-[12px]">
                    <span className="font-semibold" style={{ color: meta.color }}>{meta.label}</span>
                    <span className="text-slate-500">
                      {data.count} فرصة · <span className="font-semibold text-slate-700">{fmt(data.value)} ₪</span>
                    </span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${widthPct}%`, background: meta.color, opacity: 0.8 }} />
                  </div>
                </div>
              );
            })}
            {stats.openOppsCount === 0 && (
              <p className="text-center text-xs text-slate-400 py-8">
                لا توجد فرص بعد. ابدأ بإضافة فرصة جديدة من خط سير المبيعات.
              </p>
            )}
          </div>
        </div>

        {/* Top sources */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="text-sm font-bold text-slate-900 mb-4">أهم مصادر العملاء</h2>
          {stats.topSources.length === 0 ? (
            <p className="text-center text-xs text-slate-400 py-8">لا توجد بيانات بعد</p>
          ) : (
            <div className="space-y-3">
              {stats.topSources.map(([src, count]) => {
                const total = stats.totalLeads || 1;
                const pct = (count / total) * 100;
                return (
                  <div key={src}>
                    <div className="flex items-center justify-between mb-1 text-[12px]">
                      <span className="text-slate-700">{src}</span>
                      <span className="text-slate-500">{count} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Quick actions */}
      {/* Customer Success KPIs */}
      <div>
        <h2 className="text-sm font-bold text-slate-900 mb-3">مركز نجاح العملاء</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="تذاكر مفتوحة" value={fmt(cs.openTickets)} icon={LifeBuoy} color="#0369A1" bg="#E0F2FE" onClick={() => navigate("/crm/tickets")} />
          <KpiCard label="تذاكر حرجة" value={fmt(cs.criticalTickets)} icon={AlertCircle} color={cs.criticalTickets > 0 ? "#B91C1C" : "#15803D"} bg={cs.criticalTickets > 0 ? "#FEE2E2" : "#DCFCE7"} onClick={() => navigate("/crm/tickets")} />
          <KpiCard label="مكالمات اليوم" value={fmt(cs.callsToday)} icon={Phone} color="#7C3AED" bg="#EDE9FE" onClick={() => navigate("/crm/calls")} />
          <KpiCard label="اجتماعات اليوم" value={fmt(cs.meetingsToday)} icon={Calendar} color="#C2410C" bg="#FFEDD5" onClick={() => navigate("/crm/meetings")} />
          <KpiCard label="تجديدات خلال 30 يوم" value={fmt(cs.renewals30)} icon={Repeat} color="#A16207" bg="#FEF3C7" onClick={() => navigate("/crm/renewals")} />
        </div>
        {cs.topFR.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 p-4 mt-3">
            <h3 className="text-[13px] font-bold text-slate-900 mb-3 flex items-center gap-2"><Lightbulb className="h-4 w-4 text-amber-600" /> أكثر طلبات الميزات تصويتاً</h3>
            <div className="space-y-2">
              {cs.topFR.map((f) => (
                <div key={f.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-[10px] text-slate-500">{f.fr_number}</span>
                    <span className="text-[12px] text-slate-700 truncate">{f.title}</span>
                  </div>
                  <span className="text-[11px] font-bold text-blue-700 shrink-0">👍 {f.votes}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="bg-gradient-to-l from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-5">
        <h2 className="text-sm font-bold text-slate-900 mb-3">إجراءات سريعة</h2>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate("/crm/leads?new=1")}
            className="px-4 py-2 rounded-lg bg-white border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-50 hover:border-blue-300 transition">
            + عميل محتمل جديد
          </button>
          <button onClick={() => navigate("/crm/pipeline?new=1")}
            className="px-4 py-2 rounded-lg bg-white border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-50 hover:border-blue-300 transition">
            + فرصة جديدة
          </button>
          <button onClick={() => navigate("/crm/activities?new=1")}
            className="px-4 py-2 rounded-lg bg-white border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-50 hover:border-blue-300 transition">
            + متابعة جديدة
          </button>
          <button onClick={() => navigate("/invoices/new")}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 transition">
            + فاتورة من فرصة
          </button>
        </div>
      </div>
    </div>
  );
}
