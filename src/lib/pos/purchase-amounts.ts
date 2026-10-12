/** Preserve division precision until the purchase RPC rounds the final total. */
export function purchaseUnitPriceFromTotal(total: string, quantity: string): string {
  const amount = Number(total);
  const qty = Number(quantity);
  if (total.trim() === "" || !Number.isFinite(amount) || amount < 0 || !Number.isFinite(qty) || qty <= 0) return "";
  return String(amount / qty);
}
