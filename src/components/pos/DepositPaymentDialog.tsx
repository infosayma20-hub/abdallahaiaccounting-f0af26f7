import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Banknote, AlertTriangle } from "lucide-react";
import SplitPaymentPanel, { type SplitTender } from "@/components/pos/SplitPaymentPanel";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Full order total — the deposit can never exceed it. */
  orderTotal: number;
  userId: string | null | undefined;
  defaultCardGlAccountCode?: string | null;
  exchangeRates?: Record<string, number>;
  currencies?: Array<{ code: string; symbol: string; name: string }>;
  /** Deposit already captured (used to re-open and edit). */
  initialAmount?: number;
  initialTenders?: SplitTender[];
  onConfirm: (amountILS: number, tenders: SplitTender[]) => void;
}

/**
 * شاشة قبض العربون — تستخدم نفس محرك التندر متعدد العملات المستعمل في شاشة
 * الدفع في نقطة البيع (نقد/فيزا، شيكل/دولار/دينار، ومختلط).
 *
 * ⚠️ لا تنشئ فاتورة ولا قيد محاسبي. العربون بند تشغيلي فقط يظهر في إغلاق
 * العهدة ودراسة الوردية، ويجب إبلاغ قسم المالية لتسجيله محاسبياً.
 */
export default function DepositPaymentDialog({
  open,
  onOpenChange,
  orderTotal,
  userId,
  defaultCardGlAccountCode = null,
  exchangeRates = {},
  currencies = [],
  initialAmount = 0,
  initialTenders = [],
  onConfirm,
}: Props) {
  const [amount, setAmount] = useState<string>("");
  const [tenders, setTenders] = useState<SplitTender[]>([]);

  useEffect(() => {
    if (!open) return;
    setAmount(initialAmount > 0 ? String(initialAmount) : "");
    setTenders(initialTenders.length ? initialTenders : []);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const depositAmount = useMemo(() => Math.max(0, Math.round((Number(amount) || 0) * 100) / 100), [amount]);
  const collected = useMemo(
    () => Math.round(tenders.reduce((s, t) => s + (Number(t.amount) || 0), 0) * 100) / 100,
    [tenders]
  );
  const balanced = depositAmount > 0 && Math.abs(collected - depositAmount) < 0.01;

  const confirm = () => {
    if (depositAmount <= 0) return;
    if (depositAmount > orderTotal + 0.001) return;
    if (!balanced) return;
    onConfirm(depositAmount, tenders);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg p-0 overflow-hidden" dir="rtl">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Banknote className="h-4 w-4 text-primary" />
            قبض عربون — طلبية مجدولة
          </DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] overflow-y-auto pb-2">
          <div className="mx-4 mb-3 flex items-baseline justify-between rounded border border-border bg-muted/40 px-3 py-2">
            <span className="text-[11px] text-muted-foreground">إجمالي الطلبية</span>
            <span className="text-[16px] font-semibold tabular-nums">₪{orderTotal.toFixed(2)}</span>
          </div>

          <div className="mx-4 mb-1">
            <label className="mb-1 block text-xs">قيمة العربون (بالشيكل)</label>
            <Input
              type="number"
              min={0}
              step="0.5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="h-9 text-sm"
              placeholder="0.00"
              autoFocus
            />
            {depositAmount > orderTotal + 0.001 && (
              <p className="mt-1 text-[11px] text-destructive">العربون أكبر من قيمة الطلبية</p>
            )}
          </div>

          {depositAmount > 0 && (
            <SplitPaymentPanel
              total={depositAmount}
              tenders={tenders}
              setTenders={setTenders}
              userId={userId}
              defaultCardGlAccountCode={defaultCardGlAccountCode}
              exchangeRates={exchangeRates}
              currencies={currencies}
            />
          )}

          <div className="mx-4 mt-3 flex gap-2 rounded border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              العربون لا يُنشئ فاتورة ولا قيد محاسبي. النقد منه يدخل ضمن الكاش المعدود في إغلاق العهدة،
              و<b>يجب إبلاغ قسم المالية</b> لتسجيل الدفعة محاسبياً.
            </span>
          </div>
        </div>

        <DialogFooter className="border-t bg-muted/30 px-4 py-3">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            إلغاء
          </Button>
          <Button size="sm" onClick={confirm} disabled={!balanced || depositAmount > orderTotal + 0.001}>
            تأكيد قبض ₪{depositAmount.toFixed(2)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
