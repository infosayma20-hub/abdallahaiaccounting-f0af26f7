import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePermission } from "@/hooks/usePermission";
import { Button } from "@/components/ui/button";
import { Printer, ArrowRight, RotateCcw, Save, Shield, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";

/**
 * مطالبة مالية — نموذج خاص بيونيفاي (CLM)
 * نفس أسلوب اتفاقية التفعيل وعرض السعر: تعبئة يدوية + حفظ تلقائي + طباعة A4.
 */

import unifyLogo from "@/assets/unify-logo-official.png.asset.json";

const UNIFY_LOGO = unifyLogo.url;
const UNIFY_MARK = unifyLogo.url;

const STORAGE_KEY = "unify_payment_claim_v1";
const COUNTER_KEY = "unify_claim_next_number";
const COUNTER_START = 1;
const ALLOWED_EMAILS = ["info.sayma20@gmail.com", "nesthana373@gmail.com"];

const getNextClaimNumber = (): { number: string; next: number } => {
  let next = COUNTER_START;
  try {
    const raw = localStorage.getItem(COUNTER_KEY);
    const parsed = raw ? parseInt(raw, 10) : NaN;
    if (!isNaN(parsed) && parsed >= COUNTER_START) next = parsed;
  } catch {}
  const year = new Date().getFullYear();
  return { number: `CLM-${year}-${String(next).padStart(3, "0")}`, next };
};

interface ClaimItem {
  id: string;
  name: string;
  basis?: string;
  qty: string;
  price: string;
  totalOverride?: string;
  active?: boolean;
}

interface ClaimData {
  customer_name: string;
  company_name: string;
  phone: string;
  email: string;
  address: string;
  claim_number: string;
  claim_date: string;
  due_date: string;
  ref_document: string;
  currency: string;
  discount: string;
  paid: string;
  intro: string;
  terms: string;
  bank_info: string;
  items: ClaimItem[];
  grand_override?: string;
}

const uid = () => Math.random().toString(36).slice(2, 10);

const DEFAULT_ITEMS: ClaimItem[] = [
  { id: uid(), name: "اشتراك نظام يونيفاي — الدفعة الأولى", basis: "حسب الاتفاقية", qty: "1", price: "0", active: true },
];

const DEFAULTS: ClaimData = {
  customer_name: "",
  company_name: "",
  phone: "",
  email: "",
  address: "",
  claim_number: "",
  claim_date: new Date().toISOString().split("T")[0],
  due_date: "",
  ref_document: "",
  currency: "ILS",
  discount: "",
  paid: "",
  intro:
    "تحية طيبة وبعد، نرفق لكم أدناه المطالبة المالية المستحقة عن خدمات نظام يونيفاي المحاسبي والإداري، وذلك وفق البنود والمبالغ الموضحة، راجين التكرم بالسداد قبل تاريخ الاستحقاق.",
  terms:
    "• المبالغ المذكورة أعلاه لا تشمل ضريبة القيمة المضافة إن وُجدت.\n• يُرجى السداد قبل تاريخ الاستحقاق المبيّن أعلاه.\n• يُرجى ذكر رقم المطالبة عند التحويل البنكي.\n• هذه المطالبة صادرة إلكترونياً ولا تحتاج إلى ختم.",
  bank_info: "اسم البنك: ..................  ·  اسم الحساب: ..................  ·  رقم الحساب / IBAN: ..................",
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

const UnifyPaymentClaimPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isSuperAdmin, loading: permLoading } = usePermission("any");
  const [data, setData] = useState<ClaimData>(DEFAULTS);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = { ...DEFAULTS, ...JSON.parse(saved) };
        if (!parsed.items?.length) parsed.items = DEFAULT_ITEMS;
        if (!parsed.claim_number || /-$/.test(parsed.claim_number)) {
          parsed.claim_number = getNextClaimNumber().number;
        }
        setData(parsed);
      } else {
        setData({ ...DEFAULTS, claim_number: getNextClaimNumber().number });
      }
    } catch {}
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
    }, 500);
    return () => clearTimeout(t);
  }, [data]);

  const update = <K extends keyof ClaimData>(k: K, v: ClaimData[K]) =>
    setData((d) => ({ ...d, [k]: v }));

  const updateItem = (id: string, patch: Partial<ClaimItem>) =>
    setData((d) => ({ ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) }));

  const addItem = () =>
    setData((d) => ({ ...d, items: [...d.items, { id: uid(), name: "", basis: "", qty: "1", price: "0", active: true }] }));

  const removeItem = (id: string) =>
    setData((d) => ({ ...d, items: d.items.filter((it) => it.id !== id) }));

  const moveItem = (id: string, direction: -1 | 1) =>
    setData((d) => {
      const currentIndex = d.items.findIndex((it) => it.id === id);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= d.items.length) return d;
      const items = [...d.items];
      [items[currentIndex], items[targetIndex]] = [items[targetIndex], items[currentIndex]];
      return { ...d, items };
    });

  const handleReset = () => {
    if (!confirm("هل تريد مسح كافة الحقول وإعادة النموذج للوضع الافتراضي؟")) return;
    setData({ ...DEFAULTS, items: DEFAULT_ITEMS.map((it) => ({ ...it, id: uid() })), claim_number: getNextClaimNumber().number });
    toast.success("تم مسح النموذج");
  };

  const handlePrint = () => {
    try {
      const { next } = getNextClaimNumber();
      localStorage.setItem(COUNTER_KEY, String(next + 1));
    } catch {}
    const originalTitle = document.title;
    document.title = " ";
    const restore = () => { document.title = originalTitle; window.removeEventListener("afterprint", restore); };
    window.addEventListener("afterprint", restore);
    window.print();
  };

  const allowed = isSuperAdmin || ALLOWED_EMAILS.includes((user?.email || "").toLowerCase());
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
    const computed = active ? num(it.qty) * num(it.price) : 0;
    const hasOverride = it.totalOverride !== undefined && it.totalOverride !== "";
    const lineTotal = active && hasOverride ? num(it.totalOverride!) : computed;
    return { ...it, active, computed, lineTotal };
  });

  const subtotal = rows.reduce((s, r) => s + r.lineTotal, 0);
  const discount = num(data.discount);
  const paid = num(data.paid);
  const computedGrand = Math.max(0, subtotal - discount - paid);
  const hasGrandOverride = data.grand_override !== undefined && data.grand_override !== "";
  const grand = hasGrandOverride ? num(data.grand_override) : computedGrand;

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
          input[type="date"]::-webkit-calendar-picker-indicator { display: none !important; -webkit-appearance: none !important; }
          input[type="date"] { -moz-appearance: textfield !important; appearance: textfield !important; }
        }
      `}</style>

      {/* Toolbar */}
      <div className="no-print sticky top-0 z-50 border-b bg-white/95 shadow-md backdrop-blur supports-[backdrop-filter]:bg-white/80">
        <div className="mx-auto flex max-w-[210mm] items-center gap-2 px-4 py-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowRight className="ml-1 h-4 w-4" /> رجوع
          </Button>
          <div className="flex-1 text-sm font-semibold text-slate-700">مطالبة مالية — يونيفاي</div>
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
        {/* Watermark */}
        <div aria-hidden="true" className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none">
          <img src={UNIFY_MARK} alt="" className="h-auto w-[420px] opacity-[0.05]" />
        </div>

        <div className="relative z-10">
          {/* Header */}
          <div className="mb-6 grid grid-cols-3 items-center border-b-2 border-[#0D1B2E] pb-4">
            <div className="text-left">
              <div className="text-xs text-slate-500">تاريخ المطالبة</div>
              <Field type="date" value={data.claim_date} onChange={(v) => update("claim_date", v)} width="150px" />
              <div className="mt-2 text-xs text-slate-500">تاريخ الاستحقاق</div>
              <Field type="date" value={data.due_date} onChange={(v) => update("due_date", v)} width="150px" />
            </div>
            <div className="flex justify-center">
              <img src={UNIFY_LOGO} alt="يونيفاي" className="h-36 object-contain" />
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-500">رقم المطالبة</div>
              <Field value={data.claim_number} onChange={(v) => update("claim_number", v)} width="180px" />
              <div className="mt-2 text-xs text-slate-500">العملة</div>
              <select
                value={data.currency}
                onChange={(e) => update("currency", e.target.value)}
                className="border-b border-dashed border-slate-400 bg-transparent px-1 text-slate-900 outline-none print:border-transparent"
              >
                <option value="ILS">شيكل إسرائيلي (ILS)</option>
                <option value="USD">دولار أمريكي (USD)</option>
                <option value="JOD">دينار أردني (JOD)</option>
                <option value="EUR">يورو (EUR)</option>
              </select>
            </div>
          </div>

          {/* Title */}
          <h1 className="mb-6 text-center text-2xl font-bold text-[#0D1B2E]">مطالبــة ماليــة</h1>

          {/* Customer */}
          <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2">
            <div className="flex items-start gap-3">
              <span className="pt-0.5 text-[11.5px] font-bold text-[#0D1B2E] whitespace-nowrap">مقدمة إلى:</span>
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
                <div className="col-span-4 flex items-baseline gap-1">
                  <span className="w-12 shrink-0 text-slate-500">العنوان:</span>
                  <Field value={data.address} onChange={(v) => update("address", v)} width="100%" />
                </div>
                <div className="col-span-4 flex items-baseline gap-1">
                  <span className="w-16 shrink-0 text-slate-500">المرجع:</span>
                  <Field value={data.ref_document} onChange={(v) => update("ref_document", v)} placeholder="رقم الاتفاقية / عرض السعر" width="100%" />
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
              <span className="inline-flex h-6 w-8 items-center justify-center rounded-md bg-slate-100 text-[11px] font-bold text-[#0D1B2E]">01</span>
              <h2 className="text-base font-bold text-[#0D1B2E]">تفاصيل المطالبة</h2>
            </div>
            <div className="no-print text-[11.5px] text-slate-500">اضغط على البند لإخفائه/إظهاره</div>
          </div>

          {/* Items */}
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <table className="w-full border-collapse text-[12.5px]">
              <thead>
                <tr className="bg-[#0D1B2E] text-[11px] font-semibold text-white leading-tight">
                  <th className="px-3 py-1 text-right text-[10.5px] font-medium whitespace-nowrap">البيان</th>
                  <th className="px-3 py-1 text-center w-16 text-[10.5px] font-medium whitespace-nowrap">الكمية</th>
                  <th className="px-3 py-1 text-center w-24 text-[10.5px] font-medium whitespace-nowrap">السعر</th>
                  <th className="px-3 py-1 text-center w-28 text-[10.5px] font-medium whitespace-nowrap">المجموع</th>
                  <th className="px-2 py-1 w-[86px] no-print row-delete text-center text-[10.5px] font-medium whitespace-nowrap">ترتيب</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, index) => (
                  <tr
                    key={r.id}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("input,button,textarea,select")) return;
                      updateItem(r.id, { active: !r.active });
                    }}
                    className={`cursor-pointer border-t border-slate-100 transition hover:bg-slate-50 ${r.active ? "" : "opacity-40 line-through decoration-slate-300 print:hidden"}`}
                  >
                    <td className="px-3 py-2.5 align-middle">
                      <input
                        value={r.name}
                        onChange={(e) => updateItem(r.id, { name: e.target.value })}
                        className="w-full border-0 bg-transparent p-0 text-[13px] font-semibold text-[#0D1B2E] outline-none focus:ring-0"
                        placeholder="اسم البند"
                      />
                      <input
                        value={r.basis || ""}
                        onChange={(e) => updateItem(r.id, { basis: e.target.value })}
                        placeholder="ملاحظة / أساس الاحتساب"
                        className="mt-0.5 w-full border-0 bg-transparent p-0 text-[11px] text-slate-400 outline-none focus:ring-0"
                      />
                    </td>
                    <td className="px-3 py-2.5 align-middle text-center">
                      <input
                        value={r.qty}
                        onChange={(e) => updateItem(r.id, { qty: e.target.value })}
                        className="mx-auto block w-12 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-center text-[13px] tabular-nums text-[#0D1B2E] outline-none focus:border-[#0D1B2E] focus:ring-1 focus:ring-[#0D1B2E]/20 print:border-transparent print:bg-transparent"
                      />
                    </td>
                    <td className="px-3 py-2.5 align-middle text-center">
                      <div className="flex items-center justify-center gap-0.5 text-[13px] font-semibold text-[#0D1B2E] tabular-nums">
                        <span>{currencySymbol}</span>
                        <input
                          value={r.price}
                          onChange={(e) => updateItem(r.id, { price: e.target.value })}
                          className="w-16 border-0 bg-transparent p-0 text-center outline-none focus:ring-0"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-2.5 align-middle text-center">
                      <div className="flex items-center justify-center gap-0.5 text-[13px] font-bold text-[#0D1B2E] tabular-nums">
                        <span>{currencySymbol}</span>
                        <input
                          value={r.totalOverride !== undefined && r.totalOverride !== "" ? r.totalOverride : fmt(r.lineTotal)}
                          onChange={(e) => updateItem(r.id, { totalOverride: e.target.value })}
                          onFocus={(e) => {
                            if (r.totalOverride === undefined || r.totalOverride === "") {
                              updateItem(r.id, { totalOverride: String(r.computed) });
                            }
                            e.currentTarget.select();
                          }}
                          onDoubleClick={() => updateItem(r.id, { totalOverride: "" })}
                          title="اضغط مرتين لإرجاع القيمة المحسوبة"
                          className="w-24 border-0 bg-transparent p-0 text-center outline-none focus:ring-0"
                        />
                      </div>
                    </td>
                    <td className="px-2 py-2.5 text-center no-print row-delete">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => moveItem(r.id, -1)}
                          disabled={index === 0}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                          title="نقل للأعلى"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveItem(r.id, 1)}
                          disabled={index === rows.length - 1}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                          title="نقل للأسفل"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => removeItem(r.id)} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-400 hover:bg-red-50 hover:text-red-600" title="حذف البند">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="mt-4 flex justify-end">
            <div className="w-full max-w-sm overflow-hidden rounded-xl border border-slate-200 bg-white text-[13px]">
              <div className="flex items-center justify-between px-4 py-2">
                <span className="text-slate-600">المجموع</span>
                <span className="font-semibold text-[#0D1B2E] tabular-nums">{currencySymbol}{fmt(subtotal)}</span>
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
              <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-2">
                <span className="text-slate-600">المدفوع سابقاً</span>
                <div className="flex items-center gap-2">
                  <input
                    value={data.paid}
                    onChange={(e) => update("paid", e.target.value)}
                    placeholder="0"
                    className="h-7 w-16 rounded-md border border-slate-200 bg-white px-1.5 text-center text-[12.5px] tabular-nums outline-none focus:border-[#0D1B2E] focus:ring-1 focus:ring-[#0D1B2E]/20 print:border-transparent"
                  />
                  <span className="w-20 text-left font-semibold text-slate-600 tabular-nums">- {currencySymbol}{fmt(paid)}</span>
                </div>
              </div>
              <div className="flex items-center justify-between border-t-2 border-[#0D1B2E] bg-[#0D1B2E] px-4 py-3 text-white">
                <span className="text-[13px] font-bold">المبلغ المستحق للدفع</span>
                <div className="flex items-center gap-1 text-lg font-bold tabular-nums">
                  <span>{currencySymbol}</span>
                  <input
                    value={hasGrandOverride ? data.grand_override! : fmt(grand)}
                    onChange={(e) => update("grand_override", e.target.value)}
                    onFocus={(e) => {
                      if (!hasGrandOverride) update("grand_override", String(computedGrand));
                      e.currentTarget.select();
                    }}
                    onDoubleClick={() => update("grand_override", "")}
                    title="اضغط مرتين لإرجاع القيمة المحسوبة"
                    className="w-28 border-0 bg-transparent p-0 text-center text-white outline-none focus:ring-0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Add row */}
          <div className="no-print mt-2">
            <Button variant="outline" size="sm" onClick={addItem}>
              <Plus className="ml-1 h-4 w-4" /> إضافة بند
            </Button>
          </div>

          {/* Bank info */}
          <div className="mt-6">
            <div className="mb-1 font-bold text-[#0D1B2E]">بيانات السداد:</div>
            <textarea
              value={data.bank_info}
              onChange={(e) => update("bank_info", e.target.value)}
              rows={2}
              className="w-full rounded border border-dashed border-slate-400 bg-transparent p-2 text-[12.5px] leading-6 outline-none focus:border-solid focus:border-primary print:border-transparent"
            />
          </div>

          {/* Terms */}
          <div className="mt-4">
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
              <div className="font-bold text-[#0D1B2E]">عن شركة يونيفاي</div>
              <div className="mt-1 text-xs text-slate-500">(الإدارة المالية)</div>
              <div className="mt-14 border-t border-slate-400 pt-1 text-xs">الاسم والتوقيع</div>
            </div>
            <div className="text-center">
              <div className="font-bold text-[#0D1B2E]">استلام الزبون</div>
              <div className="mt-1 text-xs text-slate-500">({data.customer_name || "اسم الزبون"})</div>
              <div className="mt-14 border-t border-slate-400 pt-1 text-xs">الاسم والتوقيع</div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 border-t pt-2 text-center text-[10px] text-slate-500">
            يونيفاي — حلول محاسبية وإدارية ذكية · www.unifyerp.app
          </div>
        </div>
      </div>
    </div>
  );
};

export default UnifyPaymentClaimPage;
