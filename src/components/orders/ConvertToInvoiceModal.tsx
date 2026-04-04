import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText } from "lucide-react";

interface OrderForInvoice {
  id: string;
  order_number: string | null;
  customer_name: string;
  customer_phone: string | null;
  total: number;
  production_cost?: number;
  items?: any[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  order: OrderForInvoice | null;
  orderItems: any[];
  userId: string;
  onSuccess: () => void;
}

export default function ConvertToInvoiceModal({ open, onClose, order, orderItems, userId, onSuccess }: Props) {
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "credit" | "partial">("credit");
  const [depositAmount, setDepositAmount] = useState(0);
  const [saving, setSaving] = useState(false);

  if (!order) return null;

  const margin = Number(order.total) - Number(order.production_cost || 0);
  const marginPct = order.total > 0 ? ((margin / Number(order.total)) * 100).toFixed(0) : "0";

  const handleCreate = async () => {
    setSaving(true);
    try {
      // Determine payment mapping
      const pmMap: Record<string, string> = { cash: "نقدي", credit: "آجل", partial: "جزئي" };
      const paidAmount = paymentMethod === "cash" ? Number(order.total) : paymentMethod === "partial" ? depositAmount : 0;
      const remainingAmount = Number(order.total) - paidAmount;

      // Create invoice in invoices table
      const { data: inv, error: invErr } = await supabase.from("invoices").insert({
        user_id: userId,
        invoice_type: "sale",
        contact_name: order.customer_name,
        invoice_date: new Date().toISOString().split("T")[0],
        subtotal: Number(order.total),
        discount_amount: 0,
        tax_amount: 0,
        total_amount: Number(order.total),
        paid_amount: paidAmount,
        remaining_amount: remainingAmount,
        payment_status: paidAmount >= Number(order.total) ? "مدفوع" : paidAmount > 0 ? "مدفوع جزئياً" : "غير مدفوع",
        payment_method: pmMap[paymentMethod] || "آجل",
        status: "posted",
        source: "qamar_brand",
        notes: `من طلبية ${order.order_number || ""}`,
        currency: "ILS",
      } as any).select().single();

      if (invErr) throw invErr;

      // Create journal entry based on payment method
      const txDate = new Date().toISOString().split("T")[0];

      if (paymentMethod === "cash") {
        // Cash: Debit Cash, Credit Sales
        await supabase.from("transactions").insert({
          user_id: userId,
          transaction_date: txDate,
          description: `فاتورة مبيعات - ${order.customer_name} (${order.order_number || ""})`,
          debit_account_code: "1110",
          credit_account_code: "4100",
          amount: Number(order.total),
          currency: "شيكل",
          transaction_type: "sale_cash",
          reference: inv.invoice_number,
          payment_method: "نقدي",
          idempotency_key: `INV-ORDER-${order.id}`,
        } as any);
      } else if (paymentMethod === "credit") {
        // Credit: Debit Receivables, Credit Sales
        await supabase.from("transactions").insert({
          user_id: userId,
          transaction_date: txDate,
          description: `فاتورة مبيعات آجل - ${order.customer_name} (${order.order_number || ""})`,
          debit_account_code: "1130",
          credit_account_code: "4100",
          amount: Number(order.total),
          currency: "شيكل",
          transaction_type: "sale_credit",
          reference: inv.invoice_number,
          payment_method: "آجل",
          idempotency_key: `INV-ORDER-${order.id}`,
        } as any);
      } else if (paymentMethod === "partial") {
        // Partial: Two entries - deposit to cash, remainder to receivables
        if (depositAmount > 0) {
          await supabase.from("transactions").insert({
            user_id: userId,
            transaction_date: txDate,
            description: `عربون فاتورة - ${order.customer_name} (${order.order_number || ""})`,
            debit_account_code: "1110",
            credit_account_code: "4100",
            amount: depositAmount,
            currency: "شيكل",
            transaction_type: "sale_cash",
            reference: inv.invoice_number,
            payment_method: "نقدي",
            idempotency_key: `INV-ORDER-DEP-${order.id}`,
          } as any);
        }
        if (remainingAmount > 0) {
          await supabase.from("transactions").insert({
            user_id: userId,
            transaction_date: txDate,
            description: `ذمة فاتورة - ${order.customer_name} (${order.order_number || ""})`,
            debit_account_code: "1130",
            credit_account_code: "4100",
            amount: remainingAmount,
            currency: "شيكل",
            transaction_type: "sale_credit",
            reference: inv.invoice_number,
            payment_method: "آجل",
            idempotency_key: `INV-ORDER-REM-${order.id}`,
          } as any);
        }
      }

      // Update order status
      await supabase.from("orders").update({
        status: "مفوتر",
        invoice_id: inv.id,
        invoiced_at: new Date().toISOString(),
        invoiced_by: userId,
        paid_amount: paidAmount,
        remaining_amount: remainingAmount,
        payment_status: paidAmount >= Number(order.total) ? "مدفوع" : paidAmount > 0 ? "مدفوع جزئياً" : "غير مدفوع",
      } as any).eq("id", order.id);

      toast.success(`تم إنشاء الفاتورة ${inv.invoice_number} ✅`);
      onClose();
      onSuccess();
    } catch (err: any) {
      toast.error("خطأ: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            تأكيد إنشاء فاتورة مبيعات
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Order summary */}
          <div className="bg-muted/50 rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">رقم الطلبية</span>
              <span className="font-mono font-medium">{order.order_number || "—"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">الزبون</span>
              <span className="font-medium">{order.customer_name}</span>
            </div>

            {/* Items */}
            {orderItems.length > 0 && (
              <div className="border-t border-border/50 pt-2 mt-2 space-y-1">
                <span className="text-xs text-muted-foreground">المنتجات:</span>
                {orderItems.map((item: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs">
                    <span>• {item.product_name} × {item.quantity}</span>
                    <span className="tabular-nums">{Number(item.total).toLocaleString()} ₪</span>
                  </div>
                ))}
              </div>
            )}

            <div className="border-t border-border/50 pt-2 flex justify-between font-bold">
              <span>الإجمالي</span>
              <span>{Number(order.total).toLocaleString()} ₪</span>
            </div>

            {/* Production cost section (accountant only) */}
            {Number(order.production_cost) > 0 && (
              <div className="border-t border-border/50 pt-2 space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">تكلفة الإنتاج</span>
                  <span className="text-destructive">{Number(order.production_cost).toLocaleString()} ₪</span>
                </div>
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground">هامش الربح</span>
                  <span className="text-primary">{margin.toLocaleString()} ₪ ({marginPct}%)</span>
                </div>
              </div>
            )}
          </div>

          {/* Payment method */}
          <div>
            <label className="text-sm font-medium text-foreground mb-2 block">طريقة الدفع</label>
            <RadioGroup value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as any)} className="space-y-2">
              <div className="flex items-center space-x-2 space-x-reverse bg-muted/30 rounded-lg p-3">
                <RadioGroupItem value="cash" id="cash" />
                <Label htmlFor="cash" className="flex-1 cursor-pointer">كاش فوري</Label>
              </div>
              <div className="flex items-center space-x-2 space-x-reverse bg-muted/30 rounded-lg p-3">
                <RadioGroupItem value="credit" id="credit" />
                <Label htmlFor="credit" className="flex-1 cursor-pointer">آجل (ذمة مدينة)</Label>
              </div>
              <div className="flex items-center space-x-2 space-x-reverse bg-muted/30 rounded-lg p-3">
                <RadioGroupItem value="partial" id="partial" />
                <Label htmlFor="partial" className="flex-1 cursor-pointer">جزئي (عربون + باقي)</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Deposit amount for partial */}
          {paymentMethod === "partial" && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">مبلغ العربون</label>
              <Input
                type="number"
                value={depositAmount}
                onChange={e => setDepositAmount(Number(e.target.value))}
                max={Number(order.total)}
                min={0}
                className="text-left"
                dir="ltr"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                المتبقي: {(Number(order.total) - depositAmount).toLocaleString()} ₪
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end pt-2">
            <Button variant="outline" onClick={onClose}>إلغاء</Button>
            <Button onClick={handleCreate} disabled={saving} className="gap-2">
              <FileText className="h-4 w-4" />
              {saving ? "جاري الإنشاء..." : "إنشاء الفاتورة"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
