/**
 * Pure functions for POS shift-close cash reconciliation.
 *
 * Multi-currency contract for `pos_payments` (set by `complete_pos_order`):
 *   - `amount`          : invoice total — ALWAYS stored in ILS.
 *   - `tendered`        : cash given by customer — ALWAYS stored in ILS
 *                         (foreign tender × exchange_rate when paying with FX).
 *   - `currency`        : the currency the customer chose to pay in (ILS/USD/JOD…).
 *   - `exchange_rate`   : foreign-to-ILS rate at the moment of sale.
 *   - `change_amount`   : returned to the customer — stored in the unit of
 *                         `change_currency` (NOT always ILS).
 *   - `change_currency` : the currency in which change was actually handed back.
 *
 * Cash drawer impact per currency:
 *
 *   expectedILS = openingILS
 *               + Σ payments (method=cash, currency=ILS).amount
 *               − Σ change_amount where change_currency = ILS  (change given in shekels
 *                 for foreign-currency invoices)
 *               − cash expenses (ILS)
 *               − cash purchases (ILS)
 *               − cash returns (ILS)
 *
 *   expected[CUR] = Σ (tendered_ILS / exchange_rate) where method=cash, currency=CUR
 *                 − Σ change_amount where change_currency = CUR
 *                 − cash returns (CUR)
 *
 * Total variance is reported in ILS-equivalent (variance(CUR) × rate(CUR))
 * for headline display only — never replaces per-currency variances.
 */

export type Currency = "ILS" | "USD" | "JOD" | string;

export interface PaymentRow {
  payment_method: string | null;
  amount: number | null;          // ILS
  currency: Currency | null;
  tendered: number | null;        // ILS
  change_amount: number | null;   // in change_currency unit
  change_currency: Currency | null;
  exchange_rate: number | null;   // foreign→ILS
}

export interface ReturnRow {
  currency: Currency;             // refund currency
  cashAmount: number;             // in `currency` unit, only when refund is cash
}

export interface CashReconInput {
  openingILS: number;
  payments: PaymentRow[];         // SALES payments only (not returns)
  returns: ReturnRow[];           // cash refunds only
  cashExpensesILS: number;        // pos_expenses (cash) — currently ILS only
  cashPurchasesILS: number;       // pos_purchases (cash) — currently ILS only
}

export interface PerCurrencyExpected {
  ILS: number;
  USD: number;
  JOD: number;
  [k: string]: number;
}

export interface ShiftCloseResult {
  expected: PerCurrencyExpected;
  // Breakdown for UI / audit
  ilsCashSales: number;
  foreignTenderedByCurrency: Record<string, number>;     // in foreign units
  foreignChangeByCurrency: Record<string, number>;       // in change_currency units
  cashReturnsByCurrency: Record<string, number>;
}

function isCash(method: string | null | undefined): boolean {
  return (method || "cash") === "cash";
}

export function computeExpectedCashPerCurrency(input: CashReconInput): ShiftCloseResult {
  const foreignTendered: Record<string, number> = { USD: 0, JOD: 0 };
  const foreignChange: Record<string, number> = { ILS: 0, USD: 0, JOD: 0 };
  let ilsCashSales = 0;

  for (const p of input.payments) {
    if (!isCash(p.payment_method)) continue;
    const cur = (p.currency || "ILS") as Currency;
    if (cur === "ILS") {
      ilsCashSales += Number(p.amount || 0);
      // ILS sales never produce non-ILS change here.
      continue;
    }
    // Foreign cash sale
    const rate = Number(p.exchange_rate || 0);
    const tenderedILS = Number(p.tendered || 0);
    const tenderedForeign = rate > 0 ? tenderedILS / rate : 0;
    foreignTendered[cur] = (foreignTendered[cur] || 0) + tenderedForeign;

    const chgCur = (p.change_currency || "ILS") as Currency;
    const chgAmount = Number(p.change_amount || 0);
    if (chgAmount > 0) {
      foreignChange[chgCur] = (foreignChange[chgCur] || 0) + chgAmount;
    }
  }

  const cashReturns: Record<string, number> = { ILS: 0, USD: 0, JOD: 0 };
  for (const r of input.returns) {
    cashReturns[r.currency] = (cashReturns[r.currency] || 0) + Number(r.cashAmount || 0);
  }

  const expected: PerCurrencyExpected = {
    ILS:
      input.openingILS
      + ilsCashSales
      - (foreignChange.ILS || 0)
      - input.cashExpensesILS
      - input.cashPurchasesILS
      - (cashReturns.ILS || 0),
    USD:
      (foreignTendered.USD || 0)
      - (foreignChange.USD || 0)
      - (cashReturns.USD || 0),
    JOD:
      (foreignTendered.JOD || 0)
      - (foreignChange.JOD || 0)
      - (cashReturns.JOD || 0),
  };

  return {
    expected,
    ilsCashSales,
    foreignTenderedByCurrency: foreignTendered,
    foreignChangeByCurrency: foreignChange,
    cashReturnsByCurrency: cashReturns,
  };
}

export interface VarianceResult {
  perCurrency: Record<string, { expected: number; actual: number; variance: number }>;
  /** Sum of variances converted to ILS using `rates` — for report headline only. */
  totalVarianceILS: number;
}

export function computeVariance(
  expected: PerCurrencyExpected,
  actual: Record<string, number>,
  rates: Record<string, number>,
): VarianceResult {
  const currencies = new Set<string>([
    ...Object.keys(expected),
    ...Object.keys(actual),
  ]);
  const perCurrency: VarianceResult["perCurrency"] = {};
  let totalVarianceILS = 0;
  for (const cur of currencies) {
    const e = Number(expected[cur] || 0);
    const a = Number(actual[cur] || 0);
    const v = a - e;
    perCurrency[cur] = { expected: e, actual: a, variance: v };
    const rate = cur === "ILS" ? 1 : Number(rates[cur] || 0);
    totalVarianceILS += v * rate;
  }
  return { perCurrency, totalVarianceILS };
}