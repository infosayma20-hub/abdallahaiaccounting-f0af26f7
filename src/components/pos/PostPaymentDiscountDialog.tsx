import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Percent, Lock } from "lucide-react";

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
  onSuccess: () => void;
}

/**
 * PostPaymentDiscountDialog
 * خصم على فاتورة مدفوعة بوضع المدير (بعد الدفع).
 * يسجّل قيد تسوية: مدين حساب الخصم المسموح / دائن نفس حساب الدفعة الأصلي،
 * ويخفّض إجمالي الفاتورة ومبلغ الدفعة — بدون حذف أي قيد مرحّل.
 */
export default function PostPaymentDiscountDialog({
  open, onClose, orderId, orderNumber, orderTotal,
  sessionId, dataOwnerId, managerUserId, managerName, onSuccess,
}: Props) {
  const [mode, setMode] = useState<"fixed" | "percent">("fixed");
  const [value, setValue] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const num = Number(value);
  const discountAmount = mode === "percent"
    ? Math.round(orderTotal * (num / 100) * 100) / 100
    : Math.round(num * 100) / 100;

  const handleSubmit = async () => {
    if (!num || num <= 0) {
      toast.error("أدخل قيمة خصم صحيحة");
      return;
    }
    if (mode === "percent" && num >= 100) {
      toast.error("نسبة الخصم يجب أن تكون أقل من 100%");
      return;
    }
    if (discountAmount <= 0 || discountAmount >= orderTotal) {
      toast.error("قيمة الخصم يجب أن تكون أقل من إجمالي الفاتورة");
      return;
    }
    if (reason.trim().length < 3) {
      toast.error("اذكر سبب الخصم");
      return;
    }
    if (!managerUserId) {
      toast.error("وضع المدير غير مفعّل");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await (supabase as any).rpc("pos_manager_discount_order_v1", {
        p_order_id: orderId,
        p_user_id: dataOwnerId,
        p_session_id: sessionId,
        p_amount: discountAmount,
        p_reason: reason.trim(),
        p_manager_user_id: managerUserId,
      });
      if (error) throw error;
      if (data && data.success === false) {
        toast.error(data.error || "فشل تنفيذ الخصم");
        return;
      }
      toast.success(`تم خصم ${discountAmount.toFixed(2)} ₪ — الإجمالي الجديد ${Number(data?.new_total ?? orderTotal - discountAmount).toFixed(2)} ₪ (اعتمده ${managerName || "المدير"})`);
      setValue(""); setReason(""); setMode("fixed");
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
            <Percent className="h-4 w-4 text-primary" />
            خصم على الفاتورة بعد الدفع
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-1">
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-2 text-[11px] text-foreground flex items-start gap-1.5">
            <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              عملية تحت <b>وضع المدير</b> ({managerName || "—"}). يُسجَّل قيد خصم مسموح مقابل حساب الدفع الأصلي، وينخفض إجمالي الفاتورة والكاش المتوقع تلقائيًا. القيد الأصلي <b>لا يُحذف</b>.
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

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">نوع الخصم</Label>
              <select value={mode} onChange={e => setMode(e.target.value as any)}
                className="w-full h-9 rounded-lg border border-border bg-background px-2 text-xs">
                <option value="fixed">مبلغ ثابت ₪</option>
                <option value="percent">نسبة مئوية %</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{mode === "percent" ? "النسبة %" : "المبلغ ₪"}</Label>
              <Input
                type="number" step="0.01" min="0"
                max={mode === "percent" ? 99.99 : orderTotal}
                value={value} onChange={e => setValue(e.target.value)}
                placeholder="0.00" className="h-10 text-base font-mono" autoFocus
              />
            </div>
          </div>

          {discountAmount > 0 && discountAmount < orderTotal && (
            <div className="rounded-md bg-muted/40 border p-2 text-xs flex items-center justify-between">
              <span className="text-muted-foreground">الخصم: <b className="font-mono">₪ {discountAmount.toFixed(2)}</b></span>
              <span className="text-muted-foreground">الإجمالي بعد الخصم: <b className="font-mono">₪ {(orderTotal - discountAmount).toFixed(2)}</b></span>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs text-destructive">سبب الخصم *</Label>
            <Textarea
              value={reason} onChange={e => setReason(e.target.value)}
              rows={2} placeholder="مثال: خصم زبون دائم بعد الدفع بموافقة الإدارة"
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={submitting}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? "جارٍ التنفيذ..." : "تنفيذ الخصم"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
