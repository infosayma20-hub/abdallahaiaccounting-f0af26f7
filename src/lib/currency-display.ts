/**
 * Canonical currency display helpers.
 *
 * cheques.currency (and newer financial tables) store ISO-4217 codes
 * (ILS/USD/JOD/EUR/EGP — enforced by the cheques_currency_check constraint),
 * while some legacy form state still carries Arabic labels ("شيكل", "دينار"...).
 * These helpers normalize BOTH to a single display convention so no screen
 * ever sums different currencies into one meaningless number again.
 */

export const CURRENCY_SYMBOLS: Record<string, string> = {
  ILS: "₪",
  JOD: "د.أ",
  USD: "$",
  EUR: "€",
  EGP: "ج.م",
};

export const CURRENCY_LABELS: Record<string, string> = {
  ILS: "شيكل",
  JOD: "دينار",
  USD: "دولار",
  EUR: "يورو",
  EGP: "جنيه",
};

/** Legacy Arabic labels (and variants) → ISO code. */
const LEGACY_LABEL_TO_CODE: Record<string, string> = {
  "شيكل": "ILS",
  "شيقل": "ILS",
  "شيكلات": "ILS",
  "دينار": "JOD",
  "دولار": "USD",
  "يورو": "EUR",
  "جنيه": "EGP",
  NIS: "ILS",
};

/** Stable ordering for per-currency totals. */
const CURRENCY_ORDER = ["ILS", "JOD", "USD", "EUR", "EGP"];

/**
 * Lenient display-side normalizer: accepts ISO codes (any case) and legacy
 * Arabic labels, returns the ISO code. Never throws — unknown values are
 * returned upper-cased so they still display instead of breaking the screen.
 */
export function currencyCode(v: string | null | undefined): string {
  const raw = (v || "").trim();
  if (!raw) return "ILS";
  const upper = raw.toUpperCase();
  if (CURRENCY_SYMBOLS[upper]) return upper;
  if (LEGACY_LABEL_TO_CODE[raw]) return LEGACY_LABEL_TO_CODE[raw];
  return upper;
}

export function currencySymbol(v: string | null | undefined): string {
  return CURRENCY_SYMBOLS[currencyCode(v)] ?? currencyCode(v);
}

export function currencyLabel(v: string | null | undefined): string {
  return CURRENCY_LABELS[currencyCode(v)] ?? currencyCode(v);
}

/** "10,400 د.أ" */
export function fmtMoney(amount: number, currency: string | null | undefined): string {
  return `${amount.toLocaleString()} ${currencySymbol(currency)}`;
}

export interface CurrencyTotal {
  code: string;
  total: number;
}

/**
 * Sums amounts grouped per currency. Never mixes currencies into one number.
 */
export function sumByCurrency<T extends { amount: number; currency?: string | null }>(
  items: readonly T[],
): CurrencyTotal[] {
  const map = new Map<string, number>();
  for (const it of items) {
    const code = currencyCode(it.currency);
    map.set(code, (map.get(code) ?? 0) + (Number(it.amount) || 0));
  }
  return Array.from(map.entries())
    .map(([code, total]) => ({ code, total }))
    .sort((a, b) => {
      const ia = CURRENCY_ORDER.indexOf(a.code);
      const ib = CURRENCY_ORDER.indexOf(b.code);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
}

/** "1,534,376 ₪ • 499,200 د.أ" — for print footers and compact one-liners. */
export function fmtMoneyTotals<T extends { amount: number; currency?: string | null }>(
  items: readonly T[],
): string {
  const totals = sumByCurrency(items);
  if (totals.length === 0) return `0 ${CURRENCY_SYMBOLS.ILS}`;
  return totals.map((t) => fmtMoney(t.total, t.code)).join(" • ");
}
