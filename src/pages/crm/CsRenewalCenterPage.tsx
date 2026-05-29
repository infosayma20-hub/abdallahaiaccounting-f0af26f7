import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Calendar, AlertTriangle } from "lucide-react";
import { useCsSubscriptions } from "./hooks/useCsData";
import { SUBSCRIPTION_STATUS_META, PAYMENT_STATUS_META } from "./types-cs";
import { fmtDateDisplay } from "@/lib/utils";

const fmt = (n: number) => new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n);

function daysUntil(d: string) {
  const ms = new Date(d).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export default function CsRenewalCenterPage() {
  const { items, loading } = useCsSubscriptions();

  const grouped = useMemo(() => {
    const overdue: typeof items = [];
    const week: typeof items = [];
    const month: typeof items = [];
    const later: typeof items = [];
    for (const s of items) {
      const d = daysUntil(s.renewal_date);
      if (d < 0) overdue.push(s);
      else if (d <= 7) week.push(s);
      else if (d <= 30) month.push(s);
      else later.push(s);
    }
    return { overdue, week, month, later };
  }, [items]);

  const mrr = items
    .filter((s) => s.status === "active")
    .reduce((sum, s) => sum + Number(s.monthly_value || 0), 0);

  if (loading) return <div className="p-8 text-center text-slate-400 text-sm" dir="rtl">جارٍ التحميل...</div>;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi label="إيراد شهري متكرر" value={`${fmt(mrr)} ₪`} tone="good" />
        <Kpi label="متأخر التجديد" value={grouped.overdue.length.toString()} tone="danger" />
        <Kpi label="خلال 7 أيام" value={grouped.week.length.toString()} tone="warn" />
        <Kpi label="خلال 30 يوم" value={grouped.month.length.toString()} tone="default" />
      </div>

      <Section title="متأخر التجديد" tone="danger" items={grouped.overdue} />
      <Section title="خلال 7 أيام" tone="warn" items={grouped.week} />
      <Section title="خلال 30 يوم" tone="default" items={grouped.month} />
      <Section title="لاحقاً" tone="default" items={grouped.later} />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: string; tone: "default" | "good" | "warn" | "danger" }) {
  const cls =
    tone === "danger" ? "text-red-700 border-red-100 bg-red-50/40" :
    tone === "warn" ? "text-amber-700 border-amber-100 bg-amber-50/40" :
    tone === "good" ? "text-emerald-700 border-emerald-100 bg-emerald-50/40" :
    "text-slate-900 border-slate-200 bg-white";
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-[16px] font-bold mt-1">{value}</div>
    </div>
  );
}

function Section({ title, tone, items }: { title: string; tone: "default" | "good" | "warn" | "danger"; items: any[] }) {
  if (items.length === 0) return null;
  const headerCls =
    tone === "danger" ? "text-red-700" :
    tone === "warn" ? "text-amber-700" :
    tone === "good" ? "text-emerald-700" :
    "text-slate-700";
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <h3 className={`text-sm font-bold mb-3 flex items-center gap-2 ${headerCls}`}>
        {tone === "danger" ? <AlertTriangle className="h-4 w-4" /> : <Calendar className="h-4 w-4" />}
        {title} <span className="text-slate-400 text-[11px]">({items.length})</span>
      </h3>
      <div className="space-y-1.5">
        {items.map((s) => {
          const d = daysUntil(s.renewal_date);
          return (
            <Link
              key={s.id}
              to={`/crm/customer/${s.contact_id}`}
              className="flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-lg transition"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-slate-900">{s.plan}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: SUBSCRIPTION_STATUS_META[s.status]?.bg, color: SUBSCRIPTION_STATUS_META[s.status]?.color }}>
                    {SUBSCRIPTION_STATUS_META[s.status]?.label}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-bold" style={{ background: PAYMENT_STATUS_META[s.payment_status]?.bg, color: PAYMENT_STATUS_META[s.payment_status]?.color }}>
                    {PAYMENT_STATUS_META[s.payment_status]?.label}
                  </span>
                </div>
              </div>
              <div className="text-left shrink-0">
                <div className="text-[13px] font-bold text-slate-900">{fmt(Number(s.monthly_value || 0))} ₪/شهر</div>
                <div className="text-[10px] text-slate-500">{fmtDateDisplay(s.renewal_date)} {d < 0 ? `(${Math.abs(d)} يوم تأخير)` : `(بعد ${d} يوم)`}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}