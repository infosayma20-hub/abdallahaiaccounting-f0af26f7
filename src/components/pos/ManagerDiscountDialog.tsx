import { useEffect, useState } from "react";
import { Percent, ShieldCheck, AlertCircle, Hash, Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { verifyManagerCredentials } from "@/lib/pos/manager-verify";
import { supabase } from "@/integrations/supabase/client";

/**
 * خصم على الفاتورة بإذن مدير الفرع.
 *
 * - يتحقق من بيانات المدير عبر throwaway client (لا يلمس جلسة الكاشير).
 * - يقرأ الحد الأقصى المسموح به للنسبة من إعدادات التيرمنال.
 * - يُرجع للنداء الأصلي: نوع/قيمة الخصم + بيانات المدير + السبب.
 * - لا يحفظ أي شيء بقاعدة البيانات هنا — الحفظ المحاسبي يتم في POSPage
 *   عبر تحديث pos_orders + إدراج في pos_order_discounts بعد إتمام الدفع.
 */
export interface ManagerDiscountApproved {
  amount: number;
  type: "fixed" | "percent";
  reason: string;
  managerUserId: string;
  managerName: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onApproved: (data: ManagerDiscountApproved) => void;
  branchId?: string | null;
  terminalId?: string | null;
  companyId?: string | null;
  sessionId?: string | null;
  cashierName?: string;
  /** قيمة الفاتورة الحالية لعرض ما يعادل النسبة بالقيمة (₪). */
  orderSubtotal: number;
}

export default function ManagerDiscountDialog({
  open,
  onClose,
  onApproved,
  branchId,
  terminalId,
  companyId,
  sessionId,
  cashierName,
  orderSubtotal,
}: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [type, setType] = useState<"fixed" | "percent">("percent");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState("");
  const [maxPct, setMaxPct] = useState<number>(100);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setPassword("");
    setType("percent");
    setAmount("");
    setReason("");
    setError("");
    // اقرأ الحد الأقصى المسموح به للنسبة من التيرمنال (إن وُجد).
    (async () => {
      if (!terminalId) return;
      try {
        const { data } = await supabase
          .from("pos_terminals" as any)
          .select("max_manager_discount_percent")
          .eq("id", terminalId)
          .maybeSingle();
        const v = Number((data as any)?.max_manager_discount_percent);
        if (!isNaN(v) && v > 0) setMaxPct(Math.min(100, v));
        else setMaxPct(100);
      } catch {
        setMaxPct(100);
      }
    })();
  }, [open, terminalId]);

  const numericAmount = Number(amount) || 0;
  const equivalentValue =
    type === "percent"
      ? Math.max(0, (orderSubtotal * numericAmount) / 100)
      : numericAmount;

  const handleApprove = async () => {
    setError("");
    if (numericAmount <= 0) {
      setError("أدخل قيمة الخصم");
      return;
    }
    if (type === "percent" && numericAmount > maxPct) {
      setError(`الحد الأقصى للخصم ${maxPct}%`);
      return;
    }
    if (type === "fixed" && orderSubtotal > 0 && numericAmount > orderSubtotal) {
      setError("لا يمكن أن يتجاوز الخصم قيمة الفاتورة");
      return;
    }
    if (!reason.trim() || reason.trim().length < 3) {
      setError("أدخل سبباً واضحاً للخصم");
      return;
    }

    setLoading(true);
    const res = await verifyManagerCredentials(email, password);
    if (res.ok !== true) {
      setError((res as { reason: string }).reason);
      setLoading(false);
      return;
    }
    if (!res.isAdmin && branchId) {
      if (!res.branchIds.includes(branchId)) {
        setError("هذا المدير غير مخوّل على فرع هذا الجهاز");
        setLoading(false);
        return;
      }
    }

    // سجل تدقيق خفيف — السجل المحاسبي الرسمي يُدرج في POSPage بعد الدفع.
    try {
      await (supabase.from("pos_sensitive_actions_log" as any) as any).insert({
        company_id: companyId,
        action: "manager_discount_approved",
        manager_user_id: res.managerUserId,
        session_id: sessionId || null,
        notes:
          `خصم مدير — كاشير: ${cashierName || "—"} | نوع: ${type} | قيمة: ${numericAmount} | السبب: ${reason.trim()}`,
        metadata: {
          manager_name: res.managerName,
          discount_type: type,
          discount_value: numericAmount,
          equivalent_amount: Math.round(equivalentValue * 100) / 100,
          reason: reason.trim(),
          branch_id: branchId || null,
          terminal_id: terminalId || null,
        },
      });
    } catch {
      /* non-fatal */
    }

    setLoading(false);
    onApproved({
      amount: numericAmount,
      type,
      reason: reason.trim(),
      managerUserId: res.managerUserId,
      managerName: res.managerName,
    });
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md z-[1200]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-amber-500" />
            خصم بإذن مدير الفرع
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-4">
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            هذا الخصم يُسجَّل محاسبياً كحساب مستقل (Contra-Revenue) ويُدرج في سجل
            التدقيق. الحد الأقصى المسموح به للنسبة: {maxPct}%.
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setType("percent")}
              className={`h-10 rounded-md border text-sm flex items-center justify-center gap-1.5 transition ${
                type === "percent"
                  ? "bg-amber-500 text-white border-amber-500"
                  : "bg-background border-input hover:bg-accent"
              }`}
            >
              <Percent className="h-3.5 w-3.5" />
              نسبة %
            </button>
            <button
              type="button"
              onClick={() => setType("fixed")}
              className={`h-10 rounded-md border text-sm flex items-center justify-center gap-1.5 transition ${
                type === "fixed"
                  ? "bg-amber-500 text-white border-amber-500"
                  : "bg-background border-input hover:bg-accent"
              }`}
            >
              <Hash className="h-3.5 w-3.5" />
              قيمة ₪
            </button>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {type === "percent" ? `قيمة الخصم (%) — حد أقصى ${maxPct}%` : "قيمة الخصم (₪)"}
            </label>
            <Input
              type="number"
              inputMode="decimal"
              min={0}
              step={type === "percent" ? 1 : 0.5}
              value={amount}
              onChange={e => { setAmount(e.target.value); setError(""); }}
              placeholder="0"
              className="h-11 text-base tabular-nums"
              dir="ltr"
            />
            {numericAmount > 0 && orderSubtotal > 0 && (
              <p className="text-[11px] text-muted-foreground mt-1 tabular-nums" dir="ltr">
                ≈ ₪{equivalentValue.toFixed(2)}
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              سبب الخصم <span className="text-destructive">*</span>
            </label>
            <Textarea
              value={reason}
              onChange={e => { setReason(e.target.value); setError(""); }}
              placeholder="مثلاً: مجاملة زبون دائم / تعويض عن تأخر"
              className="min-h-[60px] text-sm"
              rows={2}
            />
          </div>

          <div className="pt-2 border-t border-border/60 space-y-3">
            <p className="text-[11px] font-medium text-muted-foreground">
              تحقق المدير
            </p>
            <div>
              <Input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError(""); }}
                placeholder="بريد المدير"
                className="h-10 text-sm"
                dir="ltr"
              />
            </div>
            <div>
              <Input
                type="password"
                value={password}
                onChange={e => { setPassword(e.target.value); setError(""); }}
                placeholder="كلمة المرور"
                className="h-10 text-sm"
                dir="ltr"
                onKeyDown={e => e.key === "Enter" && handleApprove()}
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-destructive/10 text-destructive text-xs">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={onClose} disabled={loading}>
            إلغاء
          </Button>
          <Button
            size="sm"
            onClick={handleApprove}
            disabled={loading || !email.trim() || !password.trim() || numericAmount <= 0}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            {loading ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                جاري التحقق...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-4 w-4" />
                اعتماد الخصم
              </span>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}