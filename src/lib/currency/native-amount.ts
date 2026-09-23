/**
 * Native (account-currency) amount of a ledger line — single source of truth.
 *
 * Every transaction stores `amount` in ILS (functional currency) and, for
 * foreign-currency lines, `foreign_amount` + `exchange_rate` + `currency`.
 *
 * For an account whose own currency is foreign (e.g. a USD cash box):
 *   - A line in the SAME currency with a foreign_amount moves the native balance.
 *   - An ILS-only line (FX revaluation, rounding) moves the ILS book value only.
 *   - A line carrying a DIFFERENT foreign currency is a posting error: it has
 *     no valid native effect and is flagged for review.
 *
 * This mirrors the DB function get_cash_box_native_balances / get_account_native_balances.
 */

export type CurrencyCode = "ILS" | "USD" | "JOD" | "EUR" | "EGP";

const MAP: Record<string, CurrencyCode> = {
  ILS: "ILS", "شيكل": "ILS", "₪": "ILS",
  USD: "USD", "دولار": "USD", "$": "USD",
  JOD: "JOD", "دينار": "JOD",
  EUR: "EUR", "يورو": "EUR",
  EGP: "EGP", "جنيه": "EGP",
};

export function toCurrencyCode(c?: string | null): CurrencyCode {
  if (!c) return "ILS";
  return MAP[c.trim()] || MAP[c.trim().toUpperCase()] || "ILS";
}

export const CURRENCY_LABEL: Record<CurrencyCode, string> = {
  ILS: "شيكل", USD: "دولار", JOD: "دينار", EUR: "يورو", EGP: "جنيه",
};

export type NativeKind = "native" | "ils_only" | "currency_mismatch";

export interface NativeLine {
  /** Amount in the account's own currency (0 for ILS-only / mismatch lines). */
  native: number;
  /** ILS book value of the line (always the stored `amount`). */
  ils: number;
  kind: NativeKind;
}

export function nativeAmountForAccount(
  tx: { amount: number | string | null; foreign_amount: number | string | null; currency: string | null },
  accountCurrency: CurrencyCode,
): NativeLine {
  const ils = Number(tx.amount) || 0;
  if (accountCurrency === "ILS") return { native: ils, ils, kind: "native" };
  const txCur = toCurrencyCode(tx.currency);
  const fx = tx.foreign_amount == null ? null : Number(tx.foreign_amount);
  if (txCur === accountCurrency && fx != null && Number.isFinite(fx)) {
    return { native: fx, ils, kind: "native" };
  }
  if (txCur !== "ILS" && txCur !== accountCurrency && fx != null) {
    return { native: 0, ils, kind: "currency_mismatch" };
  }
  return { native: 0, ils, kind: "ils_only" };
}
