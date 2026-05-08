/**
 * P3 — Cross-report reconciliation helpers (read-only).
 *
 * No DB writes. No UI. Pure number-comparison utilities used by
 * src/lib/reports/integrity-report.ts and (future) admin debug screens.
 */

export const DEFAULT_TOLERANCE = 0.01; // ILS — accept rounding noise <1 agora

export type ReconStatus = "pass" | "warn" | "fail";

export interface ReconResult {
  check: string;
  status: ReconStatus;
  expected: number;
  actual: number;
  diff: number;
  note?: string;
}

const round = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Format a signed diff for console / debug logs. */
export function formatDiff(diff: number): string {
  const r = round(diff);
  if (r === 0) return "0.00";
  return (r > 0 ? "+" : "") + r.toFixed(2);
}

/** Classify a diff into pass / warn / fail using a soft + hard tolerance. */
export function classify(
  diff: number,
  softTolerance = DEFAULT_TOLERANCE,
  hardTolerance = 1.0,
): ReconStatus {
  const a = Math.abs(diff);
  if (a <= softTolerance) return "pass";
  if (a <= hardTolerance) return "warn";
  return "fail";
}

/** Compare two scalar totals (e.g. report total vs. GL total). */
export function compareTotals(
  check: string,
  expected: number,
  actual: number,
  tolerance = DEFAULT_TOLERANCE,
): ReconResult {
  const e = round(expected);
  const a = round(actual);
  const diff = round(a - e);
  return { check, status: classify(diff, tolerance), expected: e, actual: a, diff };
}

/** Compare two maps keyed by account code; returns per-key diffs + roll-up. */
export function compareByAccount(
  check: string,
  expectedByCode: Record<string, number>,
  actualByCode: Record<string, number>,
  tolerance = DEFAULT_TOLERANCE,
): { roll: ReconResult; perAccount: ReconResult[] } {
  const codes = new Set([...Object.keys(expectedByCode), ...Object.keys(actualByCode)]);
  const perAccount: ReconResult[] = [];
  let totE = 0;
  let totA = 0;
  codes.forEach(code => {
    const e = round(expectedByCode[code] || 0);
    const a = round(actualByCode[code] || 0);
    totE += e;
    totA += a;
    perAccount.push(compareTotals(`${check}:${code}`, e, a, tolerance));
  });
  return {
    roll: compareTotals(check, totE, totA, tolerance),
    perAccount: perAccount.filter(r => r.status !== "pass"),
  };
}

/** Inventory: live valuation (Σ qty*cost) vs GL inventory account balance. */
export function compareInventoryValue(
  liveValuation: number,
  glInventoryBalance: number,
  tolerance = 1.0,
): ReconResult {
  return compareTotals("inventory_value", glInventoryBalance, liveValuation, tolerance);
}

/** VAT: GL output/input vs tax_ledger output/input totals. */
export function compareVatTotals(
  glOutput: number,
  tlOutput: number,
  glInput: number,
  tlInput: number,
  tolerance = DEFAULT_TOLERANCE,
): { output: ReconResult; input: ReconResult } {
  return {
    output: compareTotals("vat_output", tlOutput, glOutput, tolerance),
    input: compareTotals("vat_input", tlInput, glInput, tolerance),
  };
}

/** AR / AP: Σ subsidiary balances vs control account GL balance. */
export function compareARAP(
  side: "ar" | "ap",
  subsidiaryTotal: number,
  glControlBalance: number,
  tolerance = DEFAULT_TOLERANCE,
): ReconResult {
  return compareTotals(side === "ar" ? "ar_control" : "ap_control", glControlBalance, subsidiaryTotal, tolerance);
}

/** Pretty-print a list of results to a single multi-line string. */
export function summarize(results: ReconResult[]): string {
  return results
    .map(r => `[${r.status.toUpperCase()}] ${r.check}  expected=${r.expected.toFixed(2)}  actual=${r.actual.toFixed(2)}  diff=${formatDiff(r.diff)}${r.note ? "  (" + r.note + ")" : ""}`)
    .join("\n");
}