import { useState, useEffect } from "react";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Save, Loader2 } from "lucide-react";

interface Props {
  employee: { id: string; full_name: string; };
  userId: string;
  onSaved: () => void;
}

export default function EmployeeOpeningBalance({ employee, userId, onSaved }: Props) {
  const [amount, setAmount] = useState(0);
  const [balType, setBalType] = useState<"debit" | "credit">("debit");
  const [balDate, setBalDate] = useState(new Date().getFullYear() + "-01-01");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!employee?.id) return;
    const load = async () => {
      const { data } = await supabase
        .from("employees")
        .select("opening_balance, opening_balance_type, opening_balance_date")
        .eq("id", employee.id)
        .single();
      if (data) {
        setAmount(Number((data as any).opening_balance) || 0);
        setBalType(((data as any).opening_balance_type as "debit" | "credit") || "debit");
        setBalDate((data as any).opening_balance_date || new Date().getFullYear() + "-01-01");
      }
      setLoaded(true);
    };
    load();
  }, [employee?.id]);

  const handleSave = async () => {
    if (!employee?.id || !userId) return;
    setSaving(true);
    try {
      // 1. Update employee record
      const { error: empErr } = await supabase.from("employees").update({
        opening_balance: amount,
        opening_balance_type: balType,
        opening_balance_date: balDate,
      } as any).eq("id", employee.id);
      if (empErr) throw empErr;

      // 2. Find or get employee's linked account code
      const { data: accs } = await supabase
        .from("accounts")
        .select("account_code")
        .eq("user_id", dataOwnerId!)
        .ilike("account_name", `%${employee.full_name}%`)
        .limit(1);
      const empAccountCode = accs?.[0]?.account_code;

      if (empAccountCode && amount > 0) {
        const obRef = `OB-EMP-${employee.id.slice(0, 8)}`;
        const debitCode = balType === "debit" ? empAccountCode : "3110";
        const creditCode = balType === "debit" ? "3110" : empAccountCode;
        const { data: rpcRes, error: txErr } = await supabase.rpc("create_opening_balance_entry", {
          p_user_id: userId,
          p_debit_account_code: debitCode,
          p_credit_account_code: creditCode,
          p_amount: amount,
          p_balance_date: balDate,
          p_description: `رصيد افتتاحي - ${employee.full_name}`,
          p_currency: "شيكل",
          p_contact_id: null,
          p_reference: obRef,
          p_replace_existing: true,
          p_idempotency_key: `${obRef}-${Date.now()}`,
        });
        const r = rpcRes as any;
        if (txErr || !r?.success) throw new Error(txErr?.message || r?.error || "فشل حفظ الرصيد الافتتاحي");
      }

      toast.success("تم حفظ الرصيد الافتتاحي ✅");
      onSaved();
    } catch (err: any) {
      toast.error(err.message || "خطأ في الحفظ");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <div className="mt-5 rounded-lg p-4" style={{ border: "1px solid hsl(var(--border))", background: "hsl(var(--muted))" }}>
      <h4 className="text-sm font-bold mb-3" style={{ color: "hsl(var(--foreground))" }}>💰 الرصيد الافتتاحي</h4>
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-xs w-16 shrink-0" style={{ color: "hsl(var(--muted-foreground))" }}>المبلغ</label>
          <Input
            type="number"
            value={amount || ""}
            onChange={e => setAmount(Number(e.target.value))}
            className="h-8 text-sm"
            placeholder="0.00"
            min={0}
            step={0.01}
          />
          <span className="text-xs shrink-0" style={{ color: "hsl(var(--muted-foreground))" }}>₪</span>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs w-16 shrink-0" style={{ color: "hsl(var(--muted-foreground))" }}>النوع</label>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
              <input
                type="radio"
                name={`ob-type-${employee.id}`}
                checked={balType === "debit"}
                onChange={() => setBalType("debit")}
                className="accent-primary"
              />
              <span className={balType === "debit" ? "font-bold text-emerald-600" : "text-muted-foreground"}>مدين</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer text-sm">
              <input
                type="radio"
                name={`ob-type-${employee.id}`}
                checked={balType === "credit"}
                onChange={() => setBalType("credit")}
                className="accent-primary"
              />
              <span className={balType === "credit" ? "font-bold text-red-600" : "text-muted-foreground"}>دائن</span>
            </label>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="text-xs w-16 shrink-0" style={{ color: "hsl(var(--muted-foreground))" }}>التاريخ</label>
          <Input
            type="date"
            value={balDate}
            onChange={e => setBalDate(e.target.value)}
            className="h-8 text-sm w-40"
          />
        </div>

        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5 mt-1">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          حفظ
        </Button>
      </div>

      {amount > 0 && (
        <p className="text-[10px] mt-2" style={{ color: "hsl(var(--muted-foreground))" }}>
          {balType === "debit" 
            ? "💡 مدين = الموظف مدين للشركة (سلفة قديمة)" 
            : "💡 دائن = الشركة مدينة للموظف (راتب متأخر)"}
        </p>
      )}
    </div>
  );
}
