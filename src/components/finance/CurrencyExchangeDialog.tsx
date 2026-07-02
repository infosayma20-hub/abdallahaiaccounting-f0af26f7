import { useState, useEffect, useMemo, useRef } from "react";
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
  // Cross-currency transfer between two cash boxes.
  //   - User can edit either "from amount" OR "to amount" OR the rate — the third auto-computes.
  //   - Posting: single balanced transaction row where
  //        amount         = ILS-side value  (drives ILS box statement)
  //        foreign_amount = foreign-side value  (drives foreign box statement)
  //     This is required because foreign-cash accounts (1111-1114) render `foreign_amount`
  //     on the account statement, while ILS boxes render `amount`.
  //   - Requires at least one of the two boxes to be ILS. Foreign↔Foreign should be done
  //     via two exchanges (foreign → ILS → foreign) to keep both statements correct.
  const [fromBoxId, setFromBoxId] = useState("");
  const [toBoxId, setToBoxId] = useState("");
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [rate, setRate] = useState("");        // 1 from-unit = ? to-units
  const [notes, setNotes] = useState("");
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split("T")[0]);
  const [saving, setSaving] = useState(false);
  // Track which two fields the user last touched so the third auto-updates.
  const lastEdited = useRef<Array<"from" | "to" | "rate">>(["from", "rate"]);
  const touch = (field: "from" | "to" | "rate") => {
    lastEdited.current = [field, lastEdited.current.find(f => f !== field) || (field === "from" ? "rate" : "from")];
  };

  const fromBox = boxes.find(b => b.id === fromBoxId);
  const toBox = boxes.find(b => b.id === toBoxId);
  const fromCur = curMeta(fromBox?.currency);
  const toCur = curMeta(toBox?.currency);
  const sameCurrency = !!fromBox && !!toBox && fromCur.code === toCur.code;
  const bothForeign = !!fromBox && !!toBox && fromCur.code !== "ILS" && toCur.code !== "ILS";

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setFromBoxId(""); setToBoxId(""); setFromAmount(""); setToAmount(""); setRate(""); setNotes("");
      setTransferDate(new Date().toISOString().split("T")[0]);
      lastEdited.current = ["from", "rate"];
    }
  }, [open]);

  // Fetch default cross-rate whenever boxes change (ILS-per-from / ILS-per-to).
  // The user can override the rate afterwards.
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
        const defaultRate = fromR / toR;
        setRate(defaultRate.toFixed(6));
        // Also fill toAmount if fromAmount already entered
        const f = Number(fromAmount);
        if (f > 0) setToAmount((f * defaultRate).toFixed(2));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fromBox?.id, toBox?.id, sameCurrency, fromCur.code, toCur.code]);

  // Auto-compute the third field from the two most recently edited ones.
  useEffect(() => {
    const [a, b] = lastEdited.current;
    const missing = (["from", "to", "rate"] as const).find(f => f !== a && f !== b);
    if (!missing) return;
    const f = Number(fromAmount), t = Number(toAmount), r = Number(rate);
    if (missing === "to" && f > 0 && r > 0) {
      const v = (f * r).toFixed(2); if (v !== toAmount) setToAmount(v);
    } else if (missing === "from" && t > 0 && r > 0) {
      const v = (t / r).toFixed(2); if (v !== fromAmount) setFromAmount(v);
    } else if (missing === "rate" && f > 0 && t > 0) {
      const v = (t / f).toFixed(6); if (v !== rate) setRate(v);
    }
  }, [fromAmount, toAmount, rate]);

  const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const handleSubmit = async () => {
    if (!fromBox || !toBox) { toast.error("يرجى اختيار الصندوقين"); return; }
    if (fromBox.id === toBox.id) { toast.error("لا يمكن الصرف من صندوق لنفسه"); return; }
    if (sameCurrency) { toast.error("الصندوقان بنفس العملة — استخدم شاشة التحويل بين الصناديق"); return; }
    if (bothForeign) {
      toast.error("الصرف بين عملتين أجنبيتين غير مدعوم مباشرة — نفّذ العملية عبر الشيكل");
      return;
    }
    if (!fromBox.gl_account_code || !toBox.gl_account_code) {
      toast.error("أحد الصناديق لا يملك حساب دفتر أستاذ مربوط"); return;
    }
    const fAmt = Number(fromAmount), tAmt = Number(toAmount), r = Number(rate);
    if (!fAmt || fAmt <= 0) { toast.error("أدخل مبلغ المصدر"); return; }
    if (!tAmt || tAmt <= 0) { toast.error("أدخل مبلغ الوجهة"); return; }
    if (!r || r <= 0) { toast.error("أدخل سعر صرف صحيح"); return; }

    // Determine which leg is ILS and which is the foreign box.
    const fromIsILS = fromCur.code === "ILS";
    const ilsAmount = fromIsILS ? fAmt : tAmt;
    const foreignAmount = fromIsILS ? tAmt : fAmt;
    const foreignCurName = fromIsILS ? toCur.arLabel : fromCur.arLabel;
    // exchange_rate stored as ILS-per-foreign-unit (accounting convention used elsewhere).
    const ilsPerForeign = ilsAmount / foreignAmount;

    setSaving(true);
    try {
      const idemKey = `FX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const ref = `FX-${new Date(transferDate).toISOString().slice(0,10).replace(/-/g,"")}-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
      const baseDesc = `صرف عملة: ${fromBox.name} (${fromCur.arLabel} ${fmt(fAmt)}) → ${toBox.name} (${toCur.arLabel} ${fmt(tAmt)}) | سعر: 1 ${fromCur.arLabel} = ${r} ${toCur.arLabel}`;
      const desc = notes ? `${baseDesc} - ${notes}` : baseDesc;

      // Direct single-row posting so BOTH box statements show the correct amount in their
      // own currency:
      //   - ILS box uses `amount`      → we store the ILS-side value there.
      //   - Foreign box uses `foreign_amount` → we store the foreign-side value there.
      //   - `currency` names the foreign leg so the statement's currency filters resolve correctly.
      const { data: inserted, error: insErr } = await supabase.from("transactions").insert({
        user_id: userId,
        transaction_date: transferDate,
        description: desc,
        debit_account_code: toBox.gl_account_code,
        credit_account_code: fromBox.gl_account_code,
        amount: ilsAmount,
        foreign_amount: foreignAmount,
        exchange_rate: ilsPerForeign,
        currency: foreignCurName,
        transaction_type: "currency_exchange",
        reference: ref,
        idempotency_key: idemKey,
        payment_method: "exchange",
      }).select("id").single();
      if (insErr) throw insErr;

      // Audit trail (best-effort — non-fatal)
      await supabase.from("cash_transfers").insert({
        user_id: userId,
        from_box_id: fromBox.id,
        to_box_id: toBox.id,
        amount: fAmt,
        currency: fromCur.code,
        exchange_rate: r,
        transfer_date: transferDate,
        description: desc,
        transfer_type: "currency_exchange",
      });

      broadcastChange("transaction", "created", ref);
      toast.success(`تم صرف ${fromCur.symbol}${fmt(fAmt)} → ${toCur.symbol}${fmt(tAmt)} بنجاح`);
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
      description="حرّر أي حقلين (المصدر / الوجهة / سعر الصرف) والثالث يُحسب تلقائياً"
      primaryLabel="تنفيذ صرف العملة"
      primaryLoading={saving}
      primaryDisabled={!fromBoxId || !toBoxId || fromBoxId === toBoxId || sameCurrency || bothForeign || !fromAmount || !toAmount || !rate || Number(fromAmount) <= 0 || Number(toAmount) <= 0 || Number(rate) <= 0}
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
      {bothForeign && (
        <div className="rounded-md p-2 border border-amber-200 bg-amber-50 text-[11px] text-amber-800">
          الصرف المباشر بين عملتين أجنبيتين غير مدعوم. نفّذ العملية على مرحلتين عبر صندوق الشيكل.
        </div>
      )}

      {/* Date + From Amount + To Amount + Rate */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">التاريخ</Label>
          <Input type="date" className="h-9 text-sm" value={transferDate} onChange={e => setTransferDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">مبلغ المصدر ({fromCur.symbol})</Label>
          <Input type="number" step="0.01" className="h-9 text-sm font-mono" placeholder="0.00"
            value={fromAmount}
            onChange={e => { touch("from"); setFromAmount(e.target.value); }}
            disabled={!fromBox || !toBox || sameCurrency || bothForeign} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">مبلغ الوجهة ({toCur.symbol})</Label>
          <Input type="number" step="0.01" className="h-9 text-sm font-mono" placeholder="0.00"
            value={toAmount}
            onChange={e => { touch("to"); setToAmount(e.target.value); }}
            disabled={!fromBox || !toBox || sameCurrency || bothForeign} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1"><TrendingUp className="h-3 w-3" /> سعر الصرف</Label>
          <Input type="number" step="0.000001" className="h-9 text-sm font-mono" placeholder="0.00"
            value={rate}
            onChange={e => { touch("rate"); setRate(e.target.value); }}
            disabled={!fromBox || !toBox || sameCurrency || bothForeign} />
          {fromBox && toBox && !sameCurrency && (
            <p className="text-[10px] text-muted-foreground">1 {fromCur.arLabel} = {rate || "؟"} {toCur.arLabel}</p>
          )}
        </div>
      </div>

      {/* Preview */}
      {Number(fromAmount) > 0 && Number(toAmount) > 0 && fromBox && toBox && !sameCurrency && !bothForeign && (
        <div className="rounded-md p-3 border border-border bg-muted/40 space-y-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">خصم من {fromBox.name}:</span>
            <span className="font-bold font-mono">{fromCur.symbol}{fmt(Number(fromAmount))}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">إيداع في {toBox.name}:</span>
            <span className="font-bold font-mono">{toCur.symbol}{fmt(Number(toAmount))}</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2 border-t pt-1.5">
            القيد: Cr {fromBox.gl_account_code} ({fromCur.arLabel} {fmt(Number(fromAmount))}) / Dr {toBox.gl_account_code} ({toCur.arLabel} {fmt(Number(toAmount))})
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
