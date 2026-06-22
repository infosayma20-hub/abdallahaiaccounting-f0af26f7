import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Banknote, AlertTriangle, Wrench, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FinanceModal } from "@/components/finance/shell";
import { Button } from "@/components/ui/button";

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
  parentCode: string;
  boxNameAr: string;
  defaultRate: string;
  branchField: "gl_cash_usd_account_code" | "gl_cash_jod_account_code" | "gl_cash_eur_account_code";
}> = {
  USD: { label: "دولار أمريكي (USD)", symbol: "$",   arabic: "دولار", parentCode: "1111", boxNameAr: "صندوق الدولار", defaultRate: "3.65", branchField: "gl_cash_usd_account_code" },
  JOD: { label: "دينار أردني (JOD)",  symbol: "د.أ", arabic: "دينار", parentCode: "1112", boxNameAr: "صندوق الدينار", defaultRate: "5.15", branchField: "gl_cash_jod_account_code" },
  EUR: { label: "يورو (EUR)",          symbol: "€",   arabic: "يورو",  parentCode: "1113", boxNameAr: "صندوق اليورو",  defaultRate: "3.95", branchField: "gl_cash_eur_account_code" },
};

const OPENING_BALANCE_CODE = "3400";

interface BranchRow {
  id: string;
  name: string;
  gl_cash_usd_account_code: string | null;
  gl_cash_jod_account_code: string | null;
  gl_cash_eur_account_code: string | null;
}

export default function ForeignCashOpeningBalanceDialog({ open, onOpenChange, onSuccess, userId }: Props) {
  const [currency, setCurrency] = useState<CurrencyKey>("USD");
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [branchId, setBranchId] = useState<string>("");
  const [provisioning, setProvisioning] = useState(false);
  const [foreignAmount, setForeignAmount] = useState("");
  const [rate, setRate] = useState(CURRENCY_CONFIG.USD.defaultRate);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [existingOpening, setExistingOpening] = useState<number | null>(null);

  const cfg = CURRENCY_CONFIG[currency];
  const selectedBranch = branches.find((b) => b.id === branchId) || null;
  const targetAccountCode = selectedBranch ? (selectedBranch[cfg.branchField] || null) : null;
  const needsProvisioning = !!selectedBranch && !targetAccountCode;

  // When currency changes, update default rate
  useEffect(() => {
    setRate(cfg.defaultRate);
  }, [currency, cfg.defaultRate]);

  // Load branches once on open
  const loadBranches = async () => {
    const { data, error } = await supabase
      .from("branches")
      .select("id,name,gl_cash_usd_account_code,gl_cash_jod_account_code,gl_cash_eur_account_code")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("name");
    if (error) { console.error(error); return; }
    setBranches((data as BranchRow[]) || []);
    if (!branchId && data && data.length > 0) setBranchId(data[0].id);
  };

  useEffect(() => {
    if (!open || !userId) return;
    loadBranches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  // Existing opening balance for selected branch+currency box
  useEffect(() => {
    if (!open || !userId || !targetAccountCode) { setExistingOpening(null); return; }
    let cancelled = false;
    (async () => {
      const { data: existing } = await supabase
        .from("transactions")
        .select("foreign_amount, amount")
        .eq("user_id", userId)
        .eq("debit_account_code", targetAccountCode)
        .eq("is_opening_balance", true)
        .eq("is_deleted", false);
      if (cancelled) return;
      const sum = (existing || []).reduce((s, t: any) => s + (Number(t.foreign_amount) || 0), 0);
      setExistingOpening(sum > 0 ? sum : null);
    })();
    return () => { cancelled = true; };
  }, [open, userId, targetAccountCode]);

  const handleProvision = async () => {
    setProvisioning(true);
    try {
      const { error } = await supabase.rpc("provision_branch_fx_boxes", { p_user_id: userId } as any);
      if (error) throw error;
      toast.success("تم تجهيز حسابات صناديق العملات لكل فرع");
      await loadBranches();
    } catch (err: any) {
      console.error(err);
      toast.error("فشل التجهيز: " + (err?.message || ""));
    } finally {
      setProvisioning(false);
    }
  };

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
    if (!selectedBranch) { toast.error("اختر الفرع"); return; }
    if (!targetAccountCode) { toast.error("لا يوجد حساب فرعي للفرع — اضغط «تجهيز صناديق الفروع»"); return; }
    if (!amtFx || amtFx <= 0) { toast.error("أدخل مبلغ بالعملة الأجنبية"); return; }
    if (!r || r <= 0) { toast.error("أدخل سعر صرف صحيح"); return; }

    setSaving(true);
    try {
      const desc = `رصيد افتتاحي - ${cfg.boxNameAr} - فرع ${selectedBranch.name}${notes ? ` - ${notes}` : ""}`;
      const idempotencyKey = `OPENBAL-${targetAccountCode}-${userId}-${date}-${amtFx}-${r}`;

      const { error } = await supabase.from("transactions").insert({
        user_id: userId,
        transaction_date: date,
        description: desc,
        debit_account_code: targetAccountCode,
        credit_account_code: OPENING_BALANCE_CODE,
        amount: ilsEquivalent,
        foreign_amount: amtFx,
        exchange_rate: r,
        currency: cfg.arabic,
        transaction_type: "opening_balance",
        is_opening_balance: true,
        notes: notes || null,
        reference: `OPEN-FX-${targetAccountCode}`,
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
      title="رصيد افتتاحي - صندوق عملة أجنبية (لكل فرع)"
      description="إدخال رصيد افتتاحي لصندوق الدولار/الدينار/اليورو الخاص بفرع محدّد"
      primaryLabel="حفظ القيد الافتتاحي"
      primaryLoading={saving}
      primaryDisabled={!foreignAmount || Number(foreignAmount) <= 0 || !rate || Number(rate) <= 0 || !targetAccountCode}
      onPrimary={handleSubmit}
    >
      {/* Branch */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold">الفرع</Label>
        {branches.length === 0 ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-400 flex gap-2 items-start">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>لا توجد فروع نشطة. أضف فرعاً على الأقل من إعدادات الفروع.</span>
          </div>
        ) : (
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

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
                  <span className="text-muted-foreground text-[10px]">(تحت {CURRENCY_CONFIG[k].parentCode})</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Target sub-account status */}
      {selectedBranch && targetAccountCode && (
        <div className="rounded-md border border-border bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
          الحساب المستهدف: <b className="font-mono text-foreground">{targetAccountCode}</b> — {cfg.boxNameAr} / فرع {selectedBranch.name}
        </div>
      )}
      {needsProvisioning && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-amber-700 dark:text-amber-400 space-y-2">
          <div className="flex gap-2 items-start">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>لا يوجد حساب فرعي لـ {cfg.boxNameAr} لفرع <b>{selectedBranch?.name}</b> بعد.</span>
          </div>
          <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={handleProvision} disabled={provisioning}>
            {provisioning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wrench className="h-3.5 w-3.5" />}
            تجهيز صناديق الفروع
          </Button>
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
              مدين: {cfg.boxNameAr} ({targetAccountCode || cfg.parentCode}){selectedBranch ? ` - ${selectedBranch.name}` : ""} — {cfg.symbol}{Number(foreignAmount).toLocaleString()}
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