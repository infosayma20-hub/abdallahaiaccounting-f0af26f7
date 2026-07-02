import { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeftRight, TrendingUp, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FinanceModal } from "@/components/finance/shell";
import { broadcastChange } from "@/lib/crossTabSync";

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

const curMeta = (code?: string) =>
  CURRENCIES.find(c => c.code === (code || "ILS")) || CURRENCIES[0];

export default function CurrencyExchangeDialog({ open, onOpenChange, boxes, onSuccess, userId }: Props) {
  // Two-box cross-currency transfer.
  //   1) Pick source (from) box → its currency drives amount input.
  //   2) Pick destination (to) box → its currency drives converted amount.
  //   3) Rate auto-fetched from exchange_rates (mid) and editable.
  //   4) Posting: two paired transactions via FX clearing account (1199).
  const [fromBoxId, setFromBoxId] = useState("");
  const [toBoxId, setToBoxId] = useState("");
  const [amount, setAmount] = useState("");
  const [rate, setRate] = useState("");        // 1 source unit = ? target units
  const [notes, setNotes] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);

  const fromBox = boxes.find(b => b.id === fromBoxId);
  const toBox = boxes.find(b => b.id === toBoxId);
  const fromCur = curMeta(fromBox?.currency);
  const toCur = curMeta(toBox?.currency);
  const sameCurrency = !!fromBox && !!toBox && fromCur.code === toCur.code;
  const convertedAmount = useMemo(() => {
    const a = Number(amount), r = Number(rate);
    if (!a || !r) return 0;
    return a * r;
  }, [amount, rate]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setFromBoxId(""); setToBoxId(""); setAmount(""); setRate(""); setNotes("");
      setTransferDate(new Date().toISOString().split("T")[0]);
    }
  }, [open]);

  // Auto cross-rate: ILS-per-source / ILS-per-target
  useEffect(() => {
    if (!open || !fromBox || !toBox || sameCurrency) { setRate(""); return; }
    (async () => {
      const fetchILSRate = async (code: string): Promise<number> => {
        if (code === "ILS") return 1;
        const { data: cur } = await supabase
          .from("currencies").select("id").eq("code", code).eq("is_active", true).maybeSingle();
        if (!cur?.id) return 0;
        const { data: r } = await supabase
          .from("exchange_rates")
          .select("mid_rate, buy_rate, sell_rate")
          .eq("currency_id", cur.id)
          .order("rate_date", { ascending: false })
          .limit(1).maybeSingle();
        return Number(r?.mid_rate || r?.sell_rate || r?.buy_rate || 0);
      };
      const [fromR, toR] = await Promise.all([
        fetchILSRate(fromCur.code),
        fetchILSRate(toCur.code),
      ]);
      if (fromR > 0 && toR > 0) {
        setRate((fromR / toR).toFixed(6));
      }
    })();
  }, [open, fromBox?.id, toBox?.id, sameCurrency, fromCur.code, toCur.code]);

  const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const handleSubmit = async () => {
    if (!fromBox || !toBox) { toast.error("يرجى اختيار الصندوقين"); return; }
    if (fromBox.id === toBox.id) { toast.error("لا يمكن الصرف من صندوق لنفسه"); return; }
    if (sameCurrency) { toast.error("الصندوقان بنفس العملة — استخدم شاشة التحويل بين الصناديق"); return; }
    if (!fromBox.gl_account_code || !toBox.gl_account_code) {
      toast.error("أحد الصناديق لا يملك حساب دفتر أستاذ مربوط"); return;
    }
    const src = Number(amount), r = Number(rate);
    if (!src || src <= 0) { toast.error("أدخل مبلغاً صحيحاً"); return; }
    if (!r || r <= 0) { toast.error("أدخل سعر صرف صحيح"); return; }
    const tgt = src * r;

    setSaving(true);
    try {
      const idemKey = `FX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const baseDesc = `صرف عملة: ${fromBox.name} (${fromCur.label}) → ${toBox.name} (${toCur.label}) | سعر: 1 ${fromCur.arLabel} = ${r} ${toCur.arLabel}`;
      const desc = notes ? `${baseDesc} - ${notes}` : baseDesc;

      // Use the official atomic RPC — validates postable accounts, is idempotent,
      // and records a single direct from→to transaction (no non-standard clearing account).
      const { data: rpcRes, error: rpcErr } = await supabase.rpc("create_currency_exchange_atomic", {
        p_user_id: userId,
        p_from_account_code: fromBox.gl_account_code,
        p_to_account_code: toBox.gl_account_code,
        p_from_amount: src,
        p_to_amount: tgt,
        p_from_currency: fromCur.arLabel,
        p_to_currency: toCur.arLabel,
        p_exchange_rate: r,
        p_exchange_date: transferDate,
        p_description: desc,
        p_idempotency_key: idemKey,
      });
      if (rpcErr) throw rpcErr;
      const res = rpcRes as any;
      if (!res?.success) throw new Error(res?.error || "فشل تنفيذ الصرف");
      const ref = res?.reference || idemKey;

      // Audit trail (best-effort — non-fatal)
      await supabase.from("cash_transfers").insert({
        user_id: userId,
        from_box_id: fromBox.id,
        to_box_id: toBox.id,
        amount: src,
        currency: fromCur.code,
        exchange_rate: r,
        transfer_date: transferDate,
        description: desc,
        transfer_type: "currency_exchange",
      });

      broadcastChange("transaction", "created", ref);
      toast.success(`تم صرف ${fromCur.symbol}${fmt(src)} → ${toCur.symbol}${fmt(tgt)} بنجاح`);
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
      title="صرف عملة بين صندوقين"
      description="تحويل مبلغ من صندوق بعملة إلى صندوق بعملة أخرى — قيد محاسبي متزن عبر حساب وسيط"
      primaryLabel="تنفيذ صرف العملة"
      primaryLoading={saving}
      primaryDisabled={!fromBoxId || !toBoxId || fromBoxId === toBoxId || sameCurrency || !amount || !rate || Number(amount) <= 0 || Number(rate) <= 0}
      onPrimary={handleSubmit}
    >
      {/* From/To boxes */}
      <div className="grid grid-cols-[1fr,auto,1fr] gap-2 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1"><Wallet className="h-3 w-3" /> من صندوق</Label>
          <Select value={fromBoxId} onValueChange={setFromBoxId}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الصندوق المصدر..." /></SelectTrigger>
            <SelectContent>
              {boxes.filter(b => b.id !== toBoxId && (b.type === "main" || b.type === "branch")).map(b => (
                <SelectItem key={b.id} value={b.id}>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">{b.gl_account_code}</span>
                    {b.name}
                    <span className="text-[10px] text-muted-foreground">({curMeta(b.currency).symbol})</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {fromBox && <p className="text-[10px] text-muted-foreground">العملة: <span className="font-bold">{fromCur.label}</span></p>}
        </div>
        <ArrowLeftRight className="h-4 w-4 text-muted-foreground mb-2" />
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1"><Wallet className="h-3 w-3" /> إلى صندوق</Label>
          <Select value={toBoxId} onValueChange={setToBoxId}>
            <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="اختر الصندوق الوجهة..." /></SelectTrigger>
            <SelectContent>
              {boxes.filter(b => b.id !== fromBoxId && (b.type === "main" || b.type === "branch")).map(b => (
                <SelectItem key={b.id} value={b.id}>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">{b.gl_account_code}</span>
                    {b.name}
                    <span className="text-[10px] text-muted-foreground">({curMeta(b.currency).symbol})</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {toBox && <p className="text-[10px] text-muted-foreground">العملة: <span className="font-bold">{toCur.label}</span></p>}
        </div>
      </div>

      {sameCurrency && (
        <div className="rounded-md p-2 border border-amber-200 bg-amber-50 text-[11px] text-amber-800">
          الصندوقان بنفس العملة. لتحويل عادي بدون صرف استخدم شاشة "تحويل بين الصناديق".
        </div>
      )}

      {/* Date + Amount + Rate */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">التاريخ</Label>
          <Input type="date" className="h-9 text-sm" value={transferDate} onChange={e => setTransferDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">المبلغ ({fromCur.symbol})</Label>
          <Input type="number" step="0.01" className="h-9 text-sm font-mono" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} disabled={!fromBox || !toBox || sameCurrency} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1"><TrendingUp className="h-3 w-3" /> سعر الصرف</Label>
          <Input type="number" step="0.000001" className="h-9 text-sm font-mono" placeholder="0.00" value={rate} onChange={e => setRate(e.target.value)} disabled={!fromBox || !toBox || sameCurrency} />
          {fromBox && toBox && !sameCurrency && (
            <p className="text-[10px] text-muted-foreground">1 {fromCur.arLabel} = ؟ {toCur.arLabel}</p>
          )}
        </div>
      </div>

      {/* Preview */}
      {Number(amount) > 0 && Number(rate) > 0 && fromBox && toBox && !sameCurrency && (
        <div className="rounded-md p-3 border border-border bg-muted/40 space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">المبلغ المُستلم في {toBox.name}:</span>
            <span className="font-bold font-mono text-foreground text-base">
              {toCur.symbol}{fmt(convertedAmount)}
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground">
            {fromCur.symbol}{fmt(Number(amount))} × {rate} = {toCur.symbol}{fmt(convertedAmount)}
          </p>
          <p className="text-[10px] text-muted-foreground mt-2 border-t pt-1.5">
            القيد: Cr {fromBox.gl_account_code} ({fromCur.arLabel}) {fmt(Number(amount))} / Dr {toBox.gl_account_code} ({toCur.arLabel}) {fmt(convertedAmount)}
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
    </FinanceModal>
  );
}
