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