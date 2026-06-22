import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Banknote, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FinanceModal } from "@/components/finance/shell";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  userId: string;
}

type CurrencyKey = "USD" | "JOD" | "EUR";

const CURRENCY_CONFIG: Record<CurrencyKey, {
  label: string;
  symbol: string;
  arabic: string; // value stored in transactions.currency / accounts.currency
  boxCode: string;
  boxNameAr: string;
  defaultRate: string;
}> = {
  USD: { label: "دولار أمريكي (USD)", symbol: "$",  arabic: "دولار", boxCode: "1111", boxNameAr: "صندوق الدولار", defaultRate: "3.65" },
  JOD: { label: "دينار أردني (JOD)",  symbol: "د.أ", arabic: "دينار", boxCode: "1112", boxNameAr: "صندوق الدينار",  defaultRate: "5.15" },
  EUR: { label: "يورو (EUR)",          symbol: "€",   arabic: "يورو",  boxCode: "1113", boxNameAr: "صندوق اليورو",   defaultRate: "3.95" },
};

const OPENING_BALANCE_CODE = "3400";

export default function ForeignCashOpeningBalanceDialog({ open, onOpenChange, onSuccess, userId }: Props) {
  const [currency, setCurrency] = useState<CurrencyKey>("USD");
  const [foreignAmount, setForeignAmount] = useState("");
  const [rate, setRate] = useState(CURRENCY_CONFIG.USD.defaultRate);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [existingOpening, setExistingOpening] = useState<number | null>(null);
  const [boxAccountExists, setBoxAccountExists] = useState(true);

  const cfg = CURRENCY_CONFIG[currency];

  // When currency changes, update default rate
  useEffect(() => {
    setRate(cfg.defaultRate);
  }, [currency, cfg.defaultRate]);

  // Check if account exists + existing opening balance for selected box
  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    (async () => {
      const { data: acc } = await supabase
        .from("accounts")
        .select("id, account_code")
        .eq("user_id", userId)
        .eq("account_code", cfg.boxCode)
        .maybeSingle();
      if (cancelled) return;
      setBoxAccountExists(!!acc);

      const { data: existing } = await supabase
        .from("transactions")
        .select("foreign_amount, amount")
        .eq("user_id", userId)
        .eq("debit_account_code", cfg.boxCode)
        .eq("is_opening_balance", true)
        .eq("is_deleted", false);
      if (cancelled) return;
      const sum = (existing || []).reduce((s, t: any) => s + (Number(t.foreign_amount) || 0), 0);
      setExistingOpening(sum > 0 ? sum : null);
    })();
    return () => { cancelled = true; };
  }, [open, userId, cfg.boxCode]);

  const ilsEquivalent = useMemo(() => {
    const a = Number(foreignAmount) || 0;
    const r = Number(rate) || 0;
    return +(a * r).toFixed(2);
  }, [foreignAmount, rate]);

  const reset = () => {
    setForeignAmount("");
    setNotes("");
    setDate(new Date().toISOString().slice(0, 10));
  };

  const handleSubmit = async () => {
    const amtFx = Number(foreignAmount);
    const r = Number(rate);
    if (!amtFx || amtFx <= 0) { toast.error("أدخل مبلغ بالعملة الأجنبية"); return; }
    if (!r || r <= 0) { toast.error("أدخل سعر صرف صحيح"); return; }
    if (!boxAccountExists) { toast.error(`لا يوجد حساب ${cfg.boxCode} (${cfg.boxNameAr}) — راجع شجرة الحسابات`); return; }

    setSaving(true);
    try {
      const desc = `رصيد افتتاحي - ${cfg.boxNameAr}${notes ? ` - ${notes}` : ""}`;
      const idempotencyKey = `OPENBAL-${cfg.boxCode}-${userId}-${date}-${amtFx}-${r}`;

      const { error } = await supabase.from("transactions").insert({
        user_id: userId,
        transaction_date: date,
        description: desc,
        debit_account_code: cfg.boxCode,
        credit_account_code: OPENING_BALANCE_CODE,
        amount: ilsEquivalent,
        foreign_amount: amtFx,
        exchange_rate: r,
        currency: cfg.arabic,
        transaction_type: "opening_balance",
        is_opening_balance: true,
        notes: notes || null,
        reference: `OPEN-FX-${cfg.boxCode}`,
        idempotency_key: idempotencyKey,
      });
      if (error) throw error;

      toast.success(`تم تسجيل الرصيد الافتتاحي: ${cfg.symbol}${amtFx.toLocaleString()} (₪${ilsEquivalent.toLocaleString()})`);
      reset();
      onSuccess();
      onOpenChange(false);
    } catch (err: any) {
      console.error(err);
      if (err?.code === "23505") {
        toast.error("هذا الرصيد الافتتاحي مسجَّل مسبقاً بنفس القيم");
      } else {
        toast.error("فشل الحفظ: " + (err?.message || "حاول مرة أخرى"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <FinanceModal
      open={open}
      onOpenChange={onOpenChange}
      icon={Banknote}
      title="رصيد افتتاحي - صندوق عملة أجنبية"
      description="إدخال رصيد افتتاحي للدولار / الدينار / اليورو مع سعر الصرف"
      primaryLabel="حفظ القيد الافتتاحي"
      primaryLoading={saving}
      primaryDisabled={!foreignAmount || Number(foreignAmount) <= 0 || !rate || Number(rate) <= 0 || !boxAccountExists}
      onPrimary={handleSubmit}
    >
      {/* Currency */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">العملة / الصندوق</Label>
        <Select value={currency} onValueChange={(v) => setCurrency(v as CurrencyKey)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(CURRENCY_CONFIG) as CurrencyKey[]).map((k) => (
              <SelectItem key={k} value={k}>
                <span className="flex items-center gap-2">
                  {CURRENCY_CONFIG[k].label}
                  <span className="text-muted-foreground text-[10px]">({CURRENCY_CONFIG[k].boxCode})</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!boxAccountExists && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive flex gap-2 items-start">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>الحساب <b>{cfg.boxCode}</b> غير موجود لدى الشركة. أضِفه من شجرة الحسابات أولاً.</span>
        </div>
      )}

      {existingOpening != null && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-400 flex gap-2 items-start">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            يوجد رصيد افتتاحي سابق لهذا الصندوق: <b>{cfg.symbol}{existingOpening.toLocaleString()}</b>.
            القيد الجديد سيُضاف فوقه (لن يُستبدل).
          </span>
        </div>
      )}

      {/* Amount + Rate */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">المبلغ ({cfg.symbol})</Label>
          <Input
            type="number" min="0.01" step="0.01" placeholder="0.00"
            value={foreignAmount} onChange={(e) => setForeignAmount(e.target.value)}
            className="font-mono text-left" dir="ltr"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-semibold">سعر الصرف (₪ / {cfg.symbol})</Label>
          <Input
            type="number" min="0.0001" step="0.0001" placeholder="0.00"
            value={rate} onChange={(e) => setRate(e.target.value)}
            className="font-mono text-left" dir="ltr"
          />
        </div>
      </div>

      {/* Date */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">تاريخ القيد</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">ملاحظات (اختياري)</Label>
        <Textarea
          placeholder="مثال: عدّ صندوق الدولار في 30/6/2026"
          value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
        />
      </div>

      {/* Summary */}
      {foreignAmount && Number(foreignAmount) > 0 && Number(rate) > 0 && (
        <div className="bg-muted/40 rounded-md p-3 text-xs space-y-1 border border-border">
          <p className="font-semibold text-foreground">ملخص القيد المحاسبي:</p>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              مدين: {cfg.boxNameAr} ({cfg.boxCode}) — {cfg.symbol}{Number(foreignAmount).toLocaleString()}
            </span>
            <span className="font-mono font-bold text-emerald-600">₪{ilsEquivalent.toLocaleString()}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">دائن: الأرصدة الافتتاحية ({OPENING_BALANCE_CODE})</span>
            <span className="font-mono font-bold text-rose-600">₪{ilsEquivalent.toLocaleString()}</span>
          </div>
          <div className="pt-1.5 mt-1.5 border-t border-border/60 text-[11px] text-muted-foreground">
            سعر الصرف: 1 {cfg.symbol} = ₪{Number(rate).toFixed(4)}
          </div>
        </div>
      )}
    </FinanceModal>
  );
}