import { useCallback } from "react";
import { useBaseCurrency } from "./useBaseCurrency";

/**
 * Unified money formatter tied to the tenant's base currency.
 *
 * Usage:
 *   const fmt = useBaseCurrencyFormat();
 *   fmt(1234.5)        // "₪1,234.50"
 *   fmt(1234.5, { showSymbol: false }) // "1,234.50"
 *
 * Behavior for existing tenants (all ILS) is identical to current
 * hard-coded "₪" formatting used across the app.
 */
export function useBaseCurrencyFormat() {
  const { data: base } = useBaseCurrency();
  const symbol = base?.symbol ?? "₪";
  const decimals = base?.decimals ?? 2;

  return useCallback(
    (
      value: number | string | null | undefined,
      opts: { showSymbol?: boolean; decimals?: number } = {}
    ) => {
      const n = Number(value ?? 0);
      if (!isFinite(n)) return opts.showSymbol === false ? "0.00" : `${symbol}0.00`;
      const d = opts.decimals ?? decimals;
      const formatted = n.toLocaleString("en-US", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      });
      return opts.showSymbol === false ? formatted : `${symbol}${formatted}`;
    },
    [symbol, decimals]
  );
}