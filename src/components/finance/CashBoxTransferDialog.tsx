import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeftRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FinanceModal } from "@/components/finance/shell";

interface Box {
  id: string;
  name: string;
  gl_account_code: string;
  type: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boxes: Box[];
  balances: Record<string, { balance: number }>;
  userId: string;
  onSuccess: () => void;
}

const CURRENCIES = [
  { code: "ILS", symbol: "₪" },
  { code: "USD", symbol: "$" },
  { code: "JOD", symbol: "JOD" },
];

export default function CashBoxTransferDialog({ open, onOpenChange, boxes, balances, userId, onSuccess }: Props) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) { setFromId(""); setToId(""); setAmount(""); setNotes(""); setCurrency("ILS"); }
  }, [open]);

  const fromBox = boxes.find(b => b.id === fromId);
  const toBox = boxes.find(b => b.id === toId);
  const fromBal = fromBox ? (balances[fromBox.gl_account_code]?.balance || 0) : 0;
  const toBal = toBox ? (balances[toBox.gl_account_code]?.balance || 0) : 0;
  const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  const curSymbol = CURRENCIES.find(c => c.code === currency)?.symbol || "₪";

  const handleSubmit = async () => {
    if (!fromBox || !toBox || fromId === toId || !amount || Number(amount) <= 0) {
      toast.error("يرجى تعبئة جميع الحقول بشكل صحيح");
      return;
    }
    setSaving(true);
    try {
      const amt = Number(amount);
      const ref = `TRF-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      const desc = `تحويل من ${fromBox.name} إلى ${toBox.name}${notes ? ` - ${notes}` : ""}`;

      // Atomic RPC: paired debit+credit posting in a single DB transaction
      const { data: rpcRes, error: txErr } = await supabase.rpc("create_cash_transfer_atomic", {
        p_user_id: userId,
        p_from_account_code: fromBox.gl_account_code,
        p_to_account_code: toBox.gl_account_code,
        p_amount: amt,
        p_currency: currency === "ILS" ? "شيكل" : currency === "USD" ? "دولار" : currency === "JOD" ? "دينار" : currency,
        p_transfer_date: new Date().toISOString().split("T")[0],
        p_description: desc,
        p_idempotency_key: `TRF-${Date.now()}-${Math.random().toString(36).slice(2,8)}`,
        p_source: "manual",
      });
      const r = rpcRes as any;
      if (txErr || !r?.success) throw new Error(txErr?.message || r?.error || "فشل التحويل");

      // Record in cash_transfers audit
      await supabase.from("cash_transfers").insert({
        user_id: userId,
        from_box_id: fromId,
        to_box_id: toId,
        amount: amt,
        currency,
        transfer_date: new Date().toISOString().split("T")[0],
        description: desc,
        transfer_type: "manual",
      });

      toast.success(`تم تحويل ${curSymbol}${fmt(amt)} من ${fromBox.name} إلى ${toBox.name}`);
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <FinanceModal
      open={open}
      onOpenChange={onOpenChange}
      icon={ArrowLeftRight}
      title="تحويل بين الصناديق"
      description="تحويل مبلغ من صندوق إلى آخر مع قيد محاسبي مزدوج"
      primaryLabel="تأكيد التحويل"
      primaryLoading={saving}
      primaryDisabled={!fromId || !toId || fromId === toId || !amount || Number(amount) <= 0}
      onPrimary={handleSubmit}
    >
          <div className="space-y-1.5">
            <Label className="text-xs">من صندوق</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الصندوق المصدر..." /></SelectTrigger>
              <SelectContent>
                {boxes.filter(b => b.id !== toId).map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">{b.gl_account_code}</span>
                      {b.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fromBox && <p className="text-[10px] text-muted-foreground">الرصيد الحالي: <span className="font-mono font-bold">₪{fmt(fromBal)}</span></p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">إلى صندوق</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الصندوق الوجهة..." /></SelectTrigger>
              <SelectContent>
                {boxes.filter(b => b.id !== fromId).map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">{b.gl_account_code}</span>
                      {b.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {toBox && <p className="text-[10px] text-muted-foreground">الرصيد الحالي: <span className="font-mono font-bold">₪{fmt(toBal)}</span></p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">المبلغ</Label>
              <Input type="number" className="h-9 text-sm font-mono" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">العملة</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => <SelectItem key={c.code} value={c.code}>{c.symbol} {c.code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview journal entry */}
          {fromBox && toBox && Number(amount) > 0 && (
            <div className="rounded-md p-3 border border-border bg-muted/40 text-xs space-y-1">
              <p className="font-semibold text-foreground mb-1.5">القيد المحاسبي:</p>
              <div className="flex justify-between">
                <span>مدين: {toBox.name} ({toBox.gl_account_code})</span>
                <span className="font-mono font-bold">{curSymbol}{fmt(Number(amount))}</span>
              </div>
              <div className="flex justify-between">
                <span>دائن: {fromBox.name} ({fromBox.gl_account_code})</span>
                <span className="font-mono font-bold">{curSymbol}{fmt(Number(amount))}</span>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">ملاحظة (اختياري)</Label>
            <Textarea className="text-sm resize-none" rows={2} placeholder="سبب التحويل..." value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
    </FinanceModal>
  );
}
