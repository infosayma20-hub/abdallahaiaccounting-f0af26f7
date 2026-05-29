import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, AlertTriangle, Repeat, Search, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { useCsSubscriptions } from "./hooks/useCsData";
import { SUBSCRIPTION_STATUS_META, PAYMENT_STATUS_META, type CsSubscriptionStatus, type CsPaymentStatus } from "./types-cs";
import { fmtDateDisplay } from "@/lib/utils";

const fmt = (n: number) => new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n);

function daysUntil(d: string) {
  const ms = new Date(d).getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

export default function CsRenewalCenterPage() {
  const { items, loading } = useCsSubscriptions();
  const [contactNames, setContactNames] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [statusF, setStatusF] = useState<CsSubscriptionStatus | "all">("all");
  const [payF, setPayF] = useState<CsPaymentStatus | "all">("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Load contact names
  useEffect(() => {
    const ids = Array.from(new Set(items.map((i) => i.contact_id).filter(Boolean)));
    if (ids.length === 0) return;
    (supabase as any).from("contacts").select("id, contact_name").in("id", ids)
      .then(({ data }: any) => {
        const map: Record<string, string> = {};
        (data || []).forEach((c: any) => { map[c.id] = c.contact_name; });
        setContactNames(map);
      });
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((s) => {
      if (statusF !== "all" && s.status !== statusF) return false;
      if (payF !== "all" && s.payment_status !== payF) return false;
      if (fromDate && s.renewal_date < fromDate) return false;
      if (toDate && s.renewal_date > toDate) return false;
      if (search) {
        const name = (contactNames[s.contact_id] || "").toLowerCase();
        if (!name.includes(search.toLowerCase()) && !s.plan.toLowerCase().includes(search.toLowerCase())) return false;
      }
      return true;
    }).sort((a, b) => a.renewal_date.localeCompare(b.renewal_date));
  }, [items, statusF, payF, fromDate, toDate, search, contactNames]);

  const kpis = useMemo(() => {
    const next30 = items.filter((s) => { const d = daysUntil(s.renewal_date); return d >= 0 && d <= 30; });
    const overdue = items.filter((s) => daysUntil(s.renewal_date) < 0 || s.payment_status === "overdue");
    const next30Value = next30.reduce((sum, s) => sum + Number(s.monthly_value || 0), 0);
    const activeCustomers = new Set(items.filter((s) => s.status === "active").map((s) => s.contact_id)).size;
    return { next30Count: next30.length, overdueCount: overdue.length, next30Value, activeCustomers };
  }, [items]);

  if (loading) return <div className="p-8 text-center text-slate-400 text-sm" dir="rtl">جارٍ التحميل...</div>;

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-2">
        <Repeat className="h-5 w-5 text-blue-600" />
        <h2 className="text-base font-bold text-slate-900">مركز التجديدات</h2>
        <span className="text-[11px] text-slate-500">({filtered.length})</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Kpi label="تنتهي خلال 30 يوم" value={kpis.next30Count.toString()} tone="warn" icon={<Calendar className="h-4 w-4" />} />
        <Kpi label="متأخر التجديد" value={kpis.overdueCount.toString()} tone="danger" icon={<AlertTriangle className="h-4 w-4" />} />
        <Kpi label="قيمة التجديدات القادمة" value={`${fmt(kpis.next30Value)} ₪`} tone="good" />
        <Kpi label="عملاء نشطون" value={kpis.activeCustomers.toString()} tone="default" />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-3 grid grid-cols-1 md:grid-cols-5 gap-2">
        <div className="relative md:col-span-2">
          <Search className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث باسم العميل أو الخطة..." className="h-9 pr-9 text-[12px]" />
        </div>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value as any)} className="h-9 px-2 rounded-md border border-slate-200 text-[12px] bg-white">
          <option value="all">كل الحالات</option>
          {Object.entries(SUBSCRIPTION_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={payF} onChange={(e) => setPayF(e.target.value as any)} className="h-9 px-2 rounded-md border border-slate-200 text-[12px] bg-white">
          <option value="all">كل حالات الدفع</option>
          {Object.entries(PAYMENT_STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <div className="grid grid-cols-2 gap-1">
          <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="h-9 text-[11px]" />
          <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="h-9 text-[11px]" />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
        {filtered.length === 0 ? (
          <p className="p-8 text-center text-slate-400 text-sm">لا توجد اشتراكات مطابقة</p>
        ) : (
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50 text-slate-600 text-[11px]">
              <tr>
                <th className="text-right px-3 py-2 font-semibold">العميل</th>
                <th className="text-right px-3 py-2 font-semibold">الخطة</th>
                <th className="text-right px-3 py-2 font-semibold">شهري</th>
                <th className="text-right px-3 py-2 font-semibold">سنوي</th>
                <th className="text-right px-3 py-2 font-semibold">تاريخ التجديد</th>
                <th className="text-right px-3 py-2 font-semibold">المتبقي</th>
                <th className="text-right px-3 py-2 font-semibold">الدفع</th>
                <th className="text-right px-3 py-2 font-semibold">الحالة</th>
                <th className="text-right px-3 py-2 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => {
                const d = daysUntil(s.renewal_date);
                return (
                  <tr key={s.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold text-slate-900">{contactNames[s.contact_id] || "—"}</td>
                    <td className="px-3 py-2 text-slate-700">{s.plan}</td>
                    <td className="px-3 py-2 text-slate-700">{fmt(Number(s.monthly_value || 0))}</td>
                    <td className="px-3 py-2 text-slate-700">{fmt(Number(s.annual_value || 0))}</td>
                    <td className="px-3 py-2 text-slate-700">{fmtDateDisplay(s.renewal_date)}</td>
                    <td className={`px-3 py-2 font-semibold ${d < 0 ? "text-red-700" : d <= 7 ? "text-amber-700" : "text-slate-700"}`}>
                      {d < 0 ? `متأخر ${Math.abs(d)} يوم` : `${d} يوم`}
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block px-1.5 py-0.5 rounded font-bold text-[10px]" style={{ background: PAYMENT_STATUS_META[s.payment_status]?.bg, color: PAYMENT_STATUS_META[s.payment_status]?.color }}>
                        {PAYMENT_STATUS_META[s.payment_status]?.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <span className="inline-block px-1.5 py-0.5 rounded font-bold text-[10px]" style={{ background: SUBSCRIPTION_STATUS_META[s.status]?.bg, color: SUBSCRIPTION_STATUS_META[s.status]?.color }}>
                        {SUBSCRIPTION_STATUS_META[s.status]?.label}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <Link to={`/crm/customer/${s.contact_id}`} className="inline-flex items-center gap-1 text-blue-700 hover:underline text-[11px]">
                        <ExternalLink className="h-3 w-3" /> فتح 360
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: "default" | "good" | "warn" | "danger"; icon?: React.ReactNode }) {
  const cls =
    tone === "danger" ? "text-red-700 border-red-100 bg-red-50/40" :
    tone === "warn" ? "text-amber-700 border-amber-100 bg-amber-50/40" :
    tone === "good" ? "text-emerald-700 border-emerald-100 bg-emerald-50/40" :
    "text-slate-900 border-slate-200 bg-white";
  return (
    <div className={`rounded-xl border p-3 ${cls}`}>
      <div className="text-[11px] text-slate-500 flex items-center gap-1">{icon}{label}</div>
      <div className="text-[16px] font-bold mt-1">{value}</div>
    </div>
  );
}
