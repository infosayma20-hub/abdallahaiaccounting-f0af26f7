import { describe, expect, it } from "vitest";
import { hasExplicitAdvanceEvidence, isCarriedOverJuneAdvance } from "../deductionAuditRules";

describe("HR deduction audit rules", () => {
  it("excludes a July 2 carried advance even when the employee surname is مخالفة", () => {
    expect(isCarriedOverJuneAdvance({
      movement_date: "2026-07-02",
      category: "advance",
      description: "سلف موظفين 2/7/2026 - حمزة مخالفة",
    })).toBe(true);
    expect(hasExplicitAdvanceEvidence("سند صرف", "سلف موظفين 2/7/2026", "حمزة مخالفة")).toBe(true);
  });

  it("excludes rows explicitly assigned to June payroll", () => {
    expect(isCarriedOverJuneAdvance({
      movement_date: "2026-07-09",
      salary_month: 6,
      salary_year: 2026,
      category: "advance",
    })).toBe(true);
  });

  it("keeps a real penalty and a later July advance", () => {
    expect(isCarriedOverJuneAdvance({
      movement_date: "2026-07-03",
      category: "penalty",
      description: "خصم بدل إجراء عقابي",
    })).toBe(false);
    expect(isCarriedOverJuneAdvance({
      movement_date: "2026-07-09",
      category: "advance",
      salary_month: 7,
      salary_year: 2026,
    })).toBe(false);
  });
});