import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { RotateCcw, Lock } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string | null;
  orderTotal: number;
  sessionId: string;
  dataOwnerId: string;
  managerUserId: string | null;
  managerName: string | null;
  exchangeRates: Record<string, number>;
  onSuccess: () => void;
}

/**
 * PaymentAdjustmentDialog
 * استرداد جزئي بعد الإغلاق (تعديل سعر، تعويض جزئي…)
 * يتم فقط ضمن وضع المدير. ينشئ صف دفع سالب + يخفّض إجمالي الفاتورة
 * + يرحّل قيد محاسبي متوازن (مدين مرتجعات / دائن صندوق أو بنك).
 */
export default function PaymentAdjustmentDialog({
  open, onClose, orderId, orderNumber, orderTotal,
  sessionId, dataOwnerId, managerUserId, managerName,
  exchangeRates, onSuccess,
}: Props) {
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<"cash" | "card" | "credit">("cash");
  const [currency, setCurrency] = useState<string>("ILS");
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const num = Number(amount);
    if (!num || num <= 0) {
      toast.error("أدخل قيمة استرداد صحيحة");
      return;
    }
    if (num > orderTotal + 0.001) {
      toast.error("قيمة الاسترداد تتجاوز إجمالي الفاتورة");
      return;
    }
    if (reason.trim().length < 3) {
      toast.error("اذكر سبب التعديل");
      return;
    }
    if (!managerUserId) {
      toast.error("وضع المدير غير مفعّل");
      return;
    }
    setSubmitting(true);
    try {
      const rate = currency === "ILS" ? 1 : (exchangeRates?.[currency] || 1);
      const { data, error } = await (supabase as any).rpc("adjust_pos_payment_manager", {
        p_order_id: orderId,
        p_user_id: dataOwnerId,
        p_session_id: sessionId,
        p_amount: num,
        p_method: method,
        p_currency: currency,
        p_exchange_rate: rate,
        p_reason: reason.trim(),
        p_manager_user_id: managerUserId,
      });
      if (error) throw error;
      if (data && data.success === false) {
        toast.error(data.error || "فشل تنفيذ الاسترداد");
        return;
      }
      toast.success(`✅ تم استرداد ${num.toFixed(2)} ${currency} — اعتمده ${managerName || "المدير"}`);
      setAmount(""); setReason(""); setMethod("cash"); setCurrency("ILS");
      onSuccess();
      onClose();
    } catch (e: any) {
      toast.error(e?.message || "خطأ غير متوقع");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent dir="rtl" className="max-w-md z-[1200]" style={{ fontFamily: "Tajawal, sans-serif" }}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="h-4 w-4 text-amber-600" />
            تعديل دفعة / استرداد جزئي
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2 text-[11px] text-amber-800 flex items-start gap-1.5">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              عملية تحت <b>وضع المدير</b> ({managerName || "—"}). تعدّل الإجمالي وتنشئ قيد استرداد متوازن. الدفعة الأصلية في الفاتورة (الفيزا/التحويل) <b>لا تُلمس</b>.
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-md border bg-muted/30 p-2 text-xs">
              <div className="text-[10px] text-muted-foreground">رقم الفاتورة</div>
              <div className="font-mono">{orderNumber || "—"}</div>
            </div>
            <div className="rounded-md border bg-muted/30 p-2 text-xs">
              <div className="text-[10px] text-muted-foreground">الإجمالي الحالي</div>
              <div className="font-mono">₪ {orderTotal.toFixed(2)}</div>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs">قيمة الاسترداد</Label>
            <Input
              type="number" step="0.01" min="0" max={orderTotal}
              value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0.00" className="h-10 text-base font-mono" autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">طريقة الاسترداد</Label>
              <select value={method} onChange={e => setMethod(e.target.value as any)}
                className="w-full h-9 rounded-lg border border-border bg-background px-2 text-xs">
                <option value="cash">نقدي (من الصندوق)</option>
                <option value="card">فيزا / تحويل بنكي</option>
                <option value="credit">على الحساب (آجل)</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">العملة</Label>
              <select value={currency} onChange={e => setCurrency(e.target.value)}
                className="w-full h-9 rounded-lg border border-border bg-background px-2 text-xs">
                <option value="ILS">شيكل ₪</option>
                <option value="JOD">دينار JD</option>
                <option value="USD">دولار $</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs text-destructive">سبب التعديل *</Label>
            <Textarea
              value={reason} onChange={e => setReason(e.target.value)}
              rows={2} placeholder="مثال: تعديل سعر بعد الدفع — رجعنا 7 شيكل نقدي"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={submitting}
            style={{ background: "#B45309", color: "white" }}>
            {submitting ? "جارٍ التنفيذ..." : "تنفيذ الاسترداد"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}