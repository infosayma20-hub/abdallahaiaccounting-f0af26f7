import { useEffect, useState } from "react";
import { Banknote, CreditCard, X, Plus, Split } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type SplitTender = {
  method: "cash" | "card";
  amount: number;
  visa_gl_account_code?: string;
  reference?: string;
};

type BankAccountOption = {
  id: string;
  name: string;
  bank_name: string;
  gl_account_code: string;
};

interface Props {
  total: number;
  tenders: SplitTender[];
  setTenders: (t: SplitTender[]) => void;
  userId: string | null | undefined;
  defaultCardGlAccountCode: string | null;
}

/**
 * Mixed payment panel — cash + card combinations only (ILS only).
 * Backward compatible: parent component drives whether to use split tenders or single-tender flow.
 */
export default function SplitPaymentPanel({ total, tenders, setTenders, userId, defaultCardGlAccountCode }: Props) {
  const [cardOptions, setCardOptions] = useState<BankAccountOption[]>([]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data } = await supabase
        .from("bank_accounts" as any)
        .select("id, name, bank_name, gl_account_code, currency, is_active")
        .eq("user_id", userId)
        .eq("is_active", true)
        .eq("currency", "ILS");
      const list = ((data as any[]) || [])
        .filter((b) => b.gl_account_code)
        .map((b) => ({ id: b.id, name: b.name, bank_name: b.bank_name, gl_account_code: b.gl_account_code }));
      setCardOptions(list);
    })();
  }, [userId]);

  const paid = tenders.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const remaining = Math.round((total - paid) * 100) / 100;

  const addTender = (method: "cash" | "card") => {
    const amt = Math.max(0, remaining);
    const next: SplitTender = { method, amount: amt };
    if (method === "card") {
      next.visa_gl_account_code = defaultCardGlAccountCode || cardOptions[0]?.gl_account_code || undefined;
    }
    setTenders([...tenders, next]);
  };

  const updateTender = (idx: number, patch: Partial<SplitTender>) => {
    setTenders(tenders.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const removeTender = (idx: number) => setTenders(tenders.filter((_, i) => i !== idx));

  const fillRemainingCash = () => {
    if (remaining <= 0) return;
    setTenders([...tenders, { method: "cash", amount: remaining }]);
  };

  return (
    <div className="mx-4 mt-3" style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Split className="h-4 w-4" style={{ color: "#7c3aed" }} />
          <span className="text-[13px] font-semibold" style={{ color: "#111827" }}>دفع مختلط (نقد + فيزا)</span>
        </div>
        <div className="text-[11px]" style={{ color: "#6b7280" }}>شيكل فقط</div>
      </div>

      {/* Balance bar */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div style={{ background: "#f9fafb", borderRadius: 8, padding: "8px 10px" }}>
          <div className="text-[10px]" style={{ color: "#6b7280" }}>الإجمالي</div>
          <div className="text-[14px] font-bold tabular-nums" style={{ color: "#111827" }}>₪{total.toFixed(2)}</div>
        </div>
        <div style={{ background: "#f0f9ff", borderRadius: 8, padding: "8px 10px" }}>
          <div className="text-[10px]" style={{ color: "#0369a1" }}>المدفوع</div>
          <div className="text-[14px] font-bold tabular-nums" style={{ color: "#0369a1" }}>₪{paid.toFixed(2)}</div>
        </div>
        <div style={{ background: remaining === 0 ? "#f0fdf4" : remaining > 0 ? "#fef2f2" : "#fffbeb", borderRadius: 8, padding: "8px 10px" }}>
          <div className="text-[10px]" style={{ color: remaining === 0 ? "#15803d" : remaining > 0 ? "#dc2626" : "#a16207" }}>
            {remaining === 0 ? "متوازن ✓" : remaining > 0 ? "متبقي" : "زيادة"}
          </div>
          <div className="text-[14px] font-bold tabular-nums" style={{ color: remaining === 0 ? "#15803d" : remaining > 0 ? "#dc2626" : "#a16207" }}>
            ₪{Math.abs(remaining).toFixed(2)}
          </div>
        </div>
      </div>

      {/* Tenders list */}
      <div className="space-y-2 mb-3">
        {tenders.length === 0 && (
          <div className="text-center text-[12px] py-3" style={{ color: "#9ca3af" }}>
            أضف دفعة بالأسفل (نقد أو فيزا)
          </div>
        )}
        {tenders.map((t, idx) => (
          <div key={idx} className="flex items-center gap-2" style={{ background: "#f9fafb", borderRadius: 8, padding: 8 }}>
            <div className="flex items-center gap-1.5 shrink-0" style={{ width: 70 }}>
              {t.method === "cash" ? (
                <Banknote className="h-4 w-4" style={{ color: "#16a34a" }} />
              ) : (
                <CreditCard className="h-4 w-4" style={{ color: "#3b82f6" }} />
              )}
              <span className="text-[12px] font-semibold" style={{ color: t.method === "cash" ? "#16a34a" : "#3b82f6" }}>
                {t.method === "cash" ? "نقد" : "فيزا"}
              </span>
            </div>

            <input
              type="number"
              step="0.01"
              min="0"
              value={t.amount || ""}
              onChange={(e) => updateTender(idx, { amount: Math.max(0, parseFloat(e.target.value) || 0) })}
              placeholder="0.00"
              className="flex-1 text-right tabular-nums text-[14px] font-semibold"
              style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 8px", color: "#111827" }}
            />

            {t.method === "card" && cardOptions.length > 1 && (
              <select
                value={t.visa_gl_account_code || ""}
                onChange={(e) => updateTender(idx, { visa_gl_account_code: e.target.value || undefined })}
                className="text-[11px]"
                style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 6px", maxWidth: 130 }}
              >
                {cardOptions.map((c) => (
                  <option key={c.id} value={c.gl_account_code}>
                    {c.bank_name} - {c.name}
                  </option>
                ))}
              </select>
            )}

            <button
              onClick={() => removeTender(idx)}
              className="shrink-0 rounded p-1 transition-colors"
              style={{ color: "#dc2626", background: "transparent" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#fee2e2")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
              aria-label="حذف الدفعة"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Add tender buttons */}
      <div className="grid grid-cols-3 gap-2">
        <button
          onClick={() => addTender("cash")}
          className="flex items-center justify-center gap-1.5 text-[12px] font-semibold transition-all"
          style={{ background: "#f0fdf4", border: "1.5px solid #86efac", color: "#15803d", borderRadius: 8, padding: "8px 10px" }}
        >
          <Plus className="h-3.5 w-3.5" />
          <Banknote className="h-3.5 w-3.5" />
          نقد
        </button>
        <button
          onClick={() => addTender("card")}
          className="flex items-center justify-center gap-1.5 text-[12px] font-semibold transition-all"
          style={{ background: "#eff6ff", border: "1.5px solid #93c5fd", color: "#1d4ed8", borderRadius: 8, padding: "8px 10px" }}
        >
          <Plus className="h-3.5 w-3.5" />
          <CreditCard className="h-3.5 w-3.5" />
          فيزا
        </button>
        <button
          onClick={fillRemainingCash}
          disabled={remaining <= 0}
          className="flex items-center justify-center gap-1 text-[12px] font-semibold transition-all disabled:opacity-40"
          style={{ background: "#fffbeb", border: "1.5px solid #fcd34d", color: "#a16207", borderRadius: 8, padding: "8px 10px" }}
        >
          + متبقي نقد
        </button>
      </div>
    </div>
  );
}