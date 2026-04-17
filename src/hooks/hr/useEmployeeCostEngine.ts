import { useMemo } from "react";
import type { Employee360Data } from "./useEmployee360";

/**
 * useEmployeeCostEngine
 * ---------------------------------------------------
 * Computes the full monthly cost of an employee using
 * the unified Employee360 data.
 *
 * Total Monthly Cost =
 *   base_salary
 * + allowances (food/transport/family/admin/other)
 * + estimated bonuses
 * + estimated overtime
 * - deductions (this month)
 * - active loan installment
 *
 * Pure compute — no fetching, no side effects.
 */

export type CostBreakdown = {
  baseSalary: number;
  foodAllowance: number;
  transportAllowance: number;
  spouseAllowance: number;
  childrenAllowance: number;
  adminAllowance: number;
  otherAllowances: number;
  customAllowances: number;
  bonuses: number;
  overtime: number;
  totalAdditions: number;
  deductionsThisMonth: number;
  loanInstallment: number;
  totalDeductions: number;
};

export type CostEngineResult = {
  totalCost: number;          // Employer total cost (gross)
  netExpectedSalary: number;  // What employee receives
  breakdown: CostBreakdown;
  ratios: {
    deductionRatio: number;   // deductions / base
    loanBurden: number;       // installment / base
    allowanceRatio: number;   // allowances / base
  };
};

const num = (v: any) => Number(v || 0);

export function useEmployeeCostEngine(
  data: Employee360Data | undefined
): CostEngineResult {
  return useMemo(() => {
    if (!data?.employee) {
      return emptyResult();
    }

    const e = data.employee;
    const settings = data.payroll.settings;
    const baseSalary = num(e.base_salary);

    // ---- Allowances from employee profile ----
    const baseMonthDays = num(settings?.base_month_days) || 28;
    const foodAllowance =
      num(e.meal_allowance_per_day) * baseMonthDays;
    const transportAllowance =
      num(e.transportation_allowance_per_day) * baseMonthDays;
    const spouseAllowance =
      num(e.spouse_allowance_amount) * num(e.wives_count || (e.marital_status === "married" ? 1 : 0));
    const childrenAllowance =
      num(e.child_allowance_per_child) * num(e.children_count);
    const adminAllowance = num(e.admin_allowance);
    const otherAllowances =
      num(e.other_allowances) +
      num(e.special_work_allowance) +
      num(e.transfer_allowance);

    // ---- Custom active allowances table ----
    const customAllowances = (data.payroll.allowances || []).reduce(
      (sum, a: any) => {
        if (a.allowance_type === "fixed") return sum + num(a.fixed_amount || a.amount);
        if (a.allowance_type === "daily")
          return sum + num(a.amount_per_day) * baseMonthDays;
        if (a.allowance_type === "percentage")
          return sum + (baseSalary * num(a.percentage)) / 100;
        return sum + num(a.amount);
      },
      0
    );

    // ---- Overtime estimate (last 30 days) ----
    const overtimeMultiplier = num(settings?.overtime_multiplier) || 1.5;
    const hourlyRate =
      num(e.hourly_rate) ||
      (num(settings?.default_hourly_rate)) ||
      (baseSalary > 0 && num(e.work_hours_per_day) > 0
        ? baseSalary / (baseMonthDays * num(e.work_hours_per_day))
        : 0);
    const overtime =
      data.attendance.stats.totalOvertime * hourlyRate * overtimeMultiplier;

    // ---- Bonuses estimate (from last payroll if present) ----
    const last = data.payroll.last;
    const bonuses =
      num(last?.attendance_bonus) +
      num(last?.special_allowance) +
      num(last?.extra_work_allowance);

    // ---- Deductions this month ----
    const deductionsThisMonth = data.deductions.monthTotal;

    // ---- Active loan installment ----
    const loanInstallment = data.loans.monthlyInstallment;

    const totalAdditions =
      foodAllowance +
      transportAllowance +
      spouseAllowance +
      childrenAllowance +
      adminAllowance +
      otherAllowances +
      customAllowances +
      bonuses +
      overtime;

    const totalDeductions = deductionsThisMonth + loanInstallment;

    const grossCost = baseSalary + totalAdditions; // employer cost (before deductions on employee)
    const netExpectedSalary = Math.max(0, grossCost - totalDeductions);

    const breakdown: CostBreakdown = {
      baseSalary,
      foodAllowance,
      transportAllowance,
      spouseAllowance,
      childrenAllowance,
      adminAllowance,
      otherAllowances,
      customAllowances,
      bonuses,
      overtime,
      totalAdditions,
      deductionsThisMonth,
      loanInstallment,
      totalDeductions,
    };

    const ratios = {
      deductionRatio: baseSalary > 0 ? deductionsThisMonth / baseSalary : 0,
      loanBurden: baseSalary > 0 ? loanInstallment / baseSalary : 0,
      allowanceRatio: baseSalary > 0 ? totalAdditions / baseSalary : 0,
    };

    return {
      totalCost: grossCost,
      netExpectedSalary,
      breakdown,
      ratios,
    };
  }, [data]);
}

function emptyResult(): CostEngineResult {
  return {
    totalCost: 0,
    netExpectedSalary: 0,
    breakdown: {
      baseSalary: 0,
      foodAllowance: 0,
      transportAllowance: 0,
      spouseAllowance: 0,
      childrenAllowance: 0,
      adminAllowance: 0,
      otherAllowances: 0,
      customAllowances: 0,
      bonuses: 0,
      overtime: 0,
      totalAdditions: 0,
      deductionsThisMonth: 0,
      loanInstallment: 0,
      totalDeductions: 0,
    },
    ratios: { deductionRatio: 0, loanBurden: 0, allowanceRatio: 0 },
  };
}
