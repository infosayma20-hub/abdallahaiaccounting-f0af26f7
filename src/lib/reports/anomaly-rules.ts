/**
 * P5 — Anomaly detection rules (read-only, pure functions).
 * No DB calls; consumes already-loaded report rows and returns flagged rows
 * with a reason code. UI layers can highlight or summarise.
 */

export type AnomalyCode =
  | "negative_margin"
  | "inventory_mismatch"
  | "unbalanced_account"
  | "tax_variance"
  | "inactive_with_stock"
  | "abnormal_balance";

export interface AnomalyHit<T = any> {
  code: AnomalyCode;
  row: T;
  message: string;
}

const N = (v: any) => Number(v) || 0;

/** P&L / sales-by-product: profit < 0 with revenue > 0. */
export function flagNegativeMargin<T extends Record<string, any>>(rows: T[], opts?: { revenueKey?: string; profitKey?: string }): AnomalyHit<T>[] {
  const r = opts?.revenueKey || "revenue";
  const p = opts?.profitKey || "profit";
  return rows
    .filter((row) => N(row[r]) > 0 && N(row[p]) < 0)
    .map((row) => ({ code: "negative_margin" as const, row, message: "هامش ربح سالب على إيراد موجب" }));
}

/** Inventory reconciliation: live_qty − derived_qty ≠ 0. */
export function flagInventoryMismatch<T extends Record<string, any>>(rows: T[], tolerance = 0.001): AnomalyHit<T>[] {
  return rows
    .filter((row) => Math.abs(N(row.diff)) >= tolerance)
    .map((row) => ({ code: "inventory_mismatch" as const, row, message: `فرق مخزون ${N(row.diff)}` }));
}

/** Trial balance: |debit−credit| > tolerance per account. */
export function flagUnbalancedAccount<T extends Record<string, any>>(rows: T[], tolerance = 0.01): AnomalyHit<T>[] {
  return rows
    .filter((row) => Math.abs(N(row.debit) - N(row.credit) - N(row.balance)) > tolerance && N(row.balance) === 0)
    .map((row) => ({ code: "unbalanced_account" as const, row, message: "حركة غير متزنة على الحساب" }));
}

/** VAT periodic: declared vs ledger variance. */
export function flagTaxVariance<T extends Record<string, any>>(rows: T[], tolerance = 0.5): AnomalyHit<T>[] {
  return rows
    .filter((row) => Math.abs(N(row.declared) - N(row.ledger)) > tolerance)
    .map((row) => ({ code: "tax_variance" as const, row, message: "فرق ضريبي بين المُصرَّح والدفتر" }));
}

/** Inactive products with stock: qty > 0 and last_movement older than `days`. */
export function flagInactiveWithStock<T extends Record<string, any>>(rows: T[], days = 180): AnomalyHit<T>[] {
  const cutoff = Date.now() - days * 86400000;
  return rows
    .filter((row) => N(row.qty ?? row.live_qty ?? row.quantity) > 0 && row.last_movement_at && new Date(row.last_movement_at).getTime() < cutoff)
    .map((row) => ({ code: "inactive_with_stock" as const, row, message: `بدون حركة منذ > ${days} يوم` }));
}

/** Customers/suppliers: balance opposite to expected sign. */
export function flagAbnormalBalance<T extends Record<string, any>>(rows: T[], expected: "debit" | "credit"): AnomalyHit<T>[] {
  return rows
    .filter((row) => {
      const bal = N(row.balance);
      if (expected === "debit") return bal < 0;
      return bal > 0;
    })
    .map((row) => ({ code: "abnormal_balance" as const, row, message: "رصيد بعكس الطبيعة المتوقعة" }));
}

/** Aggregate helper: count anomalies by code. */
export function summarizeAnomalies(hits: AnomalyHit[]): Record<AnomalyCode, number> {
  const out = {
    negative_margin: 0,
    inventory_mismatch: 0,
    unbalanced_account: 0,
    tax_variance: 0,
    inactive_with_stock: 0,
    abnormal_balance: 0,
  } as Record<AnomalyCode, number>;
  hits.forEach((h) => { out[h.code] = (out[h.code] || 0) + 1; });
  return out;
}