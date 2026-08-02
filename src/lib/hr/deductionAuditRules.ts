export const CARRIED_ADVANCE_FROM = "2026-07-01";
export const CARRIED_ADVANCE_TO = "2026-07-08";

const ADVANCE_TEXT = /سلفة|سلف|دفعة\s*(?:موظف|موظفين)?/;
const ADVANCE_SOURCE_TYPES = new Set(["hr_advance", "advance"]);

type DeductionMovement = {
  movement_date?: string | null;
  salary_month?: number | null;
  salary_year?: number | null;
  category?: string | null;
  source_type?: string | null;
  description?: string | null;
};

const STRUCTURED_DEDUCTION_CATEGORIES = new Set([
  "advance", "loan_installment", "penalty", "purchase", "food", "transport", "cash_shortage", "cash_surplus",
]);

export function isStructuredDeductionCategory(category?: string | null): boolean {
  return STRUCTURED_DEDUCTION_CATEGORIES.has(String(category || ""));
}

export function isAdvanceMovement(movement: DeductionMovement): boolean {
  return movement.category === "advance"
    || ADVANCE_SOURCE_TYPES.has(String(movement.source_type || ""))
    || ADVANCE_TEXT.test(String(movement.description || ""));
}

/** سلف الملكي المصروفة 1–8/7/2026 محسوبة على راتب شهر 6 ولا تُخصم مرة ثانية. */
export function isCarriedOverJuneAdvance(movement: DeductionMovement): boolean {
  if (!isAdvanceMovement(movement)) return false;
  const date = String(movement.movement_date || "").slice(0, 10);
  return date >= CARRIED_ADVANCE_FROM && date <= CARRIED_ADVANCE_TO;
}

/** أولوية تصنيف السلفة تمنع أسماء مثل «حمزة مخالفة» من تحويل السلفة إلى مخالفة. */
export function hasExplicitAdvanceEvidence(source: string, type: string, description: string, category?: string): boolean {
  if (category === "advance" || source === "سلفة") return true;
  return ADVANCE_TEXT.test(`${type} ${description}`);
}

/**
 * إرجاع/تكملة/فرق راتب = دفعة راتب وليست خصماً — حتى لو كان القيد مصنّفاً «سلفة».
 * مثال: «ارجاع راتب حمزة مخالفة وتم صرفة من رام الله».
 */
export function isSalaryReturnEntry(description?: string | null): boolean {
  const d = String(description || "");
  return /(تكملة|تكمله|مكملة|مكمله|فرق|فروقات|ارجاع|إرجاع|إسترجاع|استرجاع|رجيع)\s*رات[بة]/.test(d)
    || /رات[بة]\s*(مرتجع|مرجع)/.test(d);
}

/**
 * صرف أصل القرض الحسن ليس خصماً — الخصم يكون بالقسط الشهري فقط.
 * (source === "قرض حسن" يأتي من مولّد الأقساط loan_installments فيُستثنى من هذا المنع.)
 */
export function isLoanDisbursement(description?: string | null, source?: string | null): boolean {
  if (String(source || "") === "قرض حسن") return false;
  const d = String(description || "");
  if (!/قرض\s*حسن/.test(d)) return false;
  return !/قسط|أقساط|اقساط/.test(d);
}