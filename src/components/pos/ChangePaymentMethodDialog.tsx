import { useState } from "react";
import { CreditCard, Banknote, AlertCircle, ShieldCheck, ArrowRightLeft, Coins } from "lucide-react";
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

const METHOD_OPTIONS: { value: "cash" | "card" | "credit"; label: string; Icon: any }[] = [
  { value: "cash", label: "نقدي", Icon: Banknote },
  { value: "card", label: "بطاقة (فيزا)", Icon: CreditCard },
  { value: "credit", label: "آجل", Icon: ArrowRightLeft },
];

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string | null;
  orderTotal: number;
  currentMethod: string;
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
  currentCurrency = "ILS",
  paymentsCount = 1,
  exchangeRates = {},
  ageMinutes,
  windowMinutes = 30,
  posUserId,
  managerUserId,
  onSuccess,
}: Props) {
  const [newMethod, setNewMethod] = useState<"cash" | "card" | "credit">(
    currentMethod === "cash" ? "card" : "cash",
  );
  const [newCurrency, setNewCurrency] = useState<string>(currentCurrency || "ILS");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  // المبلغ المستلم بالعملة الأجنبية (قابل للتعديل من الكاشير).
  const [foreignAmountInput, setForeignAmountInput] = useState<string>("");

  const needsManager = ageMinutes > windowMinutes && !managerUserId;
  const currencyChanged = newCurrency.toUpperCase() !== (currentCurrency || "ILS").toUpperCase();
  const sameAsCurrent = newMethod === currentMethod && !currencyChanged;
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
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("change_pos_payment_method", {
        p_order_id: orderId,
        p_new_method: newMethod,
        p_edit_reason: reason.trim() || null,
        p_pos_user_id: posUserId || null,
        p_manager_user_id: managerUserId || null,
        p_window_minutes: windowMinutes,
        p_new_currency: currencyChanged ? newCurrency.toUpperCase() : null,
        p_new_exchange_rate: currencyChanged ? effectiveRate : null,
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
        else if (msg.includes("MULTI_PAYMENT_CURRENCY_CHANGE_BLOCKED")) toast.error("تغيير العملة ممنوع على الفواتير المقسّمة");
        else if (msg.includes("CURRENCY_REQUIRES_CASH")) toast.error("تغيير العملة مسموح فقط مع النقدي");
        else if (msg.includes("INVALID_EXCHANGE_RATE")) toast.error("سعر الصرف غير صالح");
        else if (msg.includes("UNKNOWN_CURRENCY")) toast.error("العملة غير معرفة");
        else toast.error("تعذّر التعديل: " + msg);
        return;
      }
      toast.success(currencyChanged ? "تم تعديل طريقة الدفع والعملة بنجاح" : "تم تعديل طريقة الدفع بنجاح");
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
      <DialogContent className="max-w-sm z-[1200]" dir="rtl">
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
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-xs transition-all
                      ${selected ? "border-amber-500 bg-amber-50 text-amber-700 font-semibold" : "border-input hover:bg-muted"}
                      ${isCurrent && newCurrency.toUpperCase() === (currentCurrency || "ILS").toUpperCase() ? "ring-1 ring-muted-foreground/30" : ""}`}
                  >
                    <Icon className="h-5 w-5" />
                    {opt.label}
                    {isCurrent && <span className="text-[9px] text-muted-foreground">الحالية</span>}
                  </button>
                );
              })}
            </div>
          </div>

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