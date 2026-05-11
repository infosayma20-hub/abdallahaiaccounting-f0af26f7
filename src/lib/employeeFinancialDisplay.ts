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
  const d = new Date(year, (month || 1) - 1, 1);
  try {
    return d.toLocaleDateString("ar-EG-u-ca-gregory", { month: "long", year: "numeric" });
  } catch {
    return `${month}/${year}`;
  }
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
  badge: { text: string; tone: "ok" | "warn" | "bad" };
};

export function evaluateLoanEligibility(input: LoanEligibilityInput): LoanEligibilityResult {
  const minMonths = input.minMonthsOfService ?? 3;
  const salary = safeNum(input.baseSalary);
  const amount = safeNum(input.loanAmount);
  const installments = safeNum(input.installments);
  const months = monthsBetween(input.workStartDate);
  const limitFromSettings = input.loanLimit != null && input.loanLimit !== "" ? safeNum(input.loanLimit) : null;
  const limitFallback = salary > 0 ? salary * 3 : null;
  const limit = limitFromSettings ?? limitFallback;

  // Missing data → needs_review
  if (!amount || !installments || months == null) {
    return {
      eligibility_status: "needs_review",
      eligibility_reason: "البيانات غير مكتملة — مطلوب مراجعة HR",
      calculated_loan_limit: limit,
      months_of_service: months,
      badge: { text: "يتطلب مراجعة", tone: "warn" },
    };
  }

  if (months < minMonths) {
    return {
      eligibility_status: "not_eligible",
      eligibility_reason: `مدة العمل (${months} شهر) أقل من الحد المطلوب (${minMonths} شهر)`,
      calculated_loan_limit: limit,
      months_of_service: months,
      badge: { text: "غير مؤهل مبدئياً", tone: "bad" },
    };
  }

  if (limit != null && amount > limit) {
    return {
      eligibility_status: "needs_review",
      eligibility_reason: `قيمة القرض (${amount}) تتجاوز السقف المسموح (${limit})`,
      calculated_loan_limit: limit,
      months_of_service: months,
      badge: { text: "يتطلب مراجعة", tone: "warn" },
    };
  }

  return {
    eligibility_status: "pre_eligible",
    eligibility_reason: "مستوفي للشروط المبدئية — الموافقة النهائية تبقى لـ HR",
    calculated_loan_limit: limit,
    months_of_service: months,
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
