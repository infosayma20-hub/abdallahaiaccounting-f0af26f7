import { useState } from "react";
import { CreditCard, Banknote, AlertCircle, ShieldCheck, ArrowRightLeft } from "lucide-react";
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
  ageMinutes,
  windowMinutes = 30,
  posUserId,
  managerUserId,
  onSuccess,
}: Props) {
  const [newMethod, setNewMethod] = useState<"cash" | "card" | "credit">(
    currentMethod === "cash" ? "card" : "cash",
  );
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const needsManager = ageMinutes > windowMinutes && !managerUserId;
  const sameAsCurrent = newMethod === currentMethod;

  const handleSubmit = async () => {
    if (sameAsCurrent) {
      toast.error("الطريقة الجديدة مطابقة للحالية");
      return;
    }
    if (needsManager) {
      toast.error("انتهت مدة السماح — يلزم تفعيل وضع المدير من سجل الفواتير أولاً");
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
        else toast.error("تعذّر التعديل: " + msg);
        return;
      }
      toast.success("تم تعديل طريقة الدفع بنجاح");
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
                    disabled={isCurrent}
                    onClick={() => setNewMethod(opt.value)}
                    className={`flex flex-col items-center gap-1 p-3 rounded-lg border text-xs transition-all
                      ${selected ? "border-amber-500 bg-amber-50 text-amber-700 font-semibold" : "border-input hover:bg-muted"}
                      ${isCurrent ? "opacity-40 cursor-not-allowed" : ""}`}
                  >
                    <Icon className="h-5 w-5" />
                    {opt.label}
                    {isCurrent && <span className="text-[9px] text-muted-foreground">الحالية</span>}
                  </button>
                );
              })}
            </div>
          </div>

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