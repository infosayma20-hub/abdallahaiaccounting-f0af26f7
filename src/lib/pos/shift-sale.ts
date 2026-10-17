export type ShiftSaleLine = {
  product_id: string; name: string; unit: string; qty: number; unit_price: number;
  discount_pct: number; tax_rate: number; notes: string;
};
const cents = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export function shiftSaleLineTotals(line: ShiftSaleLine) {
  const subtotal = cents(line.qty * line.unit_price);
  const discount = cents(subtotal * line.discount_pct / 100);
  const total = cents(subtotal - discount);
  const tax = cents(total * line.tax_rate / (100 + line.tax_rate));
  return { subtotal, discount, total, tax, net: cents(total - tax) };
}
export function validateShiftSale(lines: ShiftSaleLine[], payment: "cash" | "credit", customerId: string, reason: string) {
  if (payment === "credit" && !customerId) return "اختر زبونًا معرّفًا للفاتورة الآجلة";
  if (reason.trim().length < 3) return "اكتب سبب الإضافة (3 أحرف على الأقل)";
  if (!lines.length || lines.length > 100) return "أضف أصناف الفاتورة";
  if (lines.some(l => !l.product_id || !Number.isFinite(l.qty) || l.qty <= 0 || !Number.isFinite(l.unit_price) || l.unit_price < 0 || !Number.isFinite(l.discount_pct) || l.discount_pct < 0 || l.discount_pct > 100)) return "تحقق من الأصناف والكميات والأسعار والخصم";
  if (lines.reduce((sum, l) => sum + shiftSaleLineTotals(l).total, 0) <= 0) return "إجمالي الفاتورة يجب أن يكون أكبر من صفر";
  return null;
}