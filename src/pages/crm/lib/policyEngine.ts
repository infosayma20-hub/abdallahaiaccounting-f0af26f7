// CRM Policy Engine — pure functions that translate contact + policy + financials
// into actionable CRM decisions (credit warnings, follow-up urgency, risk badges).
// READ-ONLY: never mutates contacts or policies.

export type ContactClass = "A" | "B" | "C" | "D" | null;

export interface ContactSnapshot {
  id: string;
  contact_name: string;
  contact_class: ContactClass;
  credit_limit: number | null;
  current_balance: number | null;
  payment_terms_days: number | null;
  avg_payment_days: number | null;
  total_sales: number | null;
  overdue_amount: number | null;
  last_transaction_date: string | null;
}

export interface PolicySnapshot {
  class: string;
  label: string | null;
  color: string | null;
  credit_limit_default: number | null;
  payment_terms_days: number | null;
  discount_pct: number | null;
  followup_days: number | null;
  description: string | null;
}

export interface LiveFinancials {
  outstanding: number;
  overdue: number;
  total_ytd: number;
  invoices_count: number;
  last_sale_date: string | null;
  /**
   * Phase 5G — authoritative balance from `get_contact_balance` RPC.
   * Always present after the hook resolves. Use this (not
   * `contact.current_balance`) for credit decisions and badges.
   */
  ledger_balance: number;
}

export type RiskLevel = "excellent" | "good" | "average" | "delayed" | "high_risk" | "new";

export interface RiskBadge {
  level: RiskLevel;
  label: string;
  color: string;
  bg: string;
  border: string;
  reason: string;
}

export interface CreditDecision {
  effectiveLimit: number;
  used: number;
  available: number;
  utilizationPct: number;
  canSellOnCredit: boolean;
  requiresApproval: boolean;
  warnings: string[];
  recommendedTermsDays: number;
}

// ===== Risk badge =====
export function getRiskBadge(
  contact: ContactSnapshot | null,
  financials: LiveFinancials | null,
): RiskBadge {
  // No financial history yet
  if (!financials || financials.invoices_count === 0) {
    return {
      level: "new",
      label: "عميل جديد",
      color: "#0369A1",
      bg: "#E0F2FE",
      border: "#7DD3FC",
      reason: "لا توجد فواتير سابقة",
    };
  }

  const overduePct = financials.outstanding > 0
    ? (financials.overdue / financials.outstanding) * 100
    : 0;

  // Class D = explicitly flagged risky in policies
  if (contact?.contact_class === "D" || overduePct >= 50) {
    return {
      level: "high_risk",
      label: "عالي المخاطر",
      color: "#B91C1C",
      bg: "#FEE2E2",
      border: "#FCA5A5",
      reason: contact?.contact_class === "D"
        ? "مصنف فئة D حسب السياسة"
        : `${overduePct.toFixed(0)}٪ من الرصيد متأخر`,
    };
  }

  if (overduePct >= 20 || (financials.overdue > 0 && contact?.contact_class === "C")) {
    return {
      level: "delayed",
      label: "تأخير في السداد",
      color: "#C2410C",
      bg: "#FFEDD5",
      border: "#FDBA74",
      reason: `متأخر: ${financials.overdue.toFixed(0)} ₪`,
    };
  }

  if (financials.overdue > 0) {
    return {
      level: "average",
      label: "متوسط",
      color: "#A16207",
      bg: "#FEF3C7",
      border: "#FCD34D",
      reason: "تأخير بسيط في السداد",
    };
  }

  if (contact?.contact_class === "A" || financials.total_ytd > 50000) {
    return {
      level: "excellent",
      label: "عميل ممتاز",
      color: "#15803D",
      bg: "#DCFCE7",
      border: "#86EFAC",
      reason: "سداد منتظم وحجم تعامل عالي",
    };
  }

  return {
    level: "good",
    label: "جيد",
    color: "#0E7490",
    bg: "#CFFAFE",
    border: "#67E8F9",
    reason: "سجل سداد جيد",
  };
}

// ===== Credit decision =====
export function evaluateCreditDecision(
  contact: ContactSnapshot | null,
  policy: PolicySnapshot | null,
  financials: LiveFinancials | null,
  proposedAmount: number = 0,
): CreditDecision {
  // Effective limit: contact override > policy default > 0
  const effectiveLimit =
    Number(contact?.credit_limit ?? 0) ||
    Number(policy?.credit_limit_default ?? 0) ||
    0;

  // Phase 5G — Single Source of Truth.
  // Prefer the ledger balance; fall back to outstanding (also ledger-derived
  // in the new useCustomer360); only use stored current_balance as a last
  // resort for legacy callers that haven't been migrated yet.
  const used = Number(
    financials?.ledger_balance ??
    financials?.outstanding ??
    contact?.current_balance ?? 0,
  );
  const newTotal = used + Number(proposedAmount || 0);
  const available = Math.max(0, effectiveLimit - used);
  const utilizationPct = effectiveLimit > 0 ? (newTotal / effectiveLimit) * 100 : 0;

  const warnings: string[] = [];
  let canSellOnCredit = true;
  let requiresApproval = false;

  // Class D = no credit
  if (contact?.contact_class === "D") {
    canSellOnCredit = false;
    warnings.push("هذا العميل مصنّف فئة D — يُمنع البيع الآجل بدون موافقة الإدارة");
    requiresApproval = true;
  }

  // Overdue blocks new credit
  if ((financials?.overdue ?? 0) > 0) {
    warnings.push(`يوجد رصيد متأخر بقيمة ${(financials!.overdue).toFixed(0)} ₪ — يُفضّل التحصيل قبل بيع جديد`);
    if ((financials!.overdue) > effectiveLimit * 0.3) {
      requiresApproval = true;
    }
  }

  // Limit breach
  if (effectiveLimit > 0 && newTotal > effectiveLimit) {
    warnings.push(`المبلغ يتجاوز سقف الائتمان (${effectiveLimit.toFixed(0)} ₪) — مطلوب: ${newTotal.toFixed(0)} ₪`);
    requiresApproval = true;
  } else if (utilizationPct >= 80 && proposedAmount > 0) {
    warnings.push(`استخدام ${utilizationPct.toFixed(0)}٪ من سقف الائتمان`);
  }

  // No limit set
  if (effectiveLimit === 0 && proposedAmount > 0) {
    warnings.push("لم يتم تحديد سقف ائتمان لهذا العميل");
    requiresApproval = true;
  }

  // Recommended terms: contact override > policy > 30 default
  const recommendedTermsDays =
    contact?.payment_terms_days ??
    policy?.payment_terms_days ??
    30;

  return {
    effectiveLimit,
    used,
    available,
    utilizationPct,
    canSellOnCredit,
    requiresApproval,
    warnings,
    recommendedTermsDays,
  };
}

// ===== Follow-up urgency =====
export interface FollowUpDecision {
  isOverdue: boolean;
  daysSinceLastActivity: number | null;
  recommendedFollowUpDays: number;
  urgency: "low" | "medium" | "high" | "critical";
  message: string;
}

export function evaluateFollowUp(
  contact: ContactSnapshot | null,
  policy: PolicySnapshot | null,
  lastActivityDate: string | null,
): FollowUpDecision {
  const recommended = policy?.followup_days ?? 30;

  if (!lastActivityDate) {
    return {
      isOverdue: false,
      daysSinceLastActivity: null,
      recommendedFollowUpDays: recommended,
      urgency: "low",
      message: "لم تتم متابعة بعد",
    };
  }

  const days = Math.floor(
    (Date.now() - new Date(lastActivityDate).getTime()) / (1000 * 60 * 60 * 24),
  );

  const ratio = days / recommended;
  let urgency: FollowUpDecision["urgency"] = "low";
  let message = `آخر متابعة قبل ${days} يوم`;

  if (ratio >= 2) {
    urgency = "critical";
    message = `متأخر جداً — مرّ ${days} يوم (السياسة: كل ${recommended} يوم)`;
  } else if (ratio >= 1) {
    urgency = "high";
    message = `حان وقت المتابعة (مرّ ${days} يوم)`;
  } else if (ratio >= 0.7) {
    urgency = "medium";
    message = `يقترب موعد المتابعة (${recommended - days} يوم متبقي)`;
  }

  return {
    isOverdue: ratio >= 1,
    daysSinceLastActivity: days,
    recommendedFollowUpDays: recommended,
    urgency,
    message,
  };
}

// ===== Suggested discount per policy =====
export function getSuggestedDiscountPct(policy: PolicySnapshot | null): number {
  return Number(policy?.discount_pct ?? 0);
}
