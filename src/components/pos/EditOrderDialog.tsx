import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Pencil, Send } from "lucide-react";

interface OrderLike {
  id: string;
  customer_name: string;
  customer_phone: string;
  delivery_type: string;
  delivery_address: string | null;
  payment_method: string;
  order_note: string | null;
  target_branch_id: string | null;
  total: number;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  order: OrderLike | null;
  dataOwnerId: string;
  onSubmitted?: () => void;
}

/**
 * EditOrderDialog — call-center agent submits a proposed edit to a dispatched
 * order. The edit lands as a card in the cashier's PendingOrdersPanel and is
 * applied (or rejected) by the cashier via secure RPCs.
 */
export default function EditOrderDialog({ open, onOpenChange, order, dataOwnerId, onSubmitted }: Props) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryType, setDeliveryType] = useState<"delivery" | "pickup">("delivery");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [orderNote, setOrderNote] = useState("");
  const [editNote, setEditNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!order) return;
    setCustomerName(order.customer_name || "");
    setCustomerPhone(order.customer_phone || "");
    setDeliveryType((order.delivery_type as any) || "delivery");
    setDeliveryAddress(order.delivery_address || "");
    setPaymentMethod(order.payment_method || "cash");
    setOrderNote(order.order_note || "");
    setEditNote("");
  }, [order]);

  const handleSubmit = async () => {
    if (!order) return;
    if (!editNote.trim()) {
      toast.error("يرجى ذكر سبب التعديل");
      return;
    }
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("user_id", user?.id || "")
        .maybeSingle();

      // Only include changed fields to keep the diff minimal.
      const changes: Record<string, any> = {};
      if (customerName.trim() !== order.customer_name) changes.customer_name = customerName.trim();
      if (customerPhone.trim() !== order.customer_phone) changes.customer_phone = customerPhone.trim();
      if (deliveryType !== order.delivery_type) changes.delivery_type = deliveryType;
      if ((deliveryAddress.trim() || null) !== (order.delivery_address || null))
        changes.delivery_address = deliveryType === "delivery" ? deliveryAddress.trim() : null;
      if (paymentMethod !== order.payment_method) changes.payment_method = paymentMethod;
      if ((orderNote.trim() || null) !== (order.order_note || null))
        changes.order_note = orderNote.trim() || null;

      if (Object.keys(changes).length === 0) {
        toast.warning("لم يتم تغيير أي حقل");
        setSubmitting(false);
        return;
      }

      const { error } = await supabase.from("call_center_order_edits" as any).insert({
        user_id: dataOwnerId,
        call_center_order_id: order.id,
        target_branch_id: order.target_branch_id,
        proposed_changes: changes,
        edit_note: editNote.trim(),
        created_by: user?.id || null,
        created_by_name: profile?.display_name || null,
      } as any);

      if (error) throw error;

      toast.success("✅ تم إرسال طلب التعديل للفرع");
      onOpenChange(false);
      onSubmitted?.();
    } catch (err: any) {
      toast.error("فشل إرسال التعديل: " + (err.message || ""));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Pencil className="h-4 w-4" /> تعديل طلبية بعد التحويل
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 max-h-[60vh] overflow-y-auto px-1">
          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-2 text-[11px] text-amber-800">
            التعديل سيُرسَل كبطاقة منفصلة للكاشير على الفرع. يبقى الطلب الأصلي كما هو حتى يقبل الكاشير التعديل.
          </div>

          <div className="space-y-1">
            <Label className="text-xs">اسم الزبون</Label>
            <Input value={customerName} onChange={e => setCustomerName(e.target.value)} className="h-9" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">رقم الهاتف</Label>
            <Input value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="h-9" dir="ltr" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">نوع الطلب</Label>
            <div className="flex gap-2">
              <button type="button" onClick={() => setDeliveryType("delivery")}
                className={`flex-1 h-9 rounded-lg text-xs font-medium border ${deliveryType==="delivery"?"bg-orange-500 text-white border-orange-500":"bg-muted/30 border-border"}`}>
                توصيل
              </button>
              <button type="button" onClick={() => setDeliveryType("pickup")}
                className={`flex-1 h-9 rounded-lg text-xs font-medium border ${deliveryType==="pickup"?"bg-blue-500 text-white border-blue-500":"bg-muted/30 border-border"}`}>
                استلام
              </button>
            </div>
          </div>
          {deliveryType === "delivery" && (
            <div className="space-y-1">
              <Label className="text-xs">العنوان</Label>
              <Textarea value={deliveryAddress} onChange={e => setDeliveryAddress(e.target.value)} rows={2} />
            </div>
          )}
          <div className="space-y-1">
            <Label className="text-xs">طريقة الدفع</Label>
            <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}
              className="w-full h-9 rounded-lg border border-border bg-background px-2 text-xs">
              <option value="cash">نقدي</option>
              <option value="visa">فيزا</option>
            </select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">ملاحظة الطلب</Label>
            <Textarea value={orderNote} onChange={e => setOrderNote(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-destructive">سبب التعديل <span className="text-destructive">*</span></Label>
            <Textarea value={editNote} onChange={e => setEditNote(e.target.value)} rows={2}
              placeholder="مثال: الزبون غيّر العنوان / صحّح الرقم..." />
          </div>

          <div className="rounded-lg bg-muted/30 p-2 text-[11px] text-muted-foreground">
            ملاحظة: تعديل عناصر الفاتورة (إضافة/حذف صنف، تغيير الكمية أو السعر) غير متاح في هذه المرحلة. لتعديل الأصناف، يُفضّل التواصل مع الفرع وإلغاء الطلب وإعادة إرساله.
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>إلغاء</Button>
          <Button onClick={handleSubmit} disabled={submitting} className="gap-1.5">
            <Send className="h-3.5 w-3.5" />
            {submitting ? "جاري الإرسال..." : "إرسال للفرع"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
