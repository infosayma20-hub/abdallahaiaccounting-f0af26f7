import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ArrowLeft, AlertTriangle, CheckCircle2, TrendingUp, Phone, MessageCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCrmOpportunities, useCrmActivities } from "./hooks/useCrmData";
import { fmtDateDisplay } from "@/lib/utils";
import { STAGE_META } from "./types";

const fmt = (n: number) => new Intl.NumberFormat("ar", { maximumFractionDigits: 0 }).format(n);

interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  whatsapp?: string | null;
  type?: string | null;
}

interface Receivables {
  outstanding: number;
  overdue: number;
  invoices_count: number;
  last_sale_date: string | null;
  total_ytd: number;
}

export default function CustomerCenterPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { opportunities } = useCrmOpportunities();
  const { activities } = useCrmActivities();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [search, setSearch] = useState("");
  const [receivables, setReceivables] = useState<Receivables | null>(null);
  const [loadingReceivables, setLoadingReceivables] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("contacts")
      .select("id, name, phone, whatsapp, type")
      .eq("user_id", user.id)
      .eq("is_archived", false)
      .order("name")
      .limit(500)
      .then(({ data }) => setCustomers((data as any) || []));
  }, [user]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(c => 
      c.name?.toLowerCase().includes(q) || 
      c.phone?.includes(q) || 
      c.whatsapp?.includes(q)
    );
  }, [customers, search]);

  // Load receivables for selected customer
  useEffect(() => {
    if (!selected || !user) { setReceivables(null); return; }
    setLoadingReceivables(true);
    
    const today = new Date().toISOString().split("T")[0];
    const yearStart = new Date().getFullYear() + "-01-01";

    Promise.all([
      supabase.from("invoices")
        .select("total_amount, status, invoice_date, due_date")
        .eq("user_id", user.id)
        .eq("contact_id", selected.id)
        .neq("status", "cancelled"),
    ]).then(([{ data: invs }]) => {
      const list = (invs as any[]) || [];
      const outstanding = list.filter(i => i.status !== "paid")
        .reduce((s, i) => s + Number(i.total_amount || 0), 0);
      const overdue = list.filter(i => i.status !== "paid" && i.due_date && i.due_date < today)
        .reduce((s, i) => s + Number(i.total_amount || 0), 0);
      const total_ytd = list.filter(i => i.invoice_date >= yearStart)
        .reduce((s, i) => s + Number(i.total_amount || 0), 0);
      const sortedDates = list.map(i => i.invoice_date).filter(Boolean).sort().reverse();

      setReceivables({
        outstanding, overdue, invoices_count: list.length,
        last_sale_date: sortedDates[0] || null, total_ytd,
      });
      setLoadingReceivables(false);
    });
  }, [selected, user]);

  const customerOpps = selected ? opportunities.filter(o => o.contact_id === selected.id) : [];
  const customerActivities = selected ? activities.filter(a => a.contact_id === selected.id).slice(0, 10) : [];

  // Risk score
  const riskBadge = useMemo(() => {
    if (!receivables) return null;
    if (receivables.overdue > receivables.outstanding * 0.3) return { label: "عالي المخاطر", color: "#B91C1C", bg: "#FEE2E2", icon: AlertTriangle };
    if (receivables.overdue > 0) return { label: "تأخير في السداد", color: "#C2410C", bg: "#FFEDD5", icon: AlertTriangle };
    if (receivables.total_ytd > 0) return { label: "عميل ممتاز", color: "#15803D", bg: "#DCFCE7", icon: CheckCircle2 };
    return { label: "جديد", color: "#0369A1", bg: "#E0F2FE", icon: TrendingUp };
  }, [receivables]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4" dir="rtl">
      {/* Customer list */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col h-[calc(100vh-220px)]">
        <div className="p-3 border-b border-slate-100">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث عن عميل..."
              className="h-9 w-full rounded-lg border border-slate-200 pr-10 pl-3 text-[13px] outline-none focus:border-blue-400" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-[12px] text-slate-400">لا يوجد عملاء</div>
          ) : filtered.map(c => (
            <button key={c.id} onClick={() => setSelected(c)}
              className={`w-full text-right p-3 border-b border-slate-50 hover:bg-blue-50 transition ${selected?.id === c.id ? "bg-blue-50 border-r-2 border-r-blue-600" : ""}`}>
              <div className="text-[13px] font-bold text-slate-900 truncate">{c.name}</div>
              {c.phone && <div className="text-[11px] text-slate-500 mt-0.5" dir="ltr">{c.phone}</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      {!selected ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-300 flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="text-5xl mb-3">👤</div>
            <h3 className="text-sm font-bold text-slate-700">اختر عميلاً لعرض ملفه الكامل (360°)</h3>
            <p className="text-xs text-slate-500 mt-1">سترى الفواتير، الأرصدة، المخاطر، الفرص، والمتابعات في مكان واحد</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Header */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">{selected.name}</h2>
                <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500">
                  {selected.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /><span dir="ltr">{selected.phone}</span></span>}
                  {selected.whatsapp && <span className="flex items-center gap-1 text-green-600"><MessageCircle className="h-3 w-3" /><span dir="ltr">{selected.whatsapp}</span></span>}
                </div>
              </div>
              {riskBadge && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold"
                  style={{ background: riskBadge.bg, color: riskBadge.color }}>
                  <riskBadge.icon className="h-3 w-3" /> {riskBadge.label}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => navigate(`/contacts/${selected.id}`)}
                className="h-8 px-3 rounded-md bg-slate-100 text-slate-700 text-[11px] font-semibold hover:bg-slate-200 flex items-center gap-1">
                ملف العميل الكامل <ArrowLeft className="h-3 w-3" />
              </button>
              <button onClick={() => navigate(`/account-statement?contact_id=${selected.id}`)}
                className="h-8 px-3 rounded-md bg-blue-50 text-blue-700 text-[11px] font-semibold hover:bg-blue-100">
                كشف حساب
              </button>
              <button onClick={() => navigate("/invoices/new")}
                className="h-8 px-3 rounded-md bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700">
                + فاتورة جديدة
              </button>
            </div>
          </div>

          {/* Financial KPIs */}
          {loadingReceivables ? (
            <div className="text-center py-6 text-xs text-slate-400">جاري تحميل البيانات المالية...</div>
          ) : receivables && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <div className="text-[10px] text-slate-500">الرصيد المستحق</div>
                <div className="text-base font-bold text-slate-900 mt-1">{fmt(receivables.outstanding)} ₪</div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <div className="text-[10px] text-slate-500">المتأخر</div>
                <div className={`text-base font-bold mt-1 ${receivables.overdue > 0 ? "text-red-600" : "text-slate-900"}`}>
                  {fmt(receivables.overdue)} ₪
                </div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <div className="text-[10px] text-slate-500">مبيعات السنة</div>
                <div className="text-base font-bold text-green-700 mt-1">{fmt(receivables.total_ytd)} ₪</div>
              </div>
              <div className="bg-white rounded-xl border border-slate-200 p-3">
                <div className="text-[10px] text-slate-500">آخر فاتورة</div>
                <div className="text-[12px] font-bold text-slate-700 mt-1">
                  {receivables.last_sale_date ? fmtDateDisplay(receivables.last_sale_date) : "—"}
                </div>
              </div>
            </div>
          )}

          {/* Opportunities */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">الفرص ({customerOpps.length})</h3>
            {customerOpps.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">لا توجد فرص لهذا العميل</p>
            ) : (
              <div className="space-y-2">
                {customerOpps.map(o => (
                  <div key={o.id} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg">
                    <div>
                      <div className="text-[12px] font-semibold text-slate-900">{o.title}</div>
                      <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded"
                        style={{ background: STAGE_META[o.stage].bg, color: STAGE_META[o.stage].color }}>
                        {STAGE_META[o.stage].label}
                      </span>
                    </div>
                    <div className="text-left text-[11px]">
                      <div className="font-bold text-slate-700">{fmt(Number(o.expected_value || 0))} ₪</div>
                      <div className="text-slate-400">{o.probability}%</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activities */}
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-bold text-slate-900 mb-3">آخر المتابعات</h3>
            {customerActivities.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">لا توجد متابعات بعد</p>
            ) : (
              <div className="space-y-2">
                {customerActivities.map(a => (
                  <div key={a.id} className="flex items-center gap-2 text-[12px]">
                    <span className={`h-2 w-2 rounded-full ${a.status === "completed" ? "bg-green-500" : "bg-amber-500"}`} />
                    <span className="text-slate-700 flex-1 truncate">{a.title}</span>
                    {a.due_date && <span className="text-[10px] text-slate-400">{fmtDateDisplay(a.due_date)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
