import { useState, useEffect, useMemo } from "react";
import {
  CreditCard, Banknote, AlertCircle, ShieldCheck, ArrowRightLeft,
  Coins, UserCheck, Split, Search, Plus, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type NewMethod = "cash" | "card" | "credit" | "employee_account" | "mixed";

const METHOD_OPTIONS: { value: NewMethod; label: string; Icon: any }[] = [
  { value: "cash",             label: "نقدي",        Icon: Banknote     },
  { value: "card",             label: "بطاقة (فيزا)", Icon: CreditCard   },
  { value: "credit",           label: "آجل",         Icon: ArrowRightLeft },
  { value: "employee_account", label: "حساب موظف",   Icon: UserCheck    },
  { value: "mixed",            label: "دفع مختلط",   Icon: Split        },
];

const SPLIT_METHODS: { value: "cash" | "card" | "credit"; label: string; Icon: any }[] = [
  { value: "cash",   label: "نقدي",  Icon: Banknote     },
  { value: "card",   label: "بطاقة", Icon: CreditCard   },
  { value: "credit", label: "آجل",   Icon: ArrowRightLeft },
];

interface SplitLine {
  method: "cash" | "card" | "credit";
  amount: number;
  /** For card lines only — routes AR to specific delivery-app visa account. */
  visa_gl_account_code?: string | null;
  /** Line currency — ILS by default. */
  currency?: string;
  /** Foreign-currency amount actually received. When currency='ILS' equals amount. */
  foreign_amount?: number;
  /** Explicit exchange rate (foreign_amount * rate = amount(ILS)). */
  exchange_rate?: number;
  /** Change given back on this line (in change_currency). */
  change_amount?: number;
  change_currency?: string;
}

interface EmpRow { id: string; full_name: string; account_code?: string | null }

interface VisaAppRow { id: string; name: string; visa_gl_account_code: string }

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string | null;
  orderTotal: number;
  currentMethod: string;
  /** Tenant/owner id — used to load employees for the employee-account picker. */
  companyId?: string | null;
  /** العملة الحالية للدفعة (من pos_payments). */
  currentCurrency?: string;
  /** عدد دفعات هذا الطلب — تغيير العملة ممنوع إذا > 1. */
  paymentsCount?: number;
  /** أسعار صرف العملات للمستخدم (code -> ILS rate). */
  exchangeRates?: Record<string, number>;
  /** Minutes since the invoice was paid. Used for display + window bypass check. */
  ageMinutes: number;
  /** Allowed window in minutes (default 30). Outside this window, a manager
   *  approval is required. */
  windowMinutes?: number;
  /** POS user id of the acting cashier (for audit). */
  posUserId?: string | null;
  /** If manager already pre-approved (e.g. through Manager Mode), pass id. */
  managerUserId?: string | null;
  onSuccess: () => void;
}

export default function ChangePaymentMethodDialog({
  open,
  onClose,
  orderId,
  orderNumber,
  orderTotal,
  currentMethod,
  companyId,
  currentCurrency = "ILS",
  paymentsCount = 1,
  exchangeRates = {},
  ageMinutes,
  windowMinutes = 30,
  posUserId,
  managerUserId,
  onSuccess,
}: Props) {
  const [newMethod, setNewMethod] = useState<NewMethod>(
    currentMethod === "cash" ? "card" : "cash",
  );
  const [newCurrency, setNewCurrency] = useState<string>(currentCurrency || "ILS");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // المبلغ المستلم بالعملة الأجنبية (قابل للتعديل من الكاشير).
  const [foreignAmountInput, setForeignAmountInput] = useState<string>("");

  // ── employee_account state ───────────────────────────────────────────
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [empSearch, setEmpSearch] = useState("");
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [loadingEmps, setLoadingEmps] = useState(false);

  // ── mixed (split) state — initialize with current total split 50/50 cash+card
  const [splitLines, setSplitLines] = useState<SplitLine[]>([
    { method: "cash", amount: Math.round((orderTotal / 2) * 100) / 100, currency: "ILS", foreign_amount: Math.round((orderTotal / 2) * 100) / 100, exchange_rate: 1 },
    { method: "card", amount: Math.round((orderTotal - Math.round((orderTotal / 2) * 100) / 100) * 100) / 100, currency: "ILS", foreign_amount: Math.round((orderTotal - Math.round((orderTotal / 2) * 100) / 100) * 100) / 100, exchange_rate: 1 },
  ]);

  // ── visa-app routing (for card): pick which delivery-app visa AR account
  //   to debit (Wheels 1131 / Yummy 1132 / FoodOnTime 1133…). Empty string
  //   means "regular bank card" → default card_bank_account_id (1120).
  const [visaGlAccountCode, setVisaGlAccountCode] = useState<string>("");
  const [visaApps, setVisaApps] = useState<VisaAppRow[]>([]);
  const needsVisaPicker = newMethod === "card" || (newMethod === "mixed" && splitLines.some(l => l.method === "card"));
  useEffect(() => {
    if (!needsVisaPicker || !companyId || visaApps.length > 0) return;
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("delivery_apps" as any)
        .select("id, name, visa_gl_account_code, is_active")
        .eq("user_id", companyId)
        .eq("is_active", true)
        .order("name", { ascending: true });
      if (cancel) return;
      const rows = ((data as any[]) || [])
        .filter(a => a.visa_gl_account_code)
        .map(a => ({ id: a.id, name: a.name, visa_gl_account_code: a.visa_gl_account_code as string }));
      setVisaApps(rows);
    })();
    return () => { cancel = true; };
  }, [needsVisaPicker, companyId, visaApps.length]);

  // Lazy-load employees when picker is needed.
  useEffect(() => {
    if (newMethod !== "employee_account" || employees.length > 0 || !companyId) return;
    let cancel = false;
    setLoadingEmps(true);
    (async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name")
        .eq("user_id", companyId)
        .eq("is_active", true)
        .order("full_name", { ascending: true })
        .limit(500);
      if (cancel) return;
      if (error) toast.error("تعذّر تحميل الموظفين: " + error.message);
      else setEmployees(((data as any[]) || []).map(d => ({ id: d.id, full_name: d.full_name })));
      setLoadingEmps(false);
    })();
    return () => { cancel = true; };
  }, [newMethod, companyId, employees.length]);

  const filteredEmps = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    if (!q) return employees.slice(0, 30);
    return employees.filter(e => e.full_name.toLowerCase().includes(q)).slice(0, 30);
  }, [employees, empSearch]);

  const splitTotal = splitLines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const splitRemaining = Math.round((orderTotal - splitTotal) * 100) / 100;
  const splitValid = Math.abs(splitRemaining) <= 0.01 && splitLines.every(l => l.amount > 0);

  const needsManager = ageMinutes > windowMinutes && !managerUserId;
  const currencyChanged = newCurrency.toUpperCase() !== (currentCurrency || "ILS").toUpperCase();
  const sameAsCurrent =
    newMethod === currentMethod &&
    !currencyChanged &&
    newMethod !== "mixed" &&
    newMethod !== "employee_account"; // emp_account always requires selection → allow re-trigger
  // تغيير العملة مسموح فقط: cash + دفعة واحدة + مش credit/card.
  const canChangeCurrency = newMethod === "cash" && paymentsCount <= 1;
  const newRate = newCurrency.toUpperCase() === "ILS" ? 1 : (exchangeRates[newCurrency] || 0);
  const defaultForeign = newRate > 0 ? orderTotal / newRate : 0;
  const foreignAmount = foreignAmountInput.trim() === "" ? defaultForeign : parseFloat(foreignAmountInput);
  // سعر الصرف الفعلي بناءً على المبلغ المُدخل (لو الكاشير غيّره).
  const effectiveRate = foreignAmount > 0 ? orderTotal / foreignAmount : newRate;
  // عملات يدعمها النظام (نظهر فقط ما هو موجود في exchangeRates + ILS دوماً).
  const availableCurrencies = ["ILS", ...Object.keys(exchangeRates).filter(c => c.toUpperCase() !== "ILS")];

  const handleSubmit = async () => {
    if (sameAsCurrent) {
      toast.error("لا يوجد تغيير");
      return;
    }
    if (needsManager) {
      toast.error("انتهت مدة السماح — يلزم تفعيل وضع المدير من سجل الفواتير أولاً");
      return;
    }
    if (currencyChanged && !canChangeCurrency) {
      toast.error("تغيير العملة مسموح فقط للدفع النقدي بدفعة واحدة");
      return;
    }
    if (currencyChanged && newCurrency.toUpperCase() !== "ILS" && (!newRate || newRate <= 0)) {
      toast.error("سعر الصرف غير متوفر للعملة المختارة");
      return;
    }
    if (newMethod === "employee_account" && !selectedEmpId) {
      toast.error("اختر الموظف أولاً");
      return;
    }
    if (newMethod === "mixed") {
      if (splitLines.length < 2) { toast.error("الدفع المختلط يتطلب دفعتين على الأقل"); return; }
      if (!splitValid) {
        toast.error(`مجموع الدفعات لا يطابق الإجمالي — متبقّي ${splitRemaining.toFixed(2)} ₪`);
        return;
      }
    }
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("change_pos_payment_method", {
        p_order_id: orderId,
        p_new_method: newMethod,
        p_edit_reason: reason.trim() || null,
        p_pos_user_id: posUserId || null,
        p_manager_user_id: managerUserId || null,
        p_window_minutes: windowMinutes,
        p_new_currency: currencyChanged && newMethod !== "mixed" ? newCurrency.toUpperCase() : null,
        p_new_exchange_rate: currencyChanged && newMethod !== "mixed" ? effectiveRate : null,
        p_employee_id: newMethod === "employee_account" ? selectedEmpId : null,
        p_split_payments: newMethod === "mixed"
          ? splitLines.map(l => ({
              method: l.method,
              amount: Number(l.amount) || 0,
              ...(l.method === "card" && l.visa_gl_account_code
                ? { visa_gl_account_code: l.visa_gl_account_code }
                : {}),
            }))
          : null,
        p_visa_gl_account_code:
          newMethod === "card" && visaGlAccountCode ? visaGlAccountCode : null,
      });
      if (error) {
        const msg = (error.message || "").toString();
        if (msg.includes("WINDOW_EXPIRED")) toast.error("انتهت مدة السماح — يلزم موافقة مدير");
        else if (msg.includes("SESSION_NOT_OPEN")) toast.error("لا يمكن التعديل — الوردية مغلقة");
        else if (msg.includes("ORDER_CANCELLED")) toast.error("الفاتورة ملغية");
        else if (msg.includes("ORDER_IS_RETURN")) toast.error("الفاتورة مرتجع");
        else if (msg.includes("ORDER_NOT_PAID")) toast.error("الفاتورة غير مدفوعة");
        else if (msg.includes("ACCESS_DENIED")) toast.error("غير مصرّح");
        else if (msg.includes("INVALID_PAYMENT_METHOD")) toast.error("طريقة دفع غير مدعومة");
        else if (msg.includes("EMPLOYEE_REQUIRED")) toast.error("اختر الموظف أولاً");
        else if (msg.includes("EMPLOYEE_NOT_FOUND")) toast.error("الموظف غير موجود");
        else if (msg.includes("SPLIT_PAYMENTS_REQUIRED")) toast.error("أدخل دفعات الدفع المختلط");
        else if (msg.includes("SPLIT_INVALID_METHOD")) toast.error("الدفع المختلط يدعم: نقدي/بطاقة/آجل");
        else if (msg.includes("SPLIT_INVALID_AMOUNT")) toast.error("قيمة الدفعة يجب أن تكون أكبر من صفر");
        else if (msg.includes("SPLIT_AMOUNT_MISMATCH")) toast.error("مجموع الدفعات لا يطابق إجمالي الفاتورة");
        else if (msg.includes("CURRENCY_REQUIRES_SINGLE_METHOD")) toast.error("تغيير العملة غير مدعوم مع الدفع المختلط");
        else if (msg.includes("MULTI_PAYMENT_CURRENCY_CHANGE_BLOCKED")) toast.error("تغيير العملة ممنوع على الفواتير المقسّمة");
        else if (msg.includes("CURRENCY_REQUIRES_CASH")) toast.error("تغيير العملة مسموح فقط مع النقدي");
        else if (msg.includes("INVALID_EXCHANGE_RATE")) toast.error("سعر الصرف غير صالح");
        else if (msg.includes("UNKNOWN_CURRENCY")) toast.error("العملة غير معرفة");
        else toast.error("تعذّر التعديل: " + msg);
        return;
      }
      const okMsg =
        newMethod === "employee_account" ? "تم تحويل الفاتورة إلى حساب موظف بنجاح" :
        newMethod === "mixed"            ? "تم تحويل الفاتورة إلى دفع مختلط بنجاح" :
        currencyChanged                  ? "تم تعديل طريقة الدفع والعملة بنجاح" :
                                           "تم تعديل طريقة الدفع بنجاح";
      toast.success(okMsg);
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !submitting) onClose(); }}>
      <DialogContent className="max-w-md z-[1200] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRightLeft className="h-5 w-5 text-amber-500" />
            تعديل طريقة الدفع
          </DialogTitle>
        </DialogHeader>

        <div className="py-3 space-y-4">
          <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">الفاتورة</span>
              <span className="font-mono">#{orderNumber || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">الإجمالي</span>
              <span className="font-mono font-semibold">₪{orderTotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">الطريقة الحالية</span>
              <span className="font-semibold">
                {currentMethod === "cash" ? "نقدي" :
                 currentMethod === "card" ? "بطاقة" :
                 currentMethod === "credit" ? "آجل" : currentMethod}
                {currentCurrency && currentCurrency.toUpperCase() !== "ILS" && (
                  <span className="text-amber-600 ms-1">({currentCurrency})</span>
                )}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">مضى على الدفع</span>
              <span className={ageMinutes > windowMinutes ? "text-destructive font-semibold" : ""}>
                {Math.floor(ageMinutes)} د / {windowMinutes} د
              </span>
            </div>
          </div>

          {needsManager && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                انتهت مدة السماح ({windowMinutes} دقيقة). فعّل "وضع المدير" من رأس سجل الفواتير ثم أعد المحاولة.
              </span>
            </div>
          )}

          {managerUserId && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 text-amber-700 text-xs">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>تعديل بصلاحية المدير — يتم تسجيله في سجل التدقيق.</span>
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              الطريقة الجديدة
            </label>
            <div className="grid grid-cols-3 gap-2">
              {METHOD_OPTIONS.map(opt => {
                const Icon = opt.Icon;
                const selected = newMethod === opt.value;
                const isCurrent = currentMethod === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => {
                      setNewMethod(opt.value);
                      // إذا انتقل لـ card/credit، أرجِع العملة لشيكل تلقائياً.
                      if (opt.value !== "cash") setNewCurrency("ILS");
                    }}
                    className={`flex flex-col items-center gap-1 p-2.5 rounded-lg border text-[11px] transition-all
                      ${selected ? "border-amber-500 bg-amber-50 text-amber-700 font-semibold" : "border-input hover:bg-muted"}
                      ${isCurrent && newCurrency.toUpperCase() === (currentCurrency || "ILS").toUpperCase() ? "ring-1 ring-muted-foreground/30" : ""}`}
                  >
                    <Icon className="h-4 w-4" />
                    {opt.label}
                    {isCurrent && <span className="text-[9px] text-muted-foreground">الحالية</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── VISA APP PICKER (single-card only) ────────────────────── */}
          {newMethod === "card" && visaApps.length > 0 && (
            <div className="rounded-lg border border-sky-200 bg-sky-50/40 p-3 space-y-1.5">
              <label className="text-xs font-semibold text-sky-700 flex items-center gap-1">
                <CreditCard className="h-3.5 w-3.5" /> جهة استلام الفيزا
              </label>
              <select
                value={visaGlAccountCode}
                onChange={e => setVisaGlAccountCode(e.target.value)}
                className="h-9 w-full text-sm rounded-md border border-input bg-background px-2"
              >
                <option value="">بطاقة عادية (البنك)</option>
                {visaApps.map(a => (
                  <option key={a.id} value={a.visa_gl_account_code}>
                    {a.name} — {a.visa_gl_account_code}
                  </option>
                ))}
              </select>
              <div className="text-[10px] text-sky-700/80 leading-relaxed">
                ⓘ يحدد حساب ذمم الفيزا الذي سيتم ترحيل القيمة عليه (مثال: ويلز / يمي / فوداونتايم). إذا تركته "بطاقة عادية" فسيذهب على حساب البنك الافتراضي.
              </div>
            </div>
          )}

          {/* ── EMPLOYEE PICKER ───────────────────────────────────────── */}
          {newMethod === "employee_account" && (
            <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3 space-y-2">
              <label className="text-xs font-semibold text-violet-700 flex items-center gap-1">
                <UserCheck className="h-3.5 w-3.5" /> اختر الموظف
              </label>
              <div className="relative">
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={empSearch}
                  onChange={e => setEmpSearch(e.target.value)}
                  placeholder="ابحث باسم الموظف..."
                  className="h-8 text-sm pe-7"
                />
              </div>
              <div className="max-h-40 overflow-y-auto rounded-md border bg-background">
                {loadingEmps && <div className="p-2 text-xs text-muted-foreground">جاري التحميل...</div>}
                {!loadingEmps && filteredEmps.length === 0 && (
                  <div className="p-2 text-xs text-muted-foreground">لا يوجد موظفين</div>
                )}
                {filteredEmps.map(emp => (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => setSelectedEmpId(emp.id)}
                    className={`w-full text-right text-xs px-2.5 py-1.5 border-b last:border-b-0 transition
                      ${selectedEmpId === emp.id ? "bg-violet-100 font-semibold text-violet-800" : "hover:bg-muted/50"}`}
                  >
                    {emp.full_name}
                    {emp.account_code && <span className="text-[10px] text-muted-foreground ms-2">#{emp.account_code}</span>}
                  </button>
                ))}
              </div>
              <div className="text-[10px] text-violet-700/80 leading-relaxed">
                ⓘ سيتم تسجيل قيمة الفاتورة كاملة ({orderTotal.toFixed(2)} ₪) كمدين على كشف حساب الموظف.
                {currentMethod === "employee_account" ? "" :
                  " إذا كانت الفاتورة سابقًا على حساب موظف فستُعكس الحركة القديمة تلقائيًا."}
              </div>
            </div>
          )}

          {/* ── SPLIT (MIXED) BUILDER ─────────────────────────────────── */}
          {newMethod === "mixed" && (
            <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-blue-700 flex items-center gap-1">
                  <Split className="h-3.5 w-3.5" /> دفعات الدفع المختلط
                </label>
                <span className={`text-[11px] font-mono ${Math.abs(splitRemaining) <= 0.01 ? "text-emerald-700" : "text-destructive"}`}>
                  متبقّي: {splitRemaining.toFixed(2)} ₪
                </span>
              </div>
              <div className="space-y-2">
                {splitLines.map((line, idx) => (
                  <div key={idx} className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={line.method}
                      onChange={e => {
                        const v = e.target.value as "cash" | "card" | "credit";
                        setSplitLines(prev => prev.map((l, i) => i === idx ? { ...l, method: v, visa_gl_account_code: v === "card" ? l.visa_gl_account_code : null } : l));
                      }}
                      className="h-8 text-xs rounded-md border border-input bg-background px-2"
                    >
                      {SPLIT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                    </select>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={line.amount}
                      onChange={e => {
                        const v = parseFloat(e.target.value) || 0;
                        setSplitLines(prev => prev.map((l, i) => i === idx ? { ...l, amount: v } : l));
                      }}
                      className="h-8 text-sm font-mono flex-1"
                      dir="ltr"
                    />
                    <span className="text-[10px] text-muted-foreground">₪</span>
                    {splitLines.length > 2 && (
                      <Button
                        type="button" variant="ghost" size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={() => setSplitLines(prev => prev.filter((_, i) => i !== idx))}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  {line.method === "card" && visaApps.length > 0 && (
                    <select
                      value={line.visa_gl_account_code || ""}
                      onChange={e => {
                        const v = e.target.value || null;
                        setSplitLines(prev => prev.map((l, i) => i === idx ? { ...l, visa_gl_account_code: v } : l));
                      }}
                      className="h-7 w-full text-[11px] rounded-md border border-input bg-background px-2 text-sky-700"
                    >
                      <option value="">بطاقة عادية (البنك)</option>
                      {visaApps.map(a => (
                        <option key={a.id} value={a.visa_gl_account_code}>
                          فيزا: {a.name} — {a.visa_gl_account_code}
                        </option>
                      ))}
                    </select>
                  )}
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between gap-2">
                <Button
                  type="button" variant="outline" size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => setSplitLines(prev => [...prev, { method: "cash", amount: Math.max(0, splitRemaining) }])}
                  disabled={splitLines.length >= 5}
                >
                  <Plus className="h-3 w-3 ml-1" /> إضافة دفعة
                </Button>
                <Button
                  type="button" variant="ghost" size="sm"
                  className="h-7 text-[11px]"
                  onClick={() => {
                    // Auto-fill last line with the remaining amount
                    setSplitLines(prev => {
                      const sumOthers = prev.slice(0, -1).reduce((s, l) => s + (Number(l.amount) || 0), 0);
                      const last = Math.max(0, Math.round((orderTotal - sumOthers) * 100) / 100);
                      return prev.map((l, i) => i === prev.length - 1 ? { ...l, amount: last } : l);
                    });
                  }}
                >
                  موازنة المتبقّي
                </Button>
              </div>
              <div className="text-[10px] text-blue-700/80">
                ⓘ مجموع الدفعات يجب أن يساوي {orderTotal.toFixed(2)} ₪ بالضبط. كل الدفعات بالشيكل.
              </div>
            </div>
          )}

          {/* ── العملة الجديدة (للنقدي فقط، دفعة واحدة) ── */}
          {canChangeCurrency && availableCurrencies.length > 1 && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <Coins className="h-3.5 w-3.5" />
                العملة المستلمة
              </label>
              <div className="grid grid-cols-3 gap-2">
                {availableCurrencies.map(code => {
                  const selected = newCurrency.toUpperCase() === code.toUpperCase();
                  const isCurrent = (currentCurrency || "ILS").toUpperCase() === code.toUpperCase();
                  const rate = code.toUpperCase() === "ILS" ? 1 : (exchangeRates[code] || 0);
                  const disabled = code.toUpperCase() !== "ILS" && rate <= 0;
                  return (
                    <button
                      key={code}
                      type="button"
                      disabled={disabled}
                      onClick={() => setNewCurrency(code)}
                      className={`p-2 rounded-lg border text-xs transition-all flex flex-col items-center gap-0.5
                        ${selected ? "border-amber-500 bg-amber-50 text-amber-700 font-semibold" : "border-input hover:bg-muted"}
                        ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
                    >
                      <span>{code === "ILS" ? "شيكل" : code === "JOD" ? "دينار" : code === "USD" ? "دولار" : code}</span>
                      {isCurrent && <span className="text-[9px] text-muted-foreground">الحالية</span>}
                    </button>
                  );
                })}
              </div>
              {currencyChanged && newRate > 0 && (
                <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-800 space-y-2">
                  <div className="flex justify-between">
                    <span>سعر الصرف المرجعي:</span>
                    <span className="font-mono">1 {newCurrency} = {newRate.toFixed(4)} ₪</span>
                  </div>
                  <div>
                    <label className="block mb-1 font-semibold">المبلغ المُستلم ({newCurrency})</label>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={foreignAmountInput}
                        onChange={e => setForeignAmountInput(e.target.value)}
                        placeholder={defaultForeign.toFixed(2)}
                        className="h-8 text-sm font-mono"
                        dir="ltr"
                      />
                      <span className="text-[10px] whitespace-nowrap">≈ ₪{(foreignAmount * effectiveRate).toFixed(2)}</span>
                    </div>
                    {foreignAmountInput.trim() !== "" && Math.abs(effectiveRate - newRate) > 0.0001 && (
                      <div className="mt-1 text-[10px] text-amber-700">
                        سعر الصرف الفعلي: 1 {newCurrency} = {effectiveRate.toFixed(4)} ₪
                      </div>
                    )}
                  </div>
                  <div className="text-[10px] text-amber-700/80">
                    ⓘ ينقل المبلغ من درج {currentCurrency || "ILS"} إلى درج {newCurrency} في إغلاق العهدة.
                  </div>
                </div>
              )}
            </div>
          )}
          {!canChangeCurrency && newMethod === "cash" && paymentsCount > 1 && (
            <div className="text-[10px] text-muted-foreground italic">
              ⓘ لا يمكن تغيير العملة — الفاتورة فيها أكثر من دفعة.
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              سبب التعديل (اختياري)
            </label>
            <Input
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="مثال: الزبون رجع وحاسب فيزا بدل النقد"
              className="h-9 text-sm"
              maxLength={200}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={submitting}>
            إلغاء
          </Button>
          <Button
            size="sm"
            disabled={submitting || sameAsCurrent || needsManager}
            onClick={handleSubmit}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {submitting ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                جاري الحفظ...
              </span>
            ) : (
              "تأكيد التعديل"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}