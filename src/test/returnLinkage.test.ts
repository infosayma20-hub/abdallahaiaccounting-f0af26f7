import { describe, expect, it } from "vitest";
import { classifyTransaction } from "@/lib/transactionLinkage";

describe("return document linkage", () => {
  it("opens sales returns as returns, not sales invoices", () => {
    expect(classifyTransaction({ transaction_type: "sales_return", reference: "SR-2026-0005", return_id: "sales-id" })).toMatchObject({ isLinked: true, docType: "return_sales", navigatePath: "/sales/returns/new?view=sales-id" });
  });
  it("opens purchase returns as returns, not purchase invoices", () => {
    expect(classifyTransaction({ transaction_type: "purchase_return", reference: "PR-2026-0003", return_id: "purchase-id" }).navigatePath).toBe("/purchases/returns/new?view=purchase-id");
  });
  it("protects a return reversal from independent manual editing", () => {
    expect(classifyTransaction({ transaction_type: "reverse_entry", reference: "SR-2026-0005", return_id: "sales-id" })).toMatchObject({ isLinked: true, docType: "return_sales" });
  });
  it("keeps ordinary purchase invoices on their existing path", () => {
    expect(classifyTransaction({ transaction_type: "purchase", reference: "INV-1" }).navigatePath).toBe("/invoices?search=INV-1");
  });
});