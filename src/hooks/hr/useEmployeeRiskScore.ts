import { useMemo } from "react";
import type { Employee360Data } from "./useEmployee360";
import type { CostEngineResult } from "./useEmployeeCostEngine";

/**
 * useEmployeeRiskScore
 * ---------------------------------------------------
 * Computes a 0-100 risk score using 5 weighted signals:
 *   - Attendance rate (40%)        → lower attendance ⇒ higher risk
 *   - Late frequency (20%)         → more late days ⇒ higher risk
 *   - Cost vs role / vs base (20%) → high allowance/cost burden ⇒ higher risk
 *   - Loan burden (10%)            → installment / base salary
 *   - Request frequency (10%)      → many leave/form requests ⇒ higher risk
 *
 * Pure compute, deterministic.
 */

export type RiskLevel = "low" | "medium" | "high";

export type RiskScoreResult = {
  score: number;          // 0..100
  level: RiskLevel;
  color: "green" | "yellow" | "red";
  label: string;          // arabic
  signals: {
    attendance: number;   // 0..100 (risk contribution before weight)
    late: number;
    cost: number;
    loan: number;
    requests: number;
  };
  reasons: string[];      // human readable risk explanations
};

const clamp = (v: number, min = 0, max = 100) =>
  Math.max(min, Math.min(max, v));

export function useEmployeeRiskScore(
  data: Employee360Data | undefined,
  cost: CostEngineResult | undefined
): RiskScoreResult {
  return useMemo(() => {
    if (!data?.employee) return emptyResult();

    const stats = data.attendance.stats;
    const reasons: string[] = [];

    // ---- 1) Attendance signal (40%) ----
    // attendance_rate 1.0 → 0 risk, 0.0 → 100 risk
    const attendanceSignal = clamp(
      (1 - stats.attendanceRate) * 100
    );
    if (stats.attendanceRate < 0.85)
      reasons.push(`نسبة حضور منخفضة (${Math.round(stats.attendanceRate * 100)}%)`);

    // ---- 2) Late signal (20%) ----
    // 0% late → 0 risk, 30%+ late → 100 risk
    const lateSignal = clamp((stats.lateRate / 0.3) * 100);
    if (stats.lateRate > 0.15)
      reasons.push(`نسبة تأخير مرتفعة (${Math.round(stats.lateRate * 100)}%)`);

    // ---- 3) Cost signal (20%) ----
    // High deduction ratio OR very high allowance ratio increases risk.
    // Threshold: deductionRatio >= 0.2 → +50, allowanceRatio > 1.5 → +30
    let costSignal = 0;
    if (cost) {
      costSignal += clamp(cost.ratios.deductionRatio * 250); // 0.4 → 100
      if (cost.ratios.allowanceRatio > 1.5) costSignal += 30;
    }
    costSignal = clamp(costSignal);
    if (cost && cost.ratios.deductionRatio > 0.2)
      reasons.push(
        `خصومات هذا الشهر تجاوزت ${Math.round(cost.ratios.deductionRatio * 100)}% من الراتب`
      );

    // ---- 4) Loan burden signal (10%) ----
    // installment / base : 0% → 0, 50%+ → 100
    let loanSignal = 0;
    if (cost) {
      loanSignal = clamp((cost.ratios.loanBurden / 0.5) * 100);
      if (cost.ratios.loanBurden > 0.3)
        reasons.push(
          `عبء قروض مرتفع (${Math.round(cost.ratios.loanBurden * 100)}% من الراتب)`
        );
    }

    // ---- 5) Request frequency signal (10%) ----
    // Count requests last 30d (forms + leave) ; 0 → 0, 5+ → 100
    const recentRequests =
      countRecent(data.forms, 30, "created_at") +
      countRecent(data.leaves.requests, 30, "created_at");
    const requestSignal = clamp((recentRequests / 5) * 100);
    if (recentRequests >= 4)
      reasons.push(`عدد طلبات مرتفع (${recentRequests} خلال 30 يوم)`);

    // ---- Weighted score ----
    const score = clamp(
      attendanceSignal * 0.4 +
        lateSignal * 0.2 +
        costSignal * 0.2 +
        loanSignal * 0.1 +
        requestSignal * 0.1
    );

    const level: RiskLevel =
      score <= 40 ? "low" : score <= 70 ? "medium" : "high";
    const color = level === "low" ? "green" : level === "medium" ? "yellow" : "red";
    const label =
      level === "low" ? "منخفض" : level === "medium" ? "متوسط" : "عالي";

    return {
      score: Math.round(score),
      level,
      color,
      label,
      signals: {
        attendance: Math.round(attendanceSignal),
        late: Math.round(lateSignal),
        cost: Math.round(costSignal),
        loan: Math.round(loanSignal),
        requests: Math.round(requestSignal),
      },
      reasons,
    };
  }, [data, cost]);
}

function countRecent(arr: any[] | undefined, days: number, field: string) {
  if (!arr?.length) return 0;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return arr.filter((x) => {
    const t = x?.[field] ? new Date(x[field]).getTime() : 0;
    return t >= cutoff;
  }).length;
}

function emptyResult(): RiskScoreResult {
  return {
    score: 0,
    level: "low",
    color: "green",
    label: "منخفض",
    signals: { attendance: 0, late: 0, cost: 0, loan: 0, requests: 0 },
    reasons: [],
  };
}
