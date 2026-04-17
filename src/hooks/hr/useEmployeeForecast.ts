import { useMemo } from "react";
import type { Employee360Data } from "./useEmployee360";
import type { CostEngineResult } from "./useEmployeeCostEngine";

/**
 * useEmployeeForecast
 * ---------------------------------------------------
 * Projects the end-of-month payroll outcome based on:
 *   - elapsed vs remaining workdays in the current month
 *   - current attendance pattern (late/absent rate)
 *   - current month deductions + active loan installment
 *
 * Returns warnings when deductions exceed safe thresholds.
 */

export type ForecastResult = {
  expectedNetSalary: number;
  expectedDeductions: number;
  expectedAttendanceImpact: number; // estimated extra deductions from late/absent until EOM
  daysElapsed: number;
  daysRemaining: number;
  workdaysInMonth: number;
  deductionRatio: number;           // expected deductions / base
  warnings: ForecastWarning[];
};

export type ForecastWarning = {
  level: "info" | "warning" | "danger";
  code:
    | "DEDUCTION_OVER_20"
    | "DEDUCTION_OVER_40"
    | "ATTENDANCE_CRITICAL"
    | "LOAN_BURDEN_HIGH"
    | "NET_NEGATIVE";
  message: string;
};

const num = (v: any) => Number(v || 0);

export function useEmployeeForecast(
  data: Employee360Data | undefined,
  cost: CostEngineResult | undefined
): ForecastResult {
  return useMemo(() => {
    if (!data?.employee || !cost) return emptyResult();

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const totalDaysInMonth = lastDay.getDate();
    const daysElapsed = today.getDate();
    const daysRemaining = totalDaysInMonth - daysElapsed;

    const e = data.employee;
    const baseSalary = num(e.base_salary);
    const workDaysPerWeek = num(e.work_days_per_week) || 6;
    // approximate workdays in month
    const workdaysInMonth = Math.round((totalDaysInMonth * workDaysPerWeek) / 7);

    // ---- Estimate attendance impact ----
    // Use late/absent rate so far this month from attendance days within month
    const monthStart = firstDay.toISOString().split("T")[0];
    const thisMonthDays = (data.attendance.days || []).filter(
      (d: any) => d.attendance_date >= monthStart
    );
    const observed = thisMonthDays.length || 1;
    const lateOrAbsent = thisMonthDays.filter((d: any) =>
      ["late", "absent", "incomplete", "متأخر", "غائب", "ناقص"].includes(d.status)
    ).length;
    const lateAbsentRate = lateOrAbsent / observed;

    // Daily salary used to estimate the cost of remaining late/absent days
    const dailySalary = workdaysInMonth > 0 ? baseSalary / workdaysInMonth : 0;
    // Half-day equivalent loss for each predicted late/absent day
    const remainingWorkdays = Math.max(
      0,
      Math.round((daysRemaining * workDaysPerWeek) / 7)
    );
    const expectedAttendanceImpact =
      lateAbsentRate * remainingWorkdays * dailySalary * 0.5;

    const expectedDeductions =
      cost.breakdown.totalDeductions + expectedAttendanceImpact;

    const expectedNetSalary = Math.max(
      0,
      cost.totalCost - expectedDeductions
    );

    const deductionRatio =
      baseSalary > 0 ? expectedDeductions / baseSalary : 0;

    // ---- Build warnings ----
    const warnings: ForecastWarning[] = [];
    if (deductionRatio >= 0.4) {
      warnings.push({
        level: "danger",
        code: "DEDUCTION_OVER_40",
        message: `الخصومات المتوقعة تتجاوز 40% من الراتب (${Math.round(deductionRatio * 100)}%)`,
      });
    } else if (deductionRatio >= 0.2) {
      warnings.push({
        level: "warning",
        code: "DEDUCTION_OVER_20",
        message: `الخصومات المتوقعة تتجاوز 20% من الراتب (${Math.round(deductionRatio * 100)}%)`,
      });
    }
    if (lateAbsentRate > 0.25) {
      warnings.push({
        level: "warning",
        code: "ATTENDANCE_CRITICAL",
        message: `نسبة تأخير/غياب مرتفعة هذا الشهر (${Math.round(lateAbsentRate * 100)}%)`,
      });
    }
    if (cost.ratios.loanBurden >= 0.3) {
      warnings.push({
        level: "warning",
        code: "LOAN_BURDEN_HIGH",
        message: `قسط القرض يستهلك ${Math.round(cost.ratios.loanBurden * 100)}% من الراتب`,
      });
    }
    if (expectedNetSalary <= 0 && baseSalary > 0) {
      warnings.push({
        level: "danger",
        code: "NET_NEGATIVE",
        message: "صافي الراتب المتوقع صفر أو سالب — يرجى المراجعة",
      });
    }

    return {
      expectedNetSalary,
      expectedDeductions,
      expectedAttendanceImpact,
      daysElapsed,
      daysRemaining,
      workdaysInMonth,
      deductionRatio,
      warnings,
    };
  }, [data, cost]);
}

function emptyResult(): ForecastResult {
  return {
    expectedNetSalary: 0,
    expectedDeductions: 0,
    expectedAttendanceImpact: 0,
    daysElapsed: 0,
    daysRemaining: 0,
    workdaysInMonth: 0,
    deductionRatio: 0,
    warnings: [],
  };
}
