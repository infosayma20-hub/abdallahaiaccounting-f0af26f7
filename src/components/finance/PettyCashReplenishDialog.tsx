import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowDown, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface CashBox {
  id: string;
  name: string;
  type: string;
  gl_account_code: string;
  currency?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boxes: CashBox[];
  onSuccess: () => void;
  userId: string;
}

export default function PettyCashReplenishDialog({ open, onOpenChange, boxes, onSuccess, userId }: Props) {
  const [fromBoxId, setFromBoxId] = useState("");
  const [toBoxId, setToBoxId] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const sourceBoxes = boxes.filter(b => b.type === "main" || b.type === "branch");
  const targetBoxes = boxes.filter(b => b.type === "petty" || b.type === "petty_cash");

  const fromBox = sourceBoxes.find(b => b.id === fromBoxId);
  const toBox = targetBoxes.find(b => b.id === toBoxId);

  const handleSubmit = async () => {
    if (!fromBox || !toBox || !amount || Number(amount) <= 0) {
      toast.error("يرجى تعبئة جميع الحقول بشكل صحيح");
      return;
    }

    if (fromBox.gl_account_code === toBox.gl_account_code) {
      toast.error("لا يمكن التحويل لنفس الصندوق");
      return;
    }

    setSaving(true);
    try {
      const amountNum = Number(amount);
      const desc = `تغذية نثرية - من ${fromBox.name} إلى ${toBox.name}${notes ? ` - ${notes}` : ""}`;
      const idempotencyKey = `PETTY-REPLENISH-${Date.now()}`;

      // Atomic RPC: petty cash replenishment is a cash transfer
      const { data: rpcRes, error: txError } = await supabase.rpc("create_cash_transfer_atomic", {
        p_user_id: userId,
        p_from_account_code: fromBox.gl_account_code,
        p_to_account_code: toBox.gl_account_code,
        p_amount: amountNum,
        p_currency: "شيكل",
        p_transfer_date: new Date().toISOString().split("T")[0],
        p_description: desc,
        p_idempotency_key: idempotencyKey,
        p_source: "manual",
      });
      const r = rpcRes as any;
      if (txError || !r?.success) throw new Error(txError?.message || r?.error || "فشل التغذية");

      // Record cash transfer
      await supabase.from("cash_transfers").insert({
        user_id: userId,
        from_box_id: fromBox.id,
        to_box_id: toBox.id,
        amount: amountNum,
        currency: "ILS",
        transfer_date: new Date().toISOString().split("T")[0],
        transfer_type: "petty_replenish",
        description: desc,
      });

      toast.success(`تم تغذية ${toBox.name} بمبلغ ₪${amountNum.toFixed(2)} من ${fromBox.name}`);
      setFromBoxId("");
      setToBoxId("");
      setAmount("");
      setNotes("");
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error("حدث خطأ: " + (err.message || "غير معروف"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-foreground">
            <Wallet className="h-5 w-5 text-amber-600" />
            تغذية صندوق النثرية
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* From Box */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">من الصندوق</Label>
            <Select value={fromBoxId} onValueChange={setFromBoxId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر الصندوق المصدر..." />
              </SelectTrigger>
              <SelectContent>
                {sourceBoxes.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    <span className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${b.type === "main" ? "bg-[#0A2342]" : "bg-emerald-600"}`} />
                      {b.name}
                      <span className="text-muted-foreground text-[10px]">({b.gl_account_code})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Arrow */}
          <div className="flex justify-center">
            <div className="bg-amber-100 text-amber-700 rounded-full p-2">
              <ArrowDown className="h-4 w-4" />
            </div>
          </div>

          {/* To Box */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">إلى صندوق النثرية</Label>
            <Select value={toBoxId} onValueChange={setToBoxId}>
              <SelectTrigger>
                <SelectValue placeholder="اختر صندوق النثرية..." />
              </SelectTrigger>
              <SelectContent>
                {targetBoxes.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    <span className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500" />
                      {b.name}
                      <span className="text-muted-foreground text-[10px]">({b.gl_account_code})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">المبلغ (₪)</Label>
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="font-mono text-left"
              dir="ltr"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">ملاحظات (اختياري)</Label>
            <Textarea
              placeholder="مثال: تغذية شهرية..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
            />
          </div>

          {/* Summary */}
          {fromBox && toBox && amount && Number(amount) > 0 && (
            <div className="bg-muted/50 rounded-lg p-3 text-xs space-y-1 border border-border/50">
              <p className="font-semibold text-foreground">ملخص القيد المحاسبي:</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">مدين: {toBox.name} ({toBox.gl_account_code})</span>
                <span className="font-mono font-bold text-foreground">₪{Number(amount).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">دائن: {fromBox.name} ({fromBox.gl_account_code})</span>
                <span className="font-mono font-bold text-emerald-600">₪{Number(amount).toFixed(2)}</span>
              </div>
            </div>
          )}

          <Button onClick={handleSubmit} disabled={saving || !fromBoxId || !toBoxId || !amount || Number(amount) <= 0} className="w-full gap-2" style={{ background: "#D97706" }}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            {saving ? "جارٍ التنفيذ..." : "تنفيذ التغذية"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
