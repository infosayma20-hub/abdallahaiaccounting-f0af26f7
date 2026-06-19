import { useState } from "react";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Banknote } from "lucide-react";

interface OrderForReceipt {
  id: string;
  order_number: string | null;
  customer_name: string;
  total: number;
  paid_amount?: number;
  remaining_amount?: number;
  invoice_id?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  order: OrderForReceipt | null;
  userId: string;
  onSuccess: () => void;
}

export default function RecordReceiptModal({ open, onClose, order, userId, onSuccess }: Props) {
  const [amount, setAmount] = useState(0);
  const [method, setMethod] = useState("نقدي");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  if (!order) return null;

  const totalPaid = Number(order.paid_amount || 0);
  const remaining = Number(order.total) - totalPaid;

  const handleConfirm = async () => {
    if (amount <= 0 || amount > remaining) {
      toast.error("المبلغ غير صحيح");
      return;
    }
    setSaving(true);
    try {
      const txDate = new Date().toISOString().split("T")[0];
      const debitAccount = method === "تحويل بنكي" || method === "بطاقة" ? "1120" : "1110";

      // Create receipt journal entry
      await supabase.from("transactions").insert({
        user_id: dataOwnerId!,
        transaction_date: txDate,
        description: `قبض من ${order.customer_name} - ${order.order_number || ""}`,
        debit_account_code: debitAccount,
        credit_account_code: "1130",
        amount: amount,
        currency: "شيكل",
        transaction_type: "receipt",
        reference: `RCV-ORD-${order.id.slice(0, 8)}`,
        payment_method: method,
        idempotency_key: `RCV-ORD-${order.id}-${Date.now()}`,
      } as any);

      // Update order paid/remaining amounts
      const newPaid = totalPaid + amount;
      const newRemaining = Number(order.total) - newPaid;
      const newPaymentStatus = newRemaining <= 0 ? "مدفوع" : "مدفوع جزئياً";
      const newStatus = newRemaining <= 0 ? "مدفوع كاملاً" : "مدفوع جزئياً";

      await supabase.from("orders").update({
        paid_amount: newPaid,
        remaining_amount: Math.max(0, newRemaining),
        payment_status: newPaymentStatus,
        status: newStatus,
      } as any).eq("id", order.id);

      // Also update invoice if linked
      if (order.invoice_id) {
        await supabase.from("invoices").update({
          paid_amount: newPaid,
          remaining_amount: Math.max(0, newRemaining),
          payment_status: newPaymentStatus,
        } as any).eq("id", order.invoice_id);
      }

      toast.success(`تم تسجيل قبض ${amount.toLocaleString()} ₪ ✅`);
      onClose();
      onSuccess();
    } catch (err: any) {
      toast.error("خطأ: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  // Reset amount when order changes
  const effectiveRemaining = remaining;

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" />
            تسجيل قبض
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Summary */}
          <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">الطلبية</span>
              <span className="font-mono">{order.order_number || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">الزبون</span>
              <span className="font-medium">{order.customer_name}</span>
            </div>
            <div className="border-t border-border/50 pt-2 space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">إجمالي الفاتورة</span>
                <span className="font-bold">{Number(order.total).toLocaleString()} ₪</span>
              </div>
              {totalPaid > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">المقبوض سابقاً</span>
                  <span className="text-primary">{totalPaid.toLocaleString()} ₪</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-destructive">
                <span>المتبقي</span>
                <span>{effectiveRemaining.toLocaleString()} ₪</span>
              </div>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">المبلغ المقبوض الآن</label>
            <Input
              type="number"
              value={amount || ""}
              onChange={e => setAmount(Number(e.target.value))}
              max={effectiveRemaining}
              min={0}
              placeholder={effectiveRemaining.toString()}
              className="text-left text-lg font-bold"
              dir="ltr"
              onFocus={() => { if (amount === 0) setAmount(effectiveRemaining); }}
            />
          </div>

          {/* Payment method */}
          <div>
            <label className="text-xs text-muted-foreground mb-2 block">طريقة القبض</label>
            <RadioGroup value={method} onValueChange={setMethod} className="flex gap-2">
              {["نقدي", "تحويل بنكي", "بطاقة"].map(m => (
                <div key={m} className="flex items-center space-x-1 space-x-reverse bg-muted/30 rounded-lg px-3 py-2">
                  <RadioGroupItem value={m} id={`rcv-${m}`} />
                  <Label htmlFor={`rcv-${m}`} className="cursor-pointer text-xs">{m}</Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">ملاحظة</label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="ملاحظة اختيارية..." />
          </div>

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button onClick={handleConfirm} disabled={saving || amount <= 0} className="gap-2">
              <Banknote className="h-4 w-4" />
              {saving ? "جاري التسجيل..." : "تأكيد القبض"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
