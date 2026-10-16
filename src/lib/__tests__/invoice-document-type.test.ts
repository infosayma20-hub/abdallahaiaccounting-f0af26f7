import { describe, expect, it } from "vitest";
import { documentPartyType, isReturnDocument, validateReturnItems } from "../invoice-document-type";
describe("unified document routing", () => {
  it("routes both return types separately from invoices", () => {
    expect(isReturnDocument("sales_return")).toBe(true);
    expect(isReturnDocument("purchase_return")).toBe(true);
    expect(isReturnDocument("sales")).toBe(false);
    expect(isReturnDocument("purchase")).toBe(false);
    expect(documentPartyType("purchase_return")).toBe("purchase");
    expect(documentPartyType("sales_return")).toBe("sales");
  });
  it("allows free returns without an original invoice quantity", () => {
    expect(validateReturnItems([{ quantity: 3 }])).toBe(true);
  });
  it("rejects quantity beyond the linked invoice remaining quantity", () => {
    expect(validateReturnItems([{ quantity: 3, maxReturnableQty: 2 }])).toBe(false);
    expect(validateReturnItems([{ quantity: 2, maxReturnableQty: 2 }])).toBe(true);
  });
  it("does not silently ignore bonus stock quantities", () => {
    expect(validateReturnItems([{ quantity: 1, bonusQuantity: 1 }])).toBe(false);
  });
});