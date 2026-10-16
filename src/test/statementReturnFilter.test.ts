import { describe, expect, it } from "vitest";
import { txTypeMatchesFilter } from "@/lib/account-statement/transactionTypeFilter";
describe("statement return isolation", () => {
  it("does not mix sales returns with sales invoices", () => {
    expect(txTypeMatchesFilter("sales_return", "sale")).toBe(false);
    expect(txTypeMatchesFilter("sale", "sale")).toBe(true);
  });
  it("does not mix purchase returns with purchase invoices", () => {
    expect(txTypeMatchesFilter("purchase_return", "purchase")).toBe(false);
    expect(txTypeMatchesFilter("purchase", "purchase")).toBe(true);
  });
  it("keeps normal and POS returns visible in all and returns filters", () => {
    for (const type of ["sales_return", "purchase_return", "pos_return", "pos_return_vat"]) {
      expect(txTypeMatchesFilter(type, "all")).toBe(true);
      expect(txTypeMatchesFilter(type, "return")).toBe(true);
    }
    expect(txTypeMatchesFilter("sale", "return")).toBe(false);
  });
});