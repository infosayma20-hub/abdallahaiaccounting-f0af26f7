/**
 * Al-Malaki Payroll Engine
 * Based on كشف رواتب الملكي — 28-day month system
 */

import { differenceInMonths } from "date-fns";

// ━━━ Types ━━━
export interface MalakiEmployee {
  id: string;
  full_name: string;
  start_date: string;
  hourly_rate: number;
  base_salary: number;
  admin_allowance: number;
  transfer_allowance: number;
  food_transport_override: number | null;
  wives_count: number;
  children_count: number;
  other_allowances: number;
  special_work_allowance: number;
  annual_leave_balance: number;
  annual_leave_days: number;
  is_terminated: boolean;
  terminated_at: string | null;
}

export interface MalakiMonthInput {
  working_days: number;
  working_hours: number;
  overtime_hours: number;
  holiday_overtime_hours: number;
  vacation_hours: number;
  annual_leave_days: number;
  sick_leave_days: number;
  opening_advance_balance: number;
  loan_installment: number;
  new_advance: number;
  cash_advances: number;
  food_total: number;
  food_individual: number;
  cash_shortage: number;
  cash_surplus: number;
  delivery: number;
  purchases: number;
  other_deduction: number;
  violations: number;
  deduction_notes: string;
  special_allowance: number;
  extra_work_allowance: number;
  has_termination_pay: boolean;
}

export interface MalakiPayslip {
  // Attendance
  working_days: number;
  regular_hours: number;
  overtime_hours: number;
  vacation_hours: number;
  annual_leave_days: number;
  sick_leave_days: number;

  // Hourly salary
  attendance_salary: number;

  // Fixed component
  annual_allowance: number;
  admin_allowance: number;
  food_transport_base: number;
  food_transport_net: number;
  family_allowance: number;
  other_allowances: number;
  gross_fixed: number;
  fixed_deduction: number;
  net_fixed: number;

  // Bonuses
  attendance_bonus: number;
  special_allowance: number;
  extra_work_allowance: number;
  entitlements: number;

  // Total earnings
  total_earnings: number;

  // Deductions breakdown
  deduction_opening_balance: number;
  deduction_loan: number;
  deduction_new_advance: number;
  deduction_cash_advance: number;
  deduction_food_group: number;
  deduction_food_individual: number;
  deduction_cash_shortage: number;
  deduction_cash_surplus: number;
  deduction_delivery: number;
  deduction_purchases: number;
  deduction_other: number;
  deduction_violations: number;
  total_deductions: number;

  // Net
  net_salary: number;
  carry_over_balance: number;
}

// ━━━ SECTION 2: Attendance-Based Hourly Salary ━━━
export function calculateHourlySalary(
  emp: MalakiEmployee,
  input: MalakiMonthInput
): { attendance_salary: number; total_hours: number } {
  const overtimeWithBonus = input.overtime_hours * 1.5;
  // Holiday overtime at 2.5x (currently rare)
  const holidayOvertimeWithBonus = input.holiday_overtime_hours * 2.5;
  const totalHours =
    input.working_hours + overtimeWithBonus + holidayOvertimeWithBonus + input.vacation_hours;
  const hourlyRate = emp.hourly_rate || 9.6;
  const attendanceSalary = totalHours * hourlyRate;

  return { attendance_salary: attendanceSalary, total_hours: totalHours };
}

// ━━━ SECTION 3: Fixed Component ━━━
export function calculateFixed(
  emp: MalakiEmployee,
  payrollDate: Date
) {
  const monthsEmployed = differenceInMonths(payrollDate, new Date(emp.start_date));
  const yearsEmployed = Math.floor(monthsEmployed / 12);

  // 1. Annual increment: 100₪ per year
  const annualAllowance = yearsEmployed > 0 ? yearsEmployed * 100 : 0;

  // 2. Administrative allowance (stored per employee)
  const adminAllowance = emp.admin_allowance || 0;

  // 3. Transfer allowance
  const transferAllowance = emp.transfer_allowance || 0;

  // 4. Food & Transport (starts after 3 months)
  const foodTransportBase =
    monthsEmployed >= 3 ? (emp.food_transport_override ?? 600) : 0;

  return { annualAllowance, adminAllowance, transferAllowance, foodTransportBase, monthsEmployed };
}

export function calculateFoodTransportNet(
  foodTransportBase: number,
  workingDays: number
): number {
  if (foodTransportBase <= 0) return 0;
  const extraHolidayDays = Math.max(0, 28 - workingDays - 4);
  if (workingDays > 15) {
    return Math.max(0, foodTransportBase - extraHolidayDays * 20);
  }
  return workingDays * 20;
}

export function calculateFamilyAllowance(
  emp: MalakiEmployee,
  monthsEmployed: number
): number {
  if (monthsEmployed < 6) return 0;
  return (emp.wives_count || 0) * 200 + (emp.children_count || 0) * 70;
}

// ━━━ SECTION 4: Fixed Component Deduction ━━━
export function calculateFixedDeduction(
  workingDays: number,
  annualLeaveDays: number,
  allowancesTotal: number
): number {
  const effectiveDays = workingDays + annualLeaveDays + 4; // +4 weekly offs
  if (effectiveDays >= 25) return 0;
  const rawDeduction = ((28 - effectiveDays) / 28) * allowancesTotal;
  return rawDeduction >= 20 ? rawDeduction : 0;
}

// ━━━ SECTION 5: Extra Attendance Bonus ━━━
export function calculateAttendanceBonus(workingDays: number): number {
  const absentDays = 28 - workingDays;
  if (absentDays > 4) return 0;
  return 4 * (4 - absentDays) * 9.6;
}

// ━━━ SECTION 6: Deductions ━━━
export function calculateDeductions(input: MalakiMonthInput) {
  const foodDeductionGroup = input.food_total * 0.9;
  const foodDeductionIndividual = input.food_individual * 0.5;
  const totalFoodDeduction = foodDeductionGroup + foodDeductionIndividual;

  const totalDeductions =
    input.opening_advance_balance +
    input.loan_installment +
    input.new_advance +
    input.cash_advances +
    totalFoodDeduction +
    input.cash_shortage +
    input.delivery +
    input.purchases +
    input.other_deduction +
    input.violations;

  return {
    opening_balance: input.opening_advance_balance,
    loan_installment: input.loan_installment,
    new_advance: input.new_advance,
    cash_advances: input.cash_advances,
    food_deduction_group: foodDeductionGroup,
    food_deduction_individual: foodDeductionIndividual,
    total_food_deduction: totalFoodDeduction,
    cash_shortage: input.cash_shortage,
    cash_surplus: input.cash_surplus,
    delivery: input.delivery,
    purchases: input.purchases,
    other: input.other_deduction,
    violations: input.violations,
    total_deductions: totalDeductions,
  };
}

// ━━━ SECTION 7: Termination Entitlements ━━━
export function calculateTerminationEntitlements(
  emp: MalakiEmployee,
  terminationDate: Date
) {
  const start = new Date(emp.start_date);
  const lawChangeDate = new Date("2024-07-01");
  const periodStart = start > lawChangeDate ? start : lawChangeDate;
  const monthsAfterLaw = differenceInMonths(terminationDate, periodStart);
  const totalMonths = differenceInMonths(terminationDate, start);

  const vacationBalance = emp.annual_leave_balance || 0;
  const vacationPay = vacationBalance * 9.6 * 8;

  const severance =
    totalMonths >= 12 ? (2000 * monthsAfterLaw) / (3 * 12) : 0;

  return {
    vacation_pay: vacationPay,
    severance_pay: Math.max(0, severance),
    total_entitlements: vacationPay + Math.max(0, severance),
  };
}

// ━━━ MASTER: Full Payslip Calculation ━━━
export function calculateMalakiPayslip(
  emp: MalakiEmployee,
  input: MalakiMonthInput,
  year: number,
  month: number
): MalakiPayslip {
  const payrollDate = new Date(year, month - 1, 28);

  // ━━━ R0 SAFETY: Undefined salary → return a fully zeroed payslip ━━━
  // Prevents nonsense payslips like "INSURANCE = 50, base = 0, net = -50"
  // when the accountant has not yet defined the employee's salary.
  const baseSalary = Number(emp.base_salary || 0);
  const hourlyRate = Number(emp.hourly_rate || 0);
  if (baseSalary <= 0 && hourlyRate <= 0) {
    return {
      working_days: input.working_days,
      regular_hours: input.working_hours,
      overtime_hours: input.overtime_hours,
      vacation_hours: input.vacation_hours,
      annual_leave_days: input.annual_leave_days,
      sick_leave_days: input.sick_leave_days,
      attendance_salary: 0,
      annual_allowance: 0,
      admin_allowance: 0,
      food_transport_base: 0,
      food_transport_net: 0,
      family_allowance: 0,
      other_allowances: 0,
      gross_fixed: 0,
      fixed_deduction: 0,
      net_fixed: 0,
      attendance_bonus: 0,
      special_allowance: 0,
      extra_work_allowance: 0,
      entitlements: 0,
      total_earnings: 0,
      deduction_opening_balance: 0,
      deduction_loan: 0,
      deduction_new_advance: 0,
      deduction_cash_advance: 0,
      deduction_food_group: 0,
      deduction_food_individual: 0,
      deduction_cash_shortage: 0,
      deduction_cash_surplus: 0,
      deduction_delivery: 0,
      deduction_purchases: 0,
      deduction_other: 0,
      deduction_violations: 0,
      total_deductions: 0,
      net_salary: 0,
      carry_over_balance: 0,
    } as MalakiPayslip;
  }

  // 1. Hourly salary
  const hourly = calculateHourlySalary(emp, input);

  // 2. Fixed component
  const fixed = calculateFixed(emp, payrollDate);
  const foodTransportNet = calculateFoodTransportNet(
    fixed.foodTransportBase,
    input.working_days
  );
  const familyAllowance = calculateFamilyAllowance(emp, fixed.monthsEmployed);
  const otherAllowances = emp.other_allowances || 0;

  // Other allowances for deduction calc (excludes food/transport)
  const otherAllowancesOnly =
    fixed.annualAllowance + fixed.adminAllowance + familyAllowance + otherAllowances;

  const grossFixed =
    fixed.annualAllowance +
    fixed.adminAllowance +
    foodTransportNet +
    familyAllowance +
    otherAllowances +
    fixed.transferAllowance;

  // 3. Fixed deduction
  const fixedDeduction = calculateFixedDeduction(
    input.working_days,
    input.annual_leave_days,
    otherAllowancesOnly
  );

  const netFixed = foodTransportNet + otherAllowancesOnly - fixedDeduction;

  // 4. Attendance bonus
  const attendanceBonus = calculateAttendanceBonus(input.working_days);

  // 5. Deductions
  const deductions = calculateDeductions(input);

  // 6. Termination entitlements
  let entitlements = 0;
  if (input.has_termination_pay && emp.is_terminated && emp.terminated_at) {
    const termResult = calculateTerminationEntitlements(
      emp,
      new Date(emp.terminated_at)
    );
    entitlements = termResult.total_entitlements;
  }

  // 7. Total earnings
  const totalEarnings =
    hourly.attendance_salary +
    netFixed +
    (input.special_allowance || 0) +
    (input.extra_work_allowance || 0) +
    attendanceBonus +
    entitlements;

  // 8. Net salary
  const netSalary = totalEarnings - deductions.total_deductions;

  return {
    working_days: input.working_days,
    regular_hours: input.working_hours,
    overtime_hours: input.overtime_hours,
    vacation_hours: input.vacation_hours,
    annual_leave_days: input.annual_leave_days,
    sick_leave_days: input.sick_leave_days,

    attendance_salary: hourly.attendance_salary,

    annual_allowance: fixed.annualAllowance,
    admin_allowance: fixed.adminAllowance,
    food_transport_base: fixed.foodTransportBase,
    food_transport_net: foodTransportNet,
    family_allowance: familyAllowance,
    other_allowances: otherAllowances,
    gross_fixed: grossFixed,
    fixed_deduction: fixedDeduction,
    net_fixed: netFixed,

    attendance_bonus: attendanceBonus,
    special_allowance: input.special_allowance || 0,
    extra_work_allowance: input.extra_work_allowance || 0,
    entitlements,

    total_earnings: totalEarnings,

    deduction_opening_balance: deductions.opening_balance,
    deduction_loan: deductions.loan_installment,
    deduction_new_advance: deductions.new_advance,
    deduction_cash_advance: deductions.cash_advances,
    deduction_food_group: deductions.food_deduction_group,
    deduction_food_individual: deductions.food_deduction_individual,
    deduction_cash_shortage: deductions.cash_shortage,
    deduction_cash_surplus: deductions.cash_surplus,
    deduction_delivery: deductions.delivery,
    deduction_purchases: deductions.purchases,
    deduction_other: deductions.other,
    deduction_violations: deductions.violations,
    total_deductions: deductions.total_deductions,

    net_salary: netSalary,
    carry_over_balance: netSalary < 0 ? Math.abs(netSalary) : 0,
  };
}

export const fmtCurrency = (n: number) =>
  `₪ ${n.toLocaleString("en", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
