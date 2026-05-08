import { supabase } from "@/integrations/supabase/client";

/**
 * P5 — Executive KPIs.
 * Read-only aggregator over canonical sources:
 *   - GL (transactions) for cash, AR, AP, VAT, revenue, COGS
 *   - products.quantity * buy_price for live inventory value
 *
 * No accounting writes. No schema changes. Uses the same conventions as
 * src/lib/reports/integrity-report.ts (hardcoded base codes 1110, 1120,
 * 1130, 2110, 2190, 4100, 5100). If the tenant has remapped these accounts,
 * upgrade the loader to read account_mappings (tracked in tech-debt).
 */

export interface ExecutiveKPIs {
  revenue: number;          // 4100 credit total within range
  cogs: number;             // 5100 debit total within range
  grossProfit: number;      // revenue − cogs
  netProfit: number;        // revenue − all expenses (5xxx)
  inventoryValue: number;   // Σ max(qty,0) × buy_price live
  ar: number;               // 1130 net debit (live, not range)
  ap: number;               // 2110 net credit (live)
  vatPayable: number;       // 2190 net credit (live)
  cashPosition: number;     // 1110 + 1120 net debit (live)
  generatedAt: string;
}

const N = (v: any) => Number(v) || 0;

function sumByCode(txs: any[], code: string, side: "debit" | "credit", from?: string, to?: string) {
  return txs
    .filter((t) => String(t.account_code || "").startsWith(code))
    .filter((t) => !from || (t.transaction_date && t.transaction_date >= from))
    .filter((t) => !to || (t.transaction_date && t.transaction_date <= to))
    .reduce((s, t) => s + N(t[side]), 0);
}

function netByCode(txs: any[], code: string, nature: "debit" | "credit") {
  const d = sumByCode(txs, code, "debit");
  const c = sumByCode(txs, code, "credit");
  return nature === "debit" ? d - c : c - d;
}

export async function loadExecutiveKPIs(uid: string, opts?: { from?: string; to?: string }): Promise<ExecutiveKPIs> {
  const from = opts?.from;
  const to = opts?.to;

  const [{ data: txs }, { data: prods }] = await Promise.all([
    supabase
      .from("transactions")
      .select("account_code, debit, credit, transaction_date, is_deleted")
      .eq("user_id", uid)
      .eq("is_deleted", false),
    supabase
      .from("products")
      .select("quantity, buy_price")
      .eq("user_id", uid),
  ]);

  const t = (txs || []) as any[];
  const revenue = sumByCode(t, "4", "credit", from, to) - sumByCode(t, "4", "debit", from, to);
  const cogs = sumByCode(t, "5100", "debit", from, to) - sumByCode(t, "5100", "credit", from, to);
  const expensesAll = sumByCode(t, "5", "debit", from, to) - sumByCode(t, "5", "credit", from, to);

  const inventoryValue = (prods || []).reduce(
    (s: number, p: any) => s + Math.max(0, N(p.quantity)) * N(p.buy_price),
    0,
  );

  return {
    revenue,
    cogs,
    grossProfit: revenue - cogs,
    netProfit: revenue - expensesAll,
    inventoryValue,
    ar: netByCode(t, "1130", "debit"),
    ap: netByCode(t, "2110", "credit"),
    vatPayable: netByCode(t, "2190", "credit"),
    cashPosition: netByCode(t, "1110", "debit") + netByCode(t, "1120", "debit"),
    generatedAt: new Date().toISOString(),
  };
}