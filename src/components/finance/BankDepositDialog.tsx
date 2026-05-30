import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Landmark, ArrowUpFromLine } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FinanceModal } from "@/components/finance/shell";

interface CashBox {
  id: string;
  name: string;
  type: string;
  gl_account_code: string;
  currency?: string;
}

interface BankAccount {
  id: string;
  name: string;
  bank_name: string;
  gl_account_code: string | null;
  currency: string | null;
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

export default function BankDepositDialog({ open, onOpenChange, boxes, onSuccess, userId }: Props) {
  const [fromBoxId, setFromBoxId] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [currency, setCurrency] = useState("ILS");
  const [amount, setAmount] = useState("");
  const [depositRef, setDepositRef] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);

  const fromBox = boxes.find(b => b.id === fromBoxId);
  const bankAccount = bankAccounts.find(b => b.id === bankAccountId);
  const curInfo = CURRENCIES.find(c => c.code === currency);

  useEffect(() => {
    if (!open) return;
    supabase
      .from("bank_accounts")
      .select("id, name, bank_name, gl_account_code, currency")
      .eq("user_id", userId)
      .eq("is_active", true)
      .then(({ data }) => setBankAccounts(data || []));
  }, [open, userId]);

  const fmt = (n: number) => new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const handleSubmit = async () => {
    if (!fromBox || !bankAccount || !amount || Number(amount) <= 0) {
      toast.error("يرجى تعبئة جميع الحقول بشكل صحيح");
      return;
    }

    const bankGl = bankAccount.gl_account_code || "1120";

    if (fromBox.gl_account_code === bankGl) {
      toast.error("لا يمكن الإيداع لنفس الحساب");
      return;
    }

    setSaving(true);
    try {
      const desc = `إيداع بنكي من ${fromBox.name} إلى ${bankAccount.name} (${bankAccount.bank_name})`;
      const idempotencyKey = `DEP-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

      const { data: rpcRes, error } = await supabase.rpc("create_bank_deposit_atomic", {
        p_user_id: userId,
        p_cash_account_code: fromBox.gl_account_code,
        p_bank_account_code: bankGl,
        p_amount: Number(amount),
        p_currency: curInfo?.arLabel || "شيكل",
        p_deposit_date: new Date().toISOString().split("T")[0],
        p_description: notes ? `${desc} - ${notes}` : desc,
        p_idempotency_key: idempotencyKey,
      });
      const r = rpcRes as any;
      if (error || !r?.success) throw new Error(error?.message || r?.error || "فشل الإيداع");

      // Also record as cash transfer for audit trail
      await supabase.from("cash_transfers").insert({
        user_id: userId,
        from_box_id: fromBox.id,
        amount: Number(amount),
        transfer_date: new Date().toISOString().split("T")[0],
        description: desc,
        currency: currency,
        transfer_type: "bank_deposit",
      });

      toast.success(`تم إيداع ${curInfo?.symbol}${fmt(Number(amount))} في ${bankAccount.name} بنجاح`);
      onOpenChange(false);
      setAmount(""); setNotes(""); setFromBoxId(""); setBankAccountId(""); setDepositRef("");
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
      icon={ArrowUpFromLine}
      title="إيداع بنكي"
      description="تحويل من صندوق نقدي إلى حساب بنكي"
      primaryLabel="تنفيذ الإيداع البنكي"
      primaryLoading={saving}
      primaryDisabled={!fromBoxId || !bankAccountId || !amount || Number(amount) <= 0}
      onPrimary={handleSubmit}
    >
          {/* Source box */}
          <div className="space-y-1.5">
            <Label className="text-xs">من صندوق</Label>
            <Select value={fromBoxId} onValueChange={setFromBoxId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="اختر الصندوق المصدر..." />
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

          {/* Target bank */}
          <div className="space-y-1.5">
            <Label className="text-xs">إلى حساب بنكي</Label>
            <Select value={bankAccountId} onValueChange={setBankAccountId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="اختر الحساب البنكي..." />
              </SelectTrigger>
              <SelectContent>
                {bankAccounts.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1 rounded">{b.gl_account_code || "1120"}</span>
                      <Landmark className="h-3 w-3 text-muted-foreground" />
                      {b.name} — {b.bank_name}
                    </span>
                  </SelectItem>
                ))}
                {bankAccounts.length === 0 && (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    لا توجد حسابات بنكية — قم بإضافتها من صفحة البنوك
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          {/* Currency & Amount */}
          <div className="grid grid-cols-[120px,1fr] gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">العملة</Label>
              <Select value={currency} onValueChange={setCurrency}>
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
            <div className="space-y-1.5">
              <Label className="text-xs">المبلغ ({curInfo?.symbol})</Label>
              <Input
                type="number"
                className="h-9 text-sm font-mono"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
              />
            </div>
          </div>

          {/* Deposit reference */}
          <div className="space-y-1.5">
            <Label className="text-xs">رقم إيصال الإيداع (اختياري)</Label>
            <Input
              className="h-9 text-sm"
              placeholder="رقم الإيصال أو المرجع..."
              value={depositRef}
              onChange={e => setDepositRef(e.target.value)}
            />
          </div>

          {/* Preview */}
          {Number(amount) > 0 && fromBox && bankAccount && (
            <div className="rounded-md p-3 border border-border bg-muted/40">
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">من:</span>
                  <span className="font-medium">{fromBox.name} ({fromBox.gl_account_code})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">إلى:</span>
                  <span className="font-medium">{bankAccount.name} ({bankAccount.gl_account_code || "1120"})</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 mt-1">
                  <span className="text-muted-foreground">المبلغ:</span>
                  <span className="font-bold font-mono text-foreground text-sm">
                    {curInfo?.symbol}{fmt(Number(amount))}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">ملاحظات (اختياري)</Label>
            <Textarea
              className="text-sm resize-none"
              rows={2}
              placeholder="تفاصيل إضافية..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
    </FinanceModal>
  );
}
