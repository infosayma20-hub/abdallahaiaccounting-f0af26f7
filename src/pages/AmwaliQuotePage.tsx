import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { Button } from "@/components/ui/button";
import { Printer, ArrowRight, RotateCcw, Save, Shield, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import amwaliLogo from "@/assets/amwali-logo-tall.png";

/**
 * عرض سعر خاص بأموالي (QUO)
 * متاح فقط لـ: info.sayma20@gmail.com و super_admin
 * الحفظ التلقائي في localStorage. المدير يتحكم بكل بند (سعر لمرة واحدة + سعر سنوي + الكمية).
 */

const STORAGE_KEY = "amwali_quote_v1";
const COUNTER_KEY = "amwali_quote_next_number";
const COUNTER_START = 1;
const ALLOWED_EMAIL = "info.sayma20@gmail.com";

const getNextQuoteNumber = (): { number: string; next: number } => {
  let next = COUNTER_START;
  try {
    const raw = localStorage.getItem(COUNTER_KEY);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    if (!isNaN(parsed) && parsed >= COUNTER_START) next = parsed;
  } catch {}
  const year = new Date().getFullYear();
  return { number: `QUO-${year}-${String(next).padStart(3, "0")}`, next };
};

interface QuoteItem {
  id: string;
  name: string;
  qty: string;      // الكمية / عدد النقاط / المستخدمين
  onetime: string;  // سعر لمرة واحدة لكل وحدة
  annual: string;   // سعر سنوي لكل وحدة
  notes: string;
  basis?: string;   // أساس التسعير (لكل نظام / لكل نقطة بيع / لكل مستخدم …)
  active?: boolean; // تفعيل البند في الإجمالي
}

interface QuoteData {
  customer_name: string;
  company_name: string;
  phone: string;
  email: string;
  address: string;
  quote_number: string;
  quote_date: string;
  valid_until: string;
  currency: string;
  discount: string;       // خصم إجمالي (بنفس العملة)
  intro: string;
  terms: string;
  items: QuoteItem[];
}

const uid = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_ITEMS: QuoteItem[] = [
  { id: uid(), name: "نظام المحاسبة والإدارة المالية",  qty: "1", onetime: "500",  annual: "350",  basis: "لكل نظام",         notes: "لمرة واحدة + اشتراك سنوي", active: true },
  { id: uid(), name: "نظام نقاط البيع POS",              qty: "1", onetime: "300",  annual: "100",  basis: "لكل نقطة بيع",     notes: "",                          active: true },
  { id: uid(), name: "نظام الموارد البشرية HR",          qty: "1", onetime: "1500", annual: "0",    basis: "لكل نظام",         notes: "تفعيل النظام لمرة واحدة",   active: true },
  { id: uid(), name: "مستخدمو الموارد البشرية",          qty: "1", onetime: "0",    annual: "10",   basis: "لكل مستخدم موظف",  notes: "",                          active: true },
  { id: uid(), name: "نظام CRM والكول سنتر",             qty: "1", onetime: "500",  annual: "0",    basis: "لكل نظام",         notes: "تفعيل النظام لمرة واحدة",   active: true },
  { id: uid(), name: "مستخدمو CRM والكول سنتر",          qty: "1", onetime: "0",    annual: "50",   basis: "لكل مستخدم",       notes: "",                          active: true },
  { id: uid(), name: "نظام الكيوسك ذاتي الخدمة",         qty: "1", onetime: "500",  annual: "150",  basis: "لكل نقطة كيوسك",   notes: "",                          active: false },
  { id: uid(), name: "إدارة النظام الداخلي والنماذج",    qty: "1", onetime: "0",    annual: "500",  basis: "اشتراك سنوي شامل", notes: "",                          active: true },
  { id: uid(), name: "حزمة تكاملات API",                 qty: "1", onetime: "0",    annual: "1000", basis: "اشتراك سنوي شامل", notes: "",                          active: true },
  { id: uid(), name: "الدعم الفني والصيانة",             qty: "1", onetime: "0",    annual: "2000", basis: "اشتراك سنوي شامل", notes: "",                          active: true },
];

const DEFAULTS: QuoteData = {
  customer_name: "",
  company_name: "",
  phone: "",
  email: "",
  address: "",
  quote_number: "",
  quote_date: new Date().toISOString().split("T")[0],
  valid_until: "",
  currency: "USD",
  discount: "",
  intro: "يسر شركة أموالي تقديم عرض السعر التالي للاشتراك في خدمات ومنتجات نظام أموالي المحاسبي والإداري، وذلك وفق البنود والأسعار الموضحة أدناه.",
  terms: "• الأسعار المذكورة أعلاه لا تشمل ضريبة القيمة المضافة إن وُجدت.\n• السعر «لمرة واحدة» يُدفع عند التفعيل، والاشتراك السنوي يُسدَّد مقدماً في بداية كل سنة اشتراك.\n• عرض السعر ساري لمدة 15 يوماً من تاريخه ما لم يُذكر خلاف ذلك.\n• أي مستخدم أو نقطة بيع إضافية تُحتسب وفق نفس التسعير.",
  items: DEFAULT_ITEMS,
};

const Field = ({
  value, onChange, placeholder, width = "200px", type = "text",
}: { value: string; onChange: (v: string) => void; placeholder?: string; width?: string; type?: string }) => (
  <input
    type={type}
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    style={{ width }}
    className="inline-block border-b border-dashed border-slate-400 bg-transparent px-1 text-slate-900 outline-none focus:border-solid focus:border-primary print:border-transparent print:bg-transparent"
  />
);

const num = (v: string) => {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
};

const AmwaliQuotePage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSuperAdmin, loading: permLoading } = usePermission("any");
  const [data, setData] = useState<QuoteData>(DEFAULTS);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = { ...DEFAULTS, ...JSON.parse(saved) };
        if (!parsed.items?.length) parsed.items = DEFAULT_ITEMS;
        if (!parsed.quote_number || /-$/.test(parsed.quote_number)) {
          parsed.quote_number = getNextQuoteNumber().number;
        }
        setData(parsed);
      } else {
        setData({ ...DEFAULTS, quote_number: getNextQuoteNumber().number });
      }
    } catch {}
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [data]);

  // Auto-update "valid_until" to be quote_date + 15 days whenever quote_date changes,
  // unless the user has already overridden it to a different value than the previous auto value.
  useEffect(() => {
    if (!data.quote_date) return;
    const d = new Date(data.quote_date);
    if (isNaN(d.getTime())) return;
    d.setDate(d.getDate() + 15);
    const auto = d.toISOString().split("T")[0];
    setData((prev) => (prev.valid_until === auto ? prev : { ...prev, valid_until: auto }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.quote_date]);

  const update = <K extends keyof QuoteData>(k: K, v: QuoteData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const updateItem = (id: string, patch: Partial<QuoteItem>) =>
    setData((d) => ({ ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));

  const addItem = () =>
    setData((d) => ({ ...d, items: [...d.items, { id: uid(), name: "", qty: "1", onetime: "0", annual: "0", notes: "", basis: "لكل نظام", active: true }] }));

  const removeItem = (id: string) =>
    setData((d) => ({ ...d, items: d.items.filter((it) => it.id !== id) }));

  const handleReset = () => {
    if (!confirm("هل تريد مسح كافة الحقول وإعادة النموذج للوضع الافتراضي؟")) return;
    setData({ ...DEFAULTS, items: DEFAULT_ITEMS.map((it) => ({ ...it, id: uid() })), quote_number: getNextQuoteNumber().number });
    toast.success("تم مسح النموذج");
  };

  const handlePrint = () => {
    try {
      const { next } = getNextQuoteNumber();
      localStorage.setItem(COUNTER_KEY, String(next + 1));
    } catch {}
    const originalTitle = document.title;
    document.title = " ";
    const restore = () => { document.title = originalTitle; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const allowed = isSuperAdmin || user?.email?.toLowerCase() === ALLOWED_EMAIL;
  if (permLoading) return <div className="p-8 text-center text-muted-foreground">جاري التحقق...</div>;
  if (!allowed) {
    return (
      <div className="p-8 text-center" dir="rtl">
        <p className="text-lg text-destructive">هذه الصفحة متاحة فقط للمدير المخوّل.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("/print-templates")}>
          عودة لنماذج الطباعة
        </Button>
      </div>
    );
  }

  const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const currencySymbol = data.currency === "ILS" ? "₪" : data.currency === "USD" ? "$" : data.currency;

  const rows = data.items.map((it) => {
    const active = it.active !== false;
    const q = num(it.qty);
    const o = active ? num(it.onetime) * q : 0;
    const a = active ? num(it.annual) * q : 0;
    return { ...it, active, lineOnetime: o, lineAnnual: a, lineTotal: o + a };
  });

  const sumOnetime = rows.reduce((s, r) => s + r.lineOnetime, 0);
  const sumAnnual = rows.reduce((s, r) => s + r.lineAnnual, 0);
  const subtotal = sumOnetime + sumAnnual;
  const discount = num(data.discount);
  const grand = Math.max(0, subtotal - discount);

  return (
    <div dir="rtl" className="min-h-screen bg-slate-100 print:bg-white">
      <style>{`
        @media print {
          @page { size: A4; margin: 12mm; }
          body { background: white !important; }
          html, body { margin: 0 !important; padding: 0 !important; }
          body * { visibility: hidden !important; }
          .print-page, .print-page * { visibility: visible !important; }
          .print-page {
            position: absolute !important;
            inset: 0 !important;
            box-shadow: none !important;
            margin: 0 !important;
            max-width: none !important;
            width: 100% !important;
            padding: 0 !important;
          }
          .no-print { display: none !important; }
          input { border: none !important; background: transparent !important; padding: 0 !important; }
          textarea { border: none !important; background: transparent !important; padding: 0 !important; resize: none !important; }
          .row-delete { display: none !important; }
          /* Hide native date picker icon on print */
          input[type="date"]::-webkit-calendar-picker-indicator { display: none !important; -webkit-appearance: none !important; }
          input[type="date"] { -moz-appearance: textfield !important; appearance: textfield !important; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print sticky top-0 z-50 border-b bg-white shadow-sm">
        <div className="mx-auto flex max-w-[210mm] items-center gap-2 px-4 py-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowRight className="ml-1 h-4 w-4" /> رجوع
          </Button>
          <div className="flex-1 text-sm font-semibold text-slate-700">
            عرض سعر أموالي
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/super-admin/dashboard")} title="السوبر ادمن">
            <Shield className="ml-1 h-4 w-4" /> السوبر ادمن
          </Button>
          <Button variant="outline" size="sm" onClick={handleReset}>
            <RotateCcw className="ml-1 h-4 w-4" /> مسح
          </Button>
          <Button size="sm" onClick={() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); toast.success("تم حفظ المسودة"); } catch {} }}>
            <Save className="ml-1 h-4 w-4" /> حفظ
          </Button>
          <Button size="sm" className="bg-primary" onClick={handlePrint}>
            <Printer className="ml-1 h-4 w-4" /> طباعة
          </Button>
        </div>
      </div>

      {/* Page */}
      <div
        ref={printRef}
        className="print-page relative mx-auto my-6 max-w-[210mm] bg-white px-12 py-10 text-[13px] leading-7 text-slate-900 shadow-lg"
        style={{ fontFamily: "'Cairo', 'Tajawal', Arial, sans-serif" }}
      >
        {/* Faint AMWALI watermark on every page */}
        <div
          aria-hidden="true"
          className="fixed inset-0 z-0 hidden items-center justify-center pointer-events-none print:flex"
        >
          <img
            src="/logo-white.svg"
            alt=""
            className="h-auto w-[320px] opacity-[0.05]"
            style={{ filter: "invert(1)" }}
          />
        </div>

        {/* Content layer */}
        <div className="relative z-10">
          {/* Header */}
        <div className="mb-6 grid grid-cols-3 items-center border-b-2 border-[#0D1B2E] pb-4">
          <div className="text-left">
            <div className="text-xs text-slate-500">التاريخ</div>
            <Field type="date" value={data.quote_date} onChange={(v) => update("quote_date", v)} width="150px" />
            <div className="mt-2 text-xs text-slate-500">صالح حتى</div>
            <Field type="date" value={data.valid_until} onChange={(v) => update("valid_until", v)} width="150px" />
          </div>
          <div className="flex justify-center">
            <img src={amwaliLogo} alt="أموالي" className="h-20 object-contain" />
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-500">رقم عرض السعر</div>
            <Field value={data.quote_number} onChange={(v) => update("quote_number", v)} width="180px" />
            <div className="mt-2 text-xs text-slate-500">العملة</div>
            <select
              value={data.currency}
              onChange={(e) => update("currency", e.target.value)}
              className="border-b border-dashed border-slate-400 bg-transparent px-1 text-slate-900 outline-none print:border-transparent"
            >
              <option value="USD">دولار أمريكي (USD)</option>
              <option value="ILS">شيكل إسرائيلي (ILS)</option>
              <option value="JOD">دينار أردني (JOD)</option>
              <option value="EUR">يورو (EUR)</option>
            </select>
          </div>
        </div>

        {/* Title */}
        <h1 className="mb-6 text-center text-2xl font-bold text-[#0D1B2E]">
          عــرض ســـعر خدمـــات أموالـــي
        </h1>

        {/* Customer — compact aligned grid */}
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2">
          <div className="flex items-start gap-3">
            <span className="pt-0.5 text-[11.5px] font-bold text-[#0D1B2E] whitespace-nowrap">مقدم إلى:</span>
            <div className="grid flex-1 grid-cols-12 gap-x-4 gap-y-1 text-[12px]">
              <div className="col-span-4 flex items-baseline gap-1">
                <span className="w-10 shrink-0 text-slate-500">الاسم:</span>
                <Field value={data.customer_name} onChange={(v) => update("customer_name", v)} placeholder="اسم الزبون" width="100%" />
              </div>
              <div className="col-span-4 flex items-baseline gap-1">
                <span className="w-10 shrink-0 text-slate-500">الشركة:</span>
                <Field value={data.company_name} onChange={(v) => update("company_name", v)} placeholder="اسم الشركة" width="100%" />
              </div>
              <div className="col-span-4 flex items-baseline gap-1">
                <span className="w-10 shrink-0 text-slate-500">الهاتف:</span>
                <Field value={data.phone} onChange={(v) => update("phone", v)} width="100%" />
              </div>
              <div className="col-span-4 flex items-baseline gap-1">
                <span className="w-10 shrink-0 text-slate-500">البريد:</span>
                <Field value={data.email} onChange={(v) => update("email", v)} width="100%" />
              </div>
              <div className="col-span-8 flex items-baseline gap-1">
                <span className="w-12 shrink-0 text-slate-500">العنوان:</span>
                <Field value={data.address} onChange={(v) => update("address", v)} width="100%" />
              </div>
            </div>
          </div>
        </div>

        {/* Intro */}
        <div className="mb-4">
          <textarea
            value={data.intro}
            onChange={(e) => update("intro", e.target.value)}
            rows={2}
            className="w-full rounded border border-dashed border-slate-400 bg-transparent p-2 text-[12.5px] text-justify outline-none focus:border-solid focus:border-primary print:border-transparent"
          />
        </div>

        {/* Section header */}
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-6 w-8 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-[#0D1B2E]">03</span>
            <h2 className="text-base font-bold text-[#0D1B2E]">جدول الأسعار</h2>
          </div>
          <div className="no-print text-[11.5px] text-slate-500">
            اضغط على البند لإخفائه/إظهاره في العرض
          </div>
        </div>

        {/* Items table — redesigned */}
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="bg-[#0D1B2E] text-[11.5px] font-semibold text-white">
                <th className="px-3 py-2 text-right">النظام / الوحدة</th>
                <th className="px-3 py-2 text-center w-20">لمرة واحدة</th>
                <th className="px-3 py-2 text-center w-20">سنوي</th>
                <th className="px-3 py-2 text-center w-16">الكمية</th>
                <th className="px-3 py-2 text-center w-28">إجمالي السنة الأولى</th>
                <th className="px-3 py-2 text-center w-24">المتكرر سنويًّا</th>
                <th className="px-2 py-2 w-8 no-print row-delete"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest("input,button,textarea,select")) return;
                    updateItem(r.id, { active: !r.active });
                  }}
                  className={`cursor-pointer border-t border-slate-100 transition hover:bg-slate-50 ${r.active ? "" : "opacity-40 line-through decoration-slate-300"}`}
                  title={r.active ? "اضغط لإخفاء البند" : "اضغط لإظهار البند"}
                >
                  <td className="px-3 py-2.5 align-middle">
                    <input
                      value={r.name}
                      onChange={(e) => updateItem(r.id, { name: e.target.value })}
                      className="w-full border-0 bg-transparent p-0 text-[13px] font-semibold text-[#0D1B2E] outline-none focus:ring-0"
                      placeholder="اسم البند"
                    />
                    <input
                      value={r.basis || r.notes || ""}
                      onChange={(e) => updateItem(r.id, { basis: e.target.value })}
                      placeholder="أساس التسعير / ملاحظة"
                      className="mt-0.5 w-full border-0 bg-transparent p-0 text-[11px] text-slate-400 outline-none focus:ring-0"
                    />
                  </td>
                  <td className="px-3 py-2.5 align-middle text-center">
                    <div className="flex items-center justify-center gap-0.5 text-[13px] font-semibold text-[#0D1B2E] tabular-nums">
                      <span>{currencySymbol}</span>
                      <input
                        value={r.onetime}
                        onChange={(e) => updateItem(r.id, { onetime: e.target.value })}
                        className="w-12 border-0 bg-transparent p-0 text-center outline-none focus:ring-0"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-middle text-center">
                    <div className="flex items-center justify-center gap-0.5 text-[13px] font-semibold text-[#0D1B2E] tabular-nums">
                      <span>{currencySymbol}</span>
                      <input
                        value={r.annual}
                        onChange={(e) => updateItem(r.id, { annual: e.target.value })}
                        className="w-12 border-0 bg-transparent p-0 text-center outline-none focus:ring-0"
                      />
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-middle text-center">
                    <input
                      value={r.qty}
                      onChange={(e) => updateItem(r.id, { qty: e.target.value })}
                      className="mx-auto block w-12 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-center text-[13px] tabular-nums text-[#0D1B2E] outline-none focus:border-[#0D1B2E] focus:ring-1 focus:ring-[#0D1B2E]/20 print:border-transparent print:bg-transparent"
                    />
                  </td>
                  <td className="px-3 py-2.5 align-middle text-center text-[13px] font-bold text-[#0D1B2E] tabular-nums">
                    {currencySymbol}{fmt(r.lineTotal)}
                  </td>
                  <td className="px-3 py-2.5 align-middle text-center text-[13px] font-bold text-[#0D1B2E] tabular-nums">
                    {currencySymbol}{fmt(r.lineAnnual)}
                  </td>
                  <td className="px-2 py-2.5 text-center no-print row-delete">
                    <button onClick={() => removeItem(r.id)} className="text-red-400 hover:text-red-600" title="حذف البند">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals — invoice style */}
        <div className="mt-4 flex justify-end">
          <div className="w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white text-[13px]">
            <div className="flex items-center justify-between px-4 py-2">
              <span className="text-slate-600">إجمالي «لمرة واحدة»</span>
              <span className="font-semibold text-[#0D1B2E] tabular-nums">{currencySymbol}{fmt(sumOnetime)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2">
              <span className="text-slate-600">إجمالي الاشتراك السنوي</span>
              <span className="font-semibold text-[#0D1B2E] tabular-nums">{currencySymbol}{fmt(sumAnnual)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2">
              <span className="text-slate-600">خصم</span>
              <div className="flex items-center gap-2">
                <input
                  value={data.discount}
                  onChange={(e) => update("discount", e.target.value)}
                  placeholder="0"
                  className="h-7 w-16 rounded-md border border-slate-200 bg-white px-1.5 text-center text-[12.5px] tabular-nums outline-none focus:border-[#0D1B2E] focus:ring-1 focus:ring-[#0D1B2E]/20 print:border-transparent"
                />
                <span className="w-20 text-left font-semibold text-red-500 tabular-nums">- {currencySymbol}{fmt(discount)}</span>
              </div>
            </div>
            <div className="flex items-center justify-between border-t-2 border-[#0D1B2E] bg-[#0D1B2E] px-4 py-3 text-white">
              <span className="text-[13px] font-bold">الإجمالي المستحق — السنة الأولى</span>
              <span className="text-lg font-bold tabular-nums">{currencySymbol}{fmt(grand)}</span>
            </div>
            <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-4 py-2 text-[12px] text-slate-600">
              <span>المتكرر سنويًّا بعد السنة الأولى</span>
              <span className="font-semibold text-[#0D1B2E] tabular-nums">{currencySymbol}{fmt(sumAnnual)}</span>
            </div>
          </div>
        </div>

        {/* Add row */}
        <div className="no-print mt-2">
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="ml-1 h-4 w-4" /> إضافة بند
          </Button>
        </div>

        {/* Terms */}
        <div className="mt-6">
          <div className="mb-1 font-bold text-[#0D1B2E]">الشروط والملاحظات:</div>
          <textarea
            value={data.terms}
            onChange={(e) => update("terms", e.target.value)}
            rows={5}
            className="w-full rounded border border-dashed border-slate-400 bg-transparent p-2 text-[12.5px] leading-6 outline-none focus:border-solid focus:border-primary print:border-transparent"
          />
        </div>

        {/* Signatures */}
        <div className="mt-10 grid grid-cols-2 gap-12">
          <div className="text-center">
            <div className="font-bold text-[#0D1B2E]">عن شركة أموالي</div>
            <div className="mt-1 text-xs text-slate-500">(ممثل المبيعات)</div>
            <div className="mt-14 border-t border-slate-400 pt-1 text-xs">الاسم والتوقيع</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-[#0D1B2E]">القبول من الزبون</div>
            <div className="mt-1 text-xs text-slate-500">
              ({data.customer_name || "اسم الزبون"})
            </div>
            <div className="mt-14 border-t border-slate-400 pt-1 text-xs">الاسم والتوقيع</div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 border-t pt-2 text-center text-[10px] text-slate-500">
          أموالي — حلول محاسبية وإدارية ذكية · www.amwali.app
        </div>
      </div>
    </div>
  );
};

export default AmwaliQuotePage;