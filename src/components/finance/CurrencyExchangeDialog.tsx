import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, ArrowLeftRight, TrendingUp } from "lucide-react";
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

const CURRENCIES = [
  { code: "ILS", label: "شيكل ₪", symbol: "₪", arLabel: "شيكل" },
  { code: "USD", label: "دولار $", symbol: "$", arLabel: "دولار" },
  { code: "JOD", label: "دينار JOD", symbol: "JOD", arLabel: "دينار" },
  { code: "EUR", label: "يورو €", symbol: "€", arLabel: "يورو" },
];

export default function CurrencyExchangeDialog({ open, onOpenChange, boxes, onSuccess, userId }: Props) {
  const [boxId, setBoxId] = useState("");
  const [fromCurrency, setFromCurrency] = useState("ILS");
  const [toCurrency, setToCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const box = boxes.find(b => b.id === boxId);
  const fromCur = CURRENCIES.find(c => c.code === fromCurrency);
  const toCur = CURRENCIES.find(c => c.code === toCurrency);
  const convertedAmount = Number(amount) && Number(rate) ? (Number(amount) / Number(rate)).toFixed(2) : "0.00";

  // Fetch exchange rate from DB
  useEffect(() => {
    if (!open || fromCurrency === toCurrency) return;
    const fetchRate = async () => {
      // Try to get rate from currencies table
      const targetCode = fromCurrency === "ILS" ? toCurrency : fromCurrency;
      const { data } = await supabase
        .from("currencies")
        .select("sell_rate, buy_rate, mid_rate")
        .eq("code", targetCode)
        .eq("is_active", true)
        .maybeSingle();

      if (data) {
        // If selling ILS to buy foreign, use sell_rate
        // If selling foreign to buy ILS, use buy_rate
        const r = fromCurrency === "ILS" ? (data.sell_rate || data.mid_rate) : (data.buy_rate || data.mid_rate);
        if (r) setRate(String(r));
      }
    };
    fetchRate();
  }, [open, fromCurrency, toCurrency]);

  const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const handleSubmit = async () => {
    if (!box || !amount || Number(amount) <= 0 || !rate || Number(rate) <= 0) {
      toast.error("يرجى تعبئة جميع الحقول بشكل صحيح");
      return;
    }
    if (fromCurrency === toCurrency) {
      toast.error("لا يمكن الصرف لنفس العملة");
      return;
    }

    setSaving(true);
    try {
      const ilsAmount = fromCurrency === "ILS" ? Number(amount) : Number(amount) * Number(rate);
      const foreignAmount = fromCurrency === "ILS" ? Number(convertedAmount) : Number(amount);
      const foreignCurrency = fromCurrency === "ILS" ? toCurrency : fromCurrency;
      const foreignCurLabel = CURRENCIES.find(c => c.code === foreignCurrency)?.arLabel || foreignCurrency;

      // Create debit transaction: increase target currency box
      // Create credit transaction: decrease source currency box
      // For simplicity, use the same box GL code with a journal entry
      const idempotencyKey = `FX-${Date.now()}`;
      const desc = `صرف عملة: ${fromCur?.label} → ${toCur?.label} | سعر الصرف: ${rate} | صندوق: ${box.name}`;

      // Journal entry: Debit target currency (foreign box), Credit source currency (source box)
      // Both in the same box GL code but with foreign_amount tracking
      const { error } = await supabase.from("transactions").insert({
        user_id: userId,
        transaction_date: new Date().toISOString().split("T")[0],
        description: notes ? `${desc} - ${notes}` : desc,
        debit_account_code: box.gl_account_code,
        credit_account_code: box.gl_account_code,
        amount: ilsAmount,
        currency: foreignCurLabel,
        transaction_type: "currency_exchange",
        reference: `FX-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
        payment_method: "نقدي",
        idempotency_key: idempotencyKey,
        foreign_amount: foreignAmount,
        exchange_rate: Number(rate),
      });

      if (error) throw error;

      toast.success(`تم صرف ${fromCur?.symbol}${fmt(Number(amount))} → ${toCur?.symbol}${fmt(Number(convertedAmount))} بنجاح`);
      onOpenChange(false);
      setAmount(""); setRate(""); setNotes(""); setBoxId("");
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowLeftRight className="h-5 w-5 text-blue-600" />
            صرف عملة
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Box selection */}
          <div className="space-y-1.5">
            <Label className="text-xs">الصندوق</Label>
            <Select value={boxId} onValueChange={setBoxId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="اختر الصندوق..." />
              </SelectTrigger>
              <SelectContent>
                {boxes.filter(b => b.type === "main" || b.type === "branch").map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">{b.gl_account_code}</span>
                      {b.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Currency pair */}
          <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-end">
            <div className="space-y-1.5">
              <Label className="text-xs">من عملة</Label>
              <Select value={fromCurrency} onValueChange={v => { setFromCurrency(v); setRate(""); }}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <ArrowLeftRight className="h-4 w-4 text-muted-foreground mb-2" />
            <div className="space-y-1.5">
              <Label className="text-xs">إلى عملة</Label>
              <Select value={toCurrency} onValueChange={v => { setToCurrency(v); setRate(""); }}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.filter(c => c.code !== fromCurrency).map(c => (
                    <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Amount & Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">المبلغ ({fromCur?.symbol})</Label>
              <Input
                type="number"
                className="h-9 text-sm font-mono"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                <TrendingUp className="h-3 w-3" /> سعر الصرف
              </Label>
              <Input
                type="number"
                step="0.01"
                className="h-9 text-sm font-mono"
                placeholder="0.00"
                value={rate}
                onChange={e => setRate(e.target.value)}
              />
            </div>
          </div>

          {/* Result preview */}
          {Number(amount) > 0 && Number(rate) > 0 && (
            <div className="rounded-lg p-3 border bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">المبلغ المحوّل:</span>
                <span className="font-bold font-mono text-blue-700 dark:text-blue-400 text-base">
                  {toCur?.symbol}{fmt(Number(convertedAmount))}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {fromCur?.symbol}{fmt(Number(amount))} × {rate} = {toCur?.symbol}{fmt(Number(convertedAmount))}
              </p>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">ملاحظات (اختياري)</Label>
            <Textarea
              className="text-sm resize-none"
              rows={2}
              placeholder="سبب عملية الصرف..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>

          <Button
            className="w-full gap-2"
            style={{ background: "linear-gradient(135deg, #1E40AF, #3B82F6)" }}
            disabled={saving || !boxId || !amount || !rate || Number(amount) <= 0 || Number(rate) <= 0}
            onClick={handleSubmit}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeftRight className="h-4 w-4" />}
            تنفيذ صرف العملة
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
