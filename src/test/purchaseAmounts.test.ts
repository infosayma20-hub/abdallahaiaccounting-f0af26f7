import { describe, expect, it } from "vitest";
import { purchaseUnitPriceFromTotal } from "@/lib/pos/purchase-amounts";
describe("purchase total entry", () => {
  it("derives unit price from total", () => {
    expect(purchaseUnitPriceFromTotal("100", "4")).toBe("25");
  });
  it("recalculates on quantity change", () => {
    expect(purchaseUnitPriceFromTotal("100", "5")).toBe("20");
  });
  it("avoids premature rounding", () => {
    expect(Number((Number(purchaseUnitPriceFromTotal("100", "3")) * 3).toFixed(2))).toBe(100);
  });
  it("guards missing or zero quantity", () => {
    expect(purchaseUnitPriceFromTotal("100", "0")).toBe("");
    expect(purchaseUnitPriceFromTotal("100", "")).toBe("");
  });
  it("supports fractional quantity and clearing", () => {
    expect(purchaseUnitPriceFromTotal("30", "1.5")).toBe("20");
    expect(purchaseUnitPriceFromTotal("", "4")).toBe("");
  });
});
