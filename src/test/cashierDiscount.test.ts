import { describe, expect, it } from "vitest";
import { CASHIER_DISCOUNT_OWNER, cashierDiscountAllowed, discountWithinLimit } from "@/lib/pos/cashier-discount";

describe("cashier invoice discount permissions", () => {
  it("honors the enabled permission in Beit Alkul", () => {
    expect(cashierDiscountAllowed(CASHIER_DISCOUNT_OWNER, true, true)).toBe(true);
    expect(cashierDiscountAllowed(CASHIER_DISCOUNT_OWNER, false, true)).toBe(false);
    expect(cashierDiscountAllowed(CASHIER_DISCOUNT_OWNER, true, false)).toBe(false);
  });
  it("leaves other tenants on the manager approval path", () => {
    expect(cashierDiscountAllowed("another-company", true, true)).toBe(false);
    expect(cashierDiscountAllowed(null, true, true)).toBe(false);
  });
  it("enforces the cashier percentage limit for percentage and fixed discounts", () => {
    expect(discountWithinLimit(10, "percent", 200, 10)).toBe(true);
    expect(discountWithinLimit(11, "percent", 200, 10)).toBe(false);
    expect(discountWithinLimit(20, "fixed", 200, 10)).toBe(true);
    expect(discountWithinLimit(21, "fixed", 200, 10)).toBe(false);
    expect(discountWithinLimit(101, "percent", 200, 100)).toBe(false);
    expect(discountWithinLimit(1, "fixed", 0, 100)).toBe(false);
    expect(discountWithinLimit(Infinity, "fixed", 200, 100)).toBe(false);
  });
});