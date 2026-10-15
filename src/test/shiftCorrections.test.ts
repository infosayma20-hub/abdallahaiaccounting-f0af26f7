import { describe, it, expect } from "vitest";
import { validateSplit } from "@/lib/pos/shiftCorrections";

describe("shift correction split rule", () => {
  it("rejects a split whose sum differs from the invoice total", () => {
    expect(validateSplit([{ option: "cash", amount: "30" }, { option: "card:1126", amount: "10" }], 50)).not.toBeNull();
  });
  it("accepts a split equal to the invoice total", () => {
    expect(validateSplit([{ option: "cash", amount: "30" }, { option: "card:1126", amount: "20" }], 50)).toBeNull();
  });
  it("requires at least two lines", () => {
    expect(validateSplit([{ option: "cash", amount: "50" }], 50)).not.toBeNull();
  });
  it("rejects a card line without an account", () => {
    expect(validateSplit([{ option: "cash", amount: "30" }, { option: "card:", amount: "20" }], 50)).not.toBeNull();
  });
});
