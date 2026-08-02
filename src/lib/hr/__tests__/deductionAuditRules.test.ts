import { describe, expect, it } from "vitest";
import { hasExplicitAdvanceEvidence, isCarriedOverJuneAdvance, isLoanDisbursement, isSalaryReturnEntry, isStructuredDeductionCategory } from "../deductionAuditRules";

describe("HR deduction audit rules", () => {
  it("excludes a July 2 carried advance even when the employee surname is مخالفة", () => {
    expect(isCarriedOverJuneAdvance({
      movement_date: "2026-07-02",
      category: "advance",
      description: "سلف موظفين 2/7/2026 - حمزة مخالفة",
    })).toBe(true);
    expect(hasExplicitAdvanceEvidence("سند صرف", "سلف موظفين 2/7/2026", "حمزة مخالفة")).toBe(true);
  });

  it("does not widen the exception beyond July 8 even when payroll metadata says June", () => {
    expect(isCarriedOverJuneAdvance({
      movement_date: "2026-07-09",
      salary_month: 6,
      salary_year: 2026,
      category: "advance",
    })).toBe(false);
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

  it("protects structured penalties from salary-text heuristics", () => {
    expect(isStructuredDeductionCategory("penalty")).toBe(true);
    expect(isStructuredDeductionCategory("advance")).toBe(true);
    expect(isStructuredDeductionCategory("other")).toBe(false);
  });
});
describe("salary returns and loan disbursements", () => {
  it("excludes salary-return vouchers even when tagged as advance", () => {
    expect(isSalaryReturnEntry("ارجاع راتب حمزة مخالفة وتم صرفة من رام الله")).toBe(true);
    expect(isSalaryReturnEntry("سلفة نقدية")).toBe(false);
  });

  it("excludes loan principal disbursement but keeps installments", () => {
    expect(isLoanDisbursement("قرض حسن - ادهم ياسين - مبلغ 1,800.00 ₪ - من الصندوق الرئيسي")).toBe(true);
    expect(isLoanDisbursement("قسط قرض حسن #1 — استحقاق 2026-08-01")).toBe(false);
    expect(isLoanDisbursement("قسط قرض حسن", "قرض حسن")).toBe(false);
  });
});
