/**
 * Helpers shared by employee Payslips + Financial Summary screens
 * AND by the loan eligibility evaluator used in EmployeeFormsTab.
 */

export function formatCurrency(v: number | string | null | undefined, currency = "₪"): string {
  const n = Number(v);
  if (!isFinite(n)) return `${currency}0.00`;
  return `${currency}${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function safeNum(v: any): number {
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

export function monthsBetween(from?: string | null, to: Date = new Date()): number | null {
  if (!from) return null;
  const d = new Date(from);
  if (isNaN(d.getTime())) return null;
  const months = (to.getFullYear() - d.getFullYear()) * 12 + (to.getMonth() - d.getMonth());
  return Math.max(0, months);
}

export function periodLabel(month?: number | null, year?: number | null): string {
  if (!month || !year) return "—";
  const months = [
    "يناير","فبراير","مارس","أبريل","مايو","يونيو",
    "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
  ];
  const m = months[(month - 1) % 12] || String(month);
  return `${m} ${year}`;
}

/* ========== Loan eligibility ========== */

export type LoanEligibilityInput = {
  loanAmount?: number | string | null;
  installments?: number | string | null;
  workStartDate?: string | null;
  baseSalary?: number | string | null;
  loanLimit?: number | string | null;          // optional config override
  minMonthsOfService?: number | null;          // optional config override
};

export type EligibilityStatus = "pre_eligible" | "needs_review" | "not_eligible";

export type LoanEligibilityResult = {
  eligibility_status: EligibilityStatus;
  eligibility_reason: string;
  calculated_loan_limit: number | null;
  months_of_service: number | null;
  years_of_service: number | null;
  max_installments: number | null;
  badge: { text: string; tone: "ok" | "warn" | "bad" };
};

/** سياسة القرض الحسن — مطعم الملكي (سريان 1/1/2026): السقف ومدة السداد حسب سنوات الخدمة. */
export const LOAN_POLICY_TIERS: { minYears: number; maxYears: number | null; cap: number; maxInstallments: number }[] = [
  { minYears: 1, maxYears: 2, cap: 2000, maxInstallments: 4 },
  { minYears: 2, maxYears: 3, cap: 4000, maxInstallments: 6 },
  { minYears: 3, maxYears: 4, cap: 5000, maxInstallments: 8 },
  { minYears: 4, maxYears: 5, cap: 6000, maxInstallments: 10 },
  { minYears: 5, maxYears: 6, cap: 8000, maxInstallments: 12 },
  { minYears: 6, maxYears: null, cap: 10000, maxInstallments: 12 },
];

/** الحد الأدنى لسنوات الخدمة حسب السياسة: سنة واحدة متصلة. */
export const LOAN_MIN_MONTHS_OF_SERVICE = 12;

export function loanTierForMonths(months: number | null | undefined) {
  if (months == null || !isFinite(months)) return null;
  const y = months / 12;
  return LOAN_POLICY_TIERS.find((t) => y >= t.minYears && (t.maxYears == null || y < t.maxYears)) ?? null;
}

/** يحوّل الأشهر إلى سنوات خدمة بمنزلة عشرية واحدة (14 شهر → 1.2 سنة). */
export function yearsFromMonths(months: number | null | undefined): number | null {
  if (months == null || !isFinite(months)) return null;
  return Math.round((months / 12) * 10) / 10;
}

/** نص عربي لسنوات الخدمة: "سنة و 2 شهر" / "1.2 سنة". */
export function serviceYearsLabel(months: number | null | undefined): string {
  if (months == null || !isFinite(months)) return "—";
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y <= 0) return `${m} شهر`;
  if (m === 0) return y === 1 ? "سنة واحدة" : `${y} سنة`;
  return `${y} سنة و ${m} شهر`;
}

export function evaluateLoanEligibility(input: LoanEligibilityInput): LoanEligibilityResult {
  const minMonths = input.minMonthsOfService ?? LOAN_MIN_MONTHS_OF_SERVICE;
  const salary = safeNum(input.baseSalary);
  const amount = safeNum(input.loanAmount);
  const installments = safeNum(input.installments);
  const months = monthsBetween(input.workStartDate);
  const years = yearsFromMonths(months);
  const tier = loanTierForMonths(months);
  const limitFromSettings = input.loanLimit != null && input.loanLimit !== "" ? safeNum(input.loanLimit) : null;
  const limit = limitFromSettings ?? (tier ? tier.cap : null);
  const maxInstallments = tier ? tier.maxInstallments : null;

  // Missing data → needs_review
  if (!amount || !installments || months == null) {
    return {
      eligibility_status: "needs_review",
      eligibility_reason: "البيانات غير مكتملة — مطلوب مراجعة HR",
      calculated_loan_limit: limit,
      months_of_service: months,
      years_of_service: years,
      max_installments: maxInstallments,
      badge: { text: "يتطلب مراجعة", tone: "warn" },
    };
  }

  if (months < minMonths) {
    return {
      eligibility_status: "not_eligible",
      eligibility_reason: `مدة الخدمة (${serviceYearsLabel(months)}) أقل من الحد المطلوب حسب السياسة (سنة واحدة متصلة)`,
      calculated_loan_limit: limit,
      months_of_service: months,
      years_of_service: years,
      max_installments: maxInstallments,
      badge: { text: "غير مؤهل مبدئياً", tone: "bad" },
    };
  }

  if (limit != null && amount > limit) {
    return {
      eligibility_status: "needs_review",
      eligibility_reason: `غير مؤهل للمبلغ المطلوب: طلب ${amount} ₪ والسقف المستحق حسب سنوات الخدمة (${serviceYearsLabel(months)}) هو ${limit} ₪ فقط — حسب المادة (4) من سياسة القرض الحسن`,
      calculated_loan_limit: limit,
      months_of_service: months,
      years_of_service: years,
      max_installments: maxInstallments,
      badge: { text: "يتطلب مراجعة", tone: "warn" },
    };
  }

  if (maxInstallments != null && installments > maxInstallments) {
    return {
      eligibility_status: "needs_review",
      eligibility_reason: `مدة السداد المطلوبة (${installments} شهر) تتجاوز الحد المسموح لشريحته (${maxInstallments} أشهر) حسب المادة (4)`,
      calculated_loan_limit: limit,
      months_of_service: months,
      years_of_service: years,
      max_installments: maxInstallments,
      badge: { text: "يتطلب مراجعة", tone: "warn" },
    };
  }

  return {
    eligibility_status: "pre_eligible",
    eligibility_reason: `مستوفي للشروط المبدئية — سنوات الخدمة ${serviceYearsLabel(months)}، السقف المستحق ${limit ?? 0} ₪ ومدة السداد حتى ${maxInstallments ?? "—"} شهر. الموافقة النهائية تبقى لـ HR`,
    calculated_loan_limit: limit,
    months_of_service: months,
    years_of_service: years,
    max_installments: maxInstallments,
    badge: { text: "مؤهل مبدئياً", tone: "ok" },
  };
}

export function eligibilityBadgeClass(tone: "ok" | "warn" | "bad"): string {
  switch (tone) {
    case "ok":   return "bg-emerald-500/10 text-emerald-600 border-emerald-500/30";
    case "warn": return "bg-amber-500/10 text-amber-600 border-amber-500/30";
    case "bad":  return "bg-rose-500/10 text-rose-600 border-rose-500/30";
  }
}
