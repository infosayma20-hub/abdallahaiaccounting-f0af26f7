import { describe, expect, it } from "vitest";
import { calculateReturnLine, calculateReturnSummary, isReturnsPilot, RETURNS_PILOT_OWNER } from "@/lib/returns";
describe("return calculations", () => {
  const item = { quantity: 2, unitPrice: 50, discount: 10, taxRate: 16, taxCategory: "taxable" as const };
  it("keeps return net and 16% VAT separate", () => {
    expect(calculateReturnLine(item, true)).toEqual({ gross: 100, discount: 10, storedDiscount: 10, net: 90, tax: 14.4, total: 104.4 });
  });
  it("converts percentage discount into the stored amount", () => {
    expect(calculateReturnLine({ ...item, discount: 20, discountType: "percent" }, true).storedDiscount).toBe(20);
  });
  it("extracts net from tax-inclusive 116 shekels", () => {
    expect(calculateReturnLine({ ...item, quantity: 1, unitPrice: 116, discount: 0 }, true, true)).toMatchObject({ net: 100, tax: 16, total: 116 });
  });
  it("does not tax exempt return lines", () => {
    expect(calculateReturnLine({ ...item, taxCategory: "exempt" }, true).tax).toBe(0);
  });
  it("preserves line VAT rates rather than applying 16% to every line", () => {
    expect(calculateReturnLine({ ...item, taxRate: 10 }, true).tax).toBe(9);
  });
  it("tax disabled does not add VAT", () => {
    expect(calculateReturnLine(item, false).total).toBe(90);
  });
  it("sums rounded line totals", () => {
    expect(calculateReturnSummary([item, item], true).total).toBe(208.8);
  });
  it("pilot never enables a different tenant", () => {
    expect(isReturnsPilot(RETURNS_PILOT_OWNER)).toBe(true);
    expect(isReturnsPilot("3358a87e-0a2e-4ad1-88c0-1e9ff8fda482")).toBe(false);
    expect(isReturnsPilot(null)).toBe(false);
  });
});