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
  { id: uid(), name: "نظام المحاسبة",                            qty: "1", onetime: "500",  annual: "350", notes: "لمرة واحدة + اشتراك سنوي" },
  { id: uid(), name: "نقطة البيع POS",                            qty: "1", onetime: "300",  annual: "100", notes: "لكل نقطة بيع" },
  { id: uid(), name: "نظام الموارد البشرية HR",                   qty: "1", onetime: "1500", annual: "10",  notes: "أساسي لمرة واحدة + 10$ لكل مستخدم/سنوياً" },
  { id: uid(), name: "الكول سنتر ومتابعة الزبائن CRM",            qty: "1", onetime: "500",  annual: "50",  notes: "لمرة واحدة + 50$ لكل مستخدم سنوياً" },
  { id: uid(), name: "نظام الكيوسك Kiosk",                        qty: "1", onetime: "500",  annual: "150", notes: "لكل نقطة كيوسك" },
  { id: uid(), name: "إدارة النظام الداخلي والنماذج والربط بين الأقسام", qty: "1", onetime: "0", annual: "500", notes: "اشتراك سنوي فقط" },
  { id: uid(), name: "التكاملات والروابط API ومع الجهات الخارجية", qty: "1", onetime: "0",    annual: "1000", notes: "اشتراك سنوي" },
  { id: uid(), name: "الدعم الفني السنوي",                        qty: "1", onetime: "0",    annual: "2000", notes: "دعم متكامل على مدار السنة" },
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

  const update = <K extends keyof QuoteData>(k: K, v: QuoteData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const updateItem = (id: string, patch: Partial<QuoteItem>) =>
    setData((d) => ({ ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));

  const addItem = () =>
    setData((d) => ({ ...d, items: [...d.items, { id: uid(), name: "", qty: "1", onetime: "0", annual: "0", notes: "" }] }));

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
    const q = num(it.qty);
    const o = num(it.onetime) * q;
    const a = num(it.annual) * q;
    return { ...it, lineOnetime: o, lineAnnual: a, lineTotal: o + a };
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
        className="print-page mx-auto my-6 max-w-[210mm] bg-white px-12 py-10 text-[13px] leading-7 text-slate-900 shadow-lg"
        style={{ fontFamily: "'Cairo', 'Tajawal', Arial, sans-serif" }}
      >
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

        {/* Customer */}
        <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <div className="mb-2 font-bold text-[#0D1B2E]">مقدم إلى:</div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1">
            <div>
              <span className="font-semibold">الاسم: </span>
              <Field value={data.customer_name} onChange={(v) => update("customer_name", v)} placeholder="اسم الزبون" width="220px" />
            </div>
            <div>
              <span className="font-semibold">الشركة / المنشأة: </span>
              <Field value={data.company_name} onChange={(v) => update("company_name", v)} placeholder="اسم الشركة" width="220px" />
            </div>
            <div>
              <span className="font-semibold">الهاتف: </span>
              <Field value={data.phone} onChange={(v) => update("phone", v)} width="180px" />
            </div>
            <div>
              <span className="font-semibold">البريد الإلكتروني: </span>
              <Field value={data.email} onChange={(v) => update("email", v)} width="220px" />
            </div>
            <div className="col-span-2">
              <span className="font-semibold">العنوان: </span>
              <Field value={data.address} onChange={(v) => update("address", v)} width="500px" />
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

        {/* Items table */}
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr className="bg-[#0D1B2E] text-white">
              <th className="border border-[#0D1B2E] px-2 py-2 text-center w-8">#</th>
              <th className="border border-[#0D1B2E] px-2 py-2 text-right">البند / الخدمة</th>
              <th className="border border-[#0D1B2E] px-2 py-2 text-center w-16">الكمية</th>
              <th className="border border-[#0D1B2E] px-2 py-2 text-center w-24">سعر مرة واحدة</th>
              <th className="border border-[#0D1B2E] px-2 py-2 text-center w-24">سعر سنوي</th>
              <th className="border border-[#0D1B2E] px-2 py-2 text-center w-28">الإجمالي</th>
              <th className="border border-[#0D1B2E] px-2 py-2 text-center w-8 no-print row-delete"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id} className="align-top">
                <td className="border border-slate-300 px-2 py-2 text-center text-slate-500">{idx + 1}</td>
                <td className="border border-slate-300 px-2 py-2">
                  <input
                    value={r.name}
                    onChange={(e) => updateItem(r.id, { name: e.target.value })}
                    className="w-full border-b border-dashed border-slate-300 bg-transparent px-1 font-semibold outline-none focus:border-solid focus:border-primary print:border-transparent"
                    placeholder="اسم البند"
                  />
                  <input
                    value={r.notes}
                    onChange={(e) => updateItem(r.id, { notes: e.target.value })}
                    className="mt-1 w-full border-b border-dashed border-slate-200 bg-transparent px-1 text-[11.5px] text-slate-500 outline-none focus:border-solid focus:border-primary print:border-transparent"
                    placeholder="ملاحظة / وصف"
                  />
                </td>
                <td className="border border-slate-300 px-2 py-2 text-center">
                  <input
                    value={r.qty}
                    onChange={(e) => updateItem(r.id, { qty: e.target.value })}
                    className="w-full border-b border-dashed border-slate-300 bg-transparent text-center outline-none focus:border-solid focus:border-primary print:border-transparent"
                  />
                </td>
                <td className="border border-slate-300 px-2 py-2 text-center">
                  <input
                    value={r.onetime}
                    onChange={(e) => updateItem(r.id, { onetime: e.target.value })}
                    className="w-full border-b border-dashed border-slate-300 bg-transparent text-center outline-none focus:border-solid focus:border-primary print:border-transparent"
                  />
                </td>
                <td className="border border-slate-300 px-2 py-2 text-center">
                  <input
                    value={r.annual}
                    onChange={(e) => updateItem(r.id, { annual: e.target.value })}
                    className="w-full border-b border-dashed border-slate-300 bg-transparent text-center outline-none focus:border-solid focus:border-primary print:border-transparent"
                  />
                </td>
                <td className="border border-slate-300 px-2 py-2 text-center font-semibold text-[#0D1B2E]">
                  {fmt(r.lineTotal)} {currencySymbol}
                </td>
                <td className="border border-slate-300 px-1 py-2 text-center no-print row-delete">
                  <button
                    onClick={() => removeItem(r.id)}
                    className="text-red-500 hover:text-red-700"
                    title="حذف البند"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="border border-slate-300 px-2 py-2 text-left font-semibold">
                إجمالي «لمرة واحدة»
              </td>
              <td className="border border-slate-300 px-2 py-2 text-center font-semibold">
                {fmt(sumOnetime)} {currencySymbol}
              </td>
              <td className="no-print row-delete" />
            </tr>
            <tr>
              <td colSpan={5} className="border border-slate-300 px-2 py-2 text-left font-semibold">
                إجمالي الاشتراك السنوي
              </td>
              <td className="border border-slate-300 px-2 py-2 text-center font-semibold">
                {fmt(sumAnnual)} {currencySymbol}
              </td>
              <td className="no-print row-delete" />
            </tr>
            <tr>
              <td colSpan={5} className="border border-slate-300 px-2 py-2 text-left">
                <div className="flex items-center justify-end gap-2">
                  <span>خصم:</span>
                  <input
                    value={data.discount}
                    onChange={(e) => update("discount", e.target.value)}
                    placeholder="0"
                    className="w-24 border-b border-dashed border-slate-300 bg-transparent text-center outline-none focus:border-solid focus:border-primary print:border-transparent"
                  />
                </div>
              </td>
              <td className="border border-slate-300 px-2 py-2 text-center">
                {fmt(discount)} {currencySymbol}
              </td>
              <td className="no-print row-delete" />
            </tr>
            <tr className="bg-[#0D1B2E] text-white">
              <td colSpan={5} className="border border-[#0D1B2E] px-2 py-2 text-left text-base font-bold">
                الإجمالي المستحق
              </td>
              <td className="border border-[#0D1B2E] px-2 py-2 text-center text-base font-bold">
                {fmt(grand)} {currencySymbol}
              </td>
              <td className="no-print row-delete" />
            </tr>
          </tfoot>
        </table>

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