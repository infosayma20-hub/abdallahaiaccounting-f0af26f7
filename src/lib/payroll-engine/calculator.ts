/**
 * Generic Payroll Calculator (S2-A)
 * 
 * Read-only adapter. Pure function. No DB, no React.
 * Currently mirrors Malaki Engine 1:1 when preset='malaki'.
 * 
 * Comparison-tested against src/lib/malaki-payroll.ts before any UI integration.
 */

import { differenceInMonths } from 'date-fns';
import type {
  PayrollEmployeeData,
  PayrollMonthInputs,
  PayrollPolicy,
  PayrollPeriod,
  PayslipResult,
} from './types';
import { MALAKI_CONSTANTS as M } from './presets/malaki';

/**
 * Master entry point. Routes to preset-specific implementation.
 * For S2-A only 'malaki' is implemented (must match Malaki Engine exactly).
 */
export function calculatePayslip(
  emp: PayrollEmployeeData,
  input: PayrollMonthInputs,
  period: PayrollPeriod,
  policy: PayrollPolicy
): PayslipResult {
  if (policy.preset === 'malaki') {
    return calculateMalakiPreset(emp, input, period, policy);
  }
  // 'standard' / 'custom' presets will be implemented in later phases.
  // For now we throw to make accidental misuse impossible.
  throw new Error(
    `[payroll-engine] Preset "${policy.preset}" not yet implemented in S2-A. Only 'malaki' is supported.`
  );
}

function calculateMalakiPreset(
  emp: PayrollEmployeeData,
  input: PayrollMonthInputs,
  period: PayrollPeriod,
  policy: PayrollPolicy
): PayslipResult {
  const rules: string[] = [];
  const payrollDate = new Date(period.year, period.month - 1, M.MONTH_DAYS);

  // ─── 1) Hourly salary ───
  const overtimeWithBonus = input.overtime_hours * M.OVERTIME_MULT;
  const holidayOvertimeWithBonus = input.holiday_overtime_hours * M.HOLIDAY_OVERTIME_MULT;
  const totalHours =
    input.working_hours + overtimeWithBonus + holidayOvertimeWithBonus + input.vacation_hours;
  const hourlyRate = emp.hourly_rate || M.DEFAULT_HOURLY_RATE;
  const attendance_salary = totalHours * hourlyRate;
  rules.push(`hourly: ${totalHours}h × ${hourlyRate} = ${attendance_salary}`);

  // ─── 2) Fixed component ───
  const monthsEmployed = differenceInMonths(payrollDate, new Date(emp.start_date));
  const yearsEmployed = Math.floor(monthsEmployed / 12);
  const annual_allowance = yearsEmployed > 0 ? yearsEmployed * M.ANNUAL_INCREMENT_PER_YEAR : 0;
  const admin_allowance = emp.admin_allowance || 0;
  const transferAllowance = emp.transfer_allowance || 0;
  const food_transport_base =
    monthsEmployed >= M.FOOD_TRANSPORT_ACTIVATION_MONTHS
      ? (emp.food_transport_override ?? M.FOOD_TRANSPORT_DEFAULT)
      : 0;
  rules.push(`fixed: years=${yearsEmployed}, months=${monthsEmployed}`);

  // ─── 3) Food/Transport net ───
  let food_transport_net = 0;
  if (food_transport_base > 0) {
    const extraHolidayDays = Math.max(0, M.MONTH_DAYS - input.working_days - M.WEEKLY_OFFS);
    if (input.working_days > 15) {
      food_transport_net = Math.max(0, food_transport_base - extraHolidayDays * M.FOOD_TRANSPORT_DAILY_DEDUCTION);
    } else {
      food_transport_net = input.working_days * M.FOOD_TRANSPORT_DAILY_DEDUCTION;
    }
  }

  // ─── 4) Family allowance ───
  const family_allowance =
    monthsEmployed < M.FAMILY_ALLOWANCE_ACTIVATION_MONTHS
      ? 0
      : (emp.wives_count || 0) * M.FAMILY_PER_WIFE + (emp.children_count || 0) * M.FAMILY_PER_CHILD;

  const other_allowances = emp.other_allowances || 0;

  const otherAllowancesOnly = annual_allowance + admin_allowance + family_allowance + other_allowances;
  const gross_fixed =
    annual_allowance + admin_allowance + food_transport_net + family_allowance + other_allowances + transferAllowance;

  // ─── 5) Fixed deduction ───
  const effectiveDays = input.working_days + input.annual_leave_days + M.WEEKLY_OFFS;
  let fixed_deduction = 0;
  if (effectiveDays < M.FIXED_DEDUCTION_THRESHOLD_DAYS) {
    const raw = ((M.MONTH_DAYS - effectiveDays) / M.MONTH_DAYS) * otherAllowancesOnly;
    fixed_deduction = raw >= M.FIXED_DEDUCTION_MIN_AMOUNT ? raw : 0;
  }
  const net_fixed = food_transport_net + otherAllowancesOnly - fixed_deduction;

  // ─── 6) Attendance bonus ───
  const absentDays = M.MONTH_DAYS - input.working_days;
  const attendance_bonus =
    absentDays > M.ATTENDANCE_BONUS_MAX_ABSENT
      ? 0
      : 4 * (M.ATTENDANCE_BONUS_MAX_ABSENT - absentDays) * M.ATTENDANCE_BONUS_RATE;

  // ─── 7) Deductions ───
  const deduction_food_group = input.food_total * M.FOOD_GROUP_RATE;
  const deduction_food_individual = input.food_individual * M.FOOD_INDIVIDUAL_RATE;
  const total_deductions =
    input.opening_advance_balance +
    input.loan_installment +
    input.new_advance +
    input.cash_advances +
    deduction_food_group +
    deduction_food_individual +
    input.cash_shortage +
    input.delivery +
    input.purchases +
    input.other_deduction +
    input.violations;

  // ─── 8) Termination entitlements ───
  let entitlements = 0;
  if (input.has_termination_pay && emp.is_terminated && emp.terminated_at) {
    const termDate = new Date(emp.terminated_at);
    const start = new Date(emp.start_date);
    const lawChange = new Date(M.LAW_CHANGE_DATE);
    const periodStart = start > lawChange ? start : lawChange;
    const monthsAfterLaw = differenceInMonths(termDate, periodStart);
    const totalMonths = differenceInMonths(termDate, start);
    const vacationPay = (emp.annual_leave_balance || 0) * M.DEFAULT_HOURLY_RATE * M.VACATION_HOUR_RATE_MULT;
    const severance = totalMonths >= 12 ? (M.SEVERANCE_BASE * monthsAfterLaw) / M.SEVERANCE_DIVISOR : 0;
    entitlements = vacationPay + Math.max(0, severance);
  }

  // ─── 9) Totals ───
  const total_earnings =
    attendance_salary +
    net_fixed +
    (input.special_allowance || 0) +
    (input.extra_work_allowance || 0) +
    attendance_bonus +
    entitlements;
  const net_salary = total_earnings - total_deductions;

  return {
    working_days: input.working_days,
    regular_hours: input.working_hours,
    overtime_hours: input.overtime_hours,
    vacation_hours: input.vacation_hours,
    annual_leave_days: input.annual_leave_days,
    sick_leave_days: input.sick_leave_days,

    attendance_salary,
    annual_allowance,
    admin_allowance,
    food_transport_base,
    food_transport_net,
    family_allowance,
    other_allowances,
    gross_fixed,
    fixed_deduction,
    net_fixed,

    attendance_bonus,
    special_allowance: input.special_allowance || 0,
    extra_work_allowance: input.extra_work_allowance || 0,
    entitlements,

    total_earnings,

    deduction_opening_balance: input.opening_advance_balance,
    deduction_loan: input.loan_installment,
    deduction_new_advance: input.new_advance,
    deduction_cash_advance: input.cash_advances,
    deduction_food_group,
    deduction_food_individual,
    deduction_cash_shortage: input.cash_shortage,
    deduction_cash_surplus: input.cash_surplus,
    deduction_delivery: input.delivery,
    deduction_purchases: input.purchases,
    deduction_other: input.other_deduction,
    deduction_violations: input.violations,
    total_deductions,

    net_salary,
    carry_over_balance: net_salary < 0 ? Math.abs(net_salary) : 0,

    _engine: {
      preset: 'malaki',
      policy_id: policy.id,
      policy_name: policy.name,
      rules_applied: rules,
    },
  };
}