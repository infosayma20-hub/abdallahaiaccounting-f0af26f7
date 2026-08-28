import { useEffect, useState } from "react";
import { Banknote, CreditCard, X, Plus, Split, Wand2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export type SplitTender = {
  method: "cash" | "card";
  amount: number; // ILS-equivalent amount (always)
  currency?: string; // ILS | USD | JOD ... — defaults to ILS
  exchange_rate?: number; // foreign_amount * rate = amount(ILS)
  foreign_amount?: number; // amount in the picked currency (for cash foreign)
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
  exchangeRates?: Record<string, number>;
  currencies?: Array<{ code: string; symbol: string; name: string }>;
}

/**
 * Mixed payment panel — cash + card combinations only (ILS only).
 * Backward compatible: parent component drives whether to use split tenders or single-tender flow.
 */
export default function SplitPaymentPanel({ total, tenders, setTenders, userId, defaultCardGlAccountCode, exchangeRates = {}, currencies = [] }: Props) {
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
    const next: SplitTender = { method, amount: amt, currency: "ILS", exchange_rate: 1, foreign_amount: amt };
    if (method === "card") {
      next.visa_gl_account_code = defaultCardGlAccountCode || cardOptions[0]?.gl_account_code || undefined;
    }
    setTenders([...tenders, next]);
  };

  const updateTender = (idx: number, patch: Partial<SplitTender>) => {
    setTenders(tenders.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };

  const changeTenderCurrency = (idx: number, currency: string) => {
    const t = tenders[idx];
    if (!t) return;
    if (currency === "ILS") {
      updateTender(idx, { currency: "ILS", exchange_rate: 1, foreign_amount: t.amount });
      return;
    }
    const rate = exchangeRates[currency] || 0;
    if (!rate) return;
    // Recompute foreign so ILS amount stays the same as before
    const foreign = Math.round((t.amount / rate) * 100) / 100;
    updateTender(idx, { currency, exchange_rate: rate, foreign_amount: foreign });
  };

  const updateForeignAmount = (idx: number, foreign: number) => {
    const t = tenders[idx];
    if (!t) return;
    const rate = t.exchange_rate || exchangeRates[t.currency || "ILS"] || 1;
    const ils = Math.round(foreign * rate * 100) / 100;
    updateTender(idx, { foreign_amount: Math.max(0, foreign), amount: Math.max(0, ils) });
  };

  /** Manual override of the exchange rate for this tender (to avoid fractions). */
  const updateTenderRate = (idx: number, rate: number) => {
    const t = tenders[idx];
    if (!t) return;
    const r = Math.max(0, rate);
    const foreign = Number(t.foreign_amount || 0);
    updateTender(idx, { exchange_rate: r, amount: Math.round(foreign * r * 100) / 100 });
  };

  /** Solve the rate so this foreign tender exactly absorbs the remaining balance. */
  const fitRateToRemaining = (idx: number) => {
    const t = tenders[idx];
    if (!t) return;
    const foreign = Number(t.foreign_amount || 0);
    if (foreign <= 0) return;
    const targetIls = Math.round((t.amount + remaining) * 100) / 100;
    if (targetIls <= 0) return;
    const newRate = Math.round((targetIls / foreign) * 10000) / 10000;
    updateTender(idx, { exchange_rate: newRate, amount: Math.round(foreign * newRate * 100) / 100 });
  };

  const removeTender = (idx: number) => setTenders(tenders.filter((_, i) => i !== idx));

  const fillRemainingCash = () => {
    if (remaining <= 0) return;
    setTenders([...tenders, { method: "cash", amount: remaining, currency: "ILS", exchange_rate: 1, foreign_amount: remaining }]);
  };


  /** Top up an existing cash tender so its ILS-equivalent absorbs the remaining balance. */
  const fillRemainingIntoRow = (idx: number) => {
    const t = tenders[idx];
    if (!t) return;
    const extraIls = remaining; // may be negative → subtract
    const newIls = Math.max(0, Math.round((t.amount + extraIls) * 100) / 100);
    if (!t.currency || t.currency === "ILS") {
      updateTender(idx, { amount: newIls, foreign_amount: newIls, currency: "ILS", exchange_rate: 1 });
      return;
    }
    const rate = t.exchange_rate || exchangeRates[t.currency] || 0;
    if (!rate) return;
    const newForeign = Math.max(0, Math.round((newIls / rate) * 100) / 100);
    updateTender(idx, { foreign_amount: newForeign, amount: Math.round(newForeign * rate * 100) / 100 });
  };

  return (
    <div className="mx-4 mt-3" style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 12 }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Split className="h-4 w-4" style={{ color: "#7c3aed" }} />
          <span className="text-[13px] font-semibold" style={{ color: "#111827" }}>دفع مختلط (نقد + فيزا)</span>
        </div>
        <div className="text-[11px]" style={{ color: "#6b7280" }}>متعدد العملات (فيزا شيكل فقط)</div>
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
          <div key={idx} className="flex flex-col gap-2" style={{ background: "#f9fafb", borderRadius: 8, padding: 8 }}>
            <div className="flex items-center gap-2">
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

            {t.method === "cash" && t.currency && t.currency !== "ILS" ? (
              <input
                type="number"
                step="0.01"
                min="0"
                value={t.foreign_amount || ""}
                onChange={(e) => updateForeignAmount(idx, parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="flex-1 text-right tabular-nums text-[14px] font-semibold"
                style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 8px", color: "#111827" }}
              />
            ) : (
              <input
                type="number"
                step="0.01"
                min="0"
                value={t.amount || ""}
                onChange={(e) => {
                  const v = Math.max(0, parseFloat(e.target.value) || 0);
                  updateTender(idx, { amount: v, foreign_amount: v, currency: "ILS", exchange_rate: 1 });
                }}
                placeholder="0.00"
                className="flex-1 text-right tabular-nums text-[14px] font-semibold"
                style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: "6px 8px", color: "#111827" }}
              />
            )}

            {t.method === "cash" && currencies.length > 0 && (
              <select
                value={t.currency || "ILS"}
                onChange={(e) => changeTenderCurrency(idx, e.target.value)}
                className="text-[11px]"
                style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 6, padding: "4px 6px", maxWidth: 90 }}
              >
                <option value="ILS">شيكل</option>
                {currencies.filter(c => c.code !== "ILS").map((c) => (
                  <option key={c.code} value={c.code} disabled={!exchangeRates[c.code]}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

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
            {t.method === "cash" && Math.abs(remaining) > 0.01 && (
              <button
                onClick={() => fillRemainingIntoRow(idx)}
                className="shrink-0 rounded p-1 transition-colors"
                style={{ color: "#a16207", background: "transparent" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "#fef3c7")}
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                aria-label="املأ الباقي في هذا الصف"
                title={`املأ الباقي (${remaining > 0 ? "+" : ""}₪${remaining.toFixed(2)}) في هذا الصف`}
              >
                <Wand2 className="h-4 w-4" />
              </button>
            )}
            </div>
            {t.method === "cash" && t.currency && t.currency !== "ILS" && (
              <div className="flex items-center justify-between text-[11px] px-1" style={{ color: "#6b7280" }}>
                <span>سعر الصرف: {(t.exchange_rate || 0).toFixed(4)}</span>
                <span className="tabular-nums">≈ ₪{(t.amount || 0).toFixed(2)}</span>
              </div>
            )}
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