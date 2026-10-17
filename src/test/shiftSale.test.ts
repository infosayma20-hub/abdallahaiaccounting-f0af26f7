import { describe, it, expect } from "vitest";
import { shiftSaleLineTotals, validateShiftSale, type ShiftSaleLine } from "@/lib/pos/shift-sale";
const line: ShiftSaleLine = { product_id: "P1", name: "صنف", unit: "قطعة", qty: 2, unit_price: 58, discount_pct: 0, tax_rate: 16, notes: "" };
describe("shift sales invoice", () => {
  it("cash sale permits an optional customer and preserves full total", () => {
    expect(validateShiftSale([line], "cash", "", "فاتورة منسية")).toBeNull();
    expect(shiftSaleLineTotals(line)).toEqual({ subtotal: 116, discount: 0, total: 116, tax: 16, net: 100 });
  });
  it("credit sale requires an identified customer", () => {
    expect(validateShiftSale([line], "credit", "", "فاتورة منسية")).not.toBeNull();
    expect(validateShiftSale([line], "credit", "C1", "فاتورة منسية")).toBeNull();
  });
  it("invoice lines must link to inventory products", () => {
    expect(validateShiftSale([{ ...line, product_id: "" }], "cash", "", "فاتورة منسية")).not.toBeNull();
  });
  it("line discount decreases the invoice and included VAT together", () => {
    expect(shiftSaleLineTotals({ ...line, discount_pct: 50 })).toEqual({ subtotal: 116, discount: 58, total: 58, tax: 8, net: 50 });
  });
});