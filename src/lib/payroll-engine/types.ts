/**
 * Payroll Engine — Generic Types (S2-A)
 * 
 * Pure data contracts. No business logic, no I/O.
 * Used by usePayrollCalculator (read-only adapter, not wired into any UI yet).
 */

export interface PayrollEmployeeData {
  id: string;
  full_name: string;
  start_date: string;
  hourly_rate: number;
  base_salary: number;
  // Malaki-specific allowances (kept for preset compatibility — generic engine ignores unknown fields)
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

export interface PayrollMonthInputs {
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

export interface PayrollPolicy {
  id: string;
  company_id: string;
  name: string;
  preset: 'malaki' | 'standard' | 'custom';
  salary_basis: 'monthly' | 'daily' | 'hourly';
  month_days_mode: 'fixed_28' | 'fixed_26' | 'fixed_30' | 'actual' | 'custom';
  month_days_custom: number;
  daily_work_hours: number;
  overtime_multiplier: number;
  overtime_after_hours: number;
  absence_calculation: string;
  late_calculation: string;
  late_grace_minutes: number;
  late_per_minute_rate: number;
  allowances_attendance_linked: boolean;
  deductions_mode: string;
  is_default: boolean;
}

export interface PayrollPeriod {
  year: number;
  month: number; // 1-12
}

export interface PayslipResult {
  // Mirrors MalakiPayslip exactly so comparison is line-by-line
  working_days: number;
  regular_hours: number;
  overtime_hours: number;
  vacation_hours: number;
  annual_leave_days: number;
  sick_leave_days: number;

  attendance_salary: number;

  annual_allowance: number;
  admin_allowance: number;
  food_transport_base: number;
  food_transport_net: number;
  family_allowance: number;
  other_allowances: number;
  gross_fixed: number;
  fixed_deduction: number;
  net_fixed: number;

  attendance_bonus: number;
  special_allowance: number;
  extra_work_allowance: number;
  entitlements: number;

  total_earnings: number;

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

  net_salary: number;
  carry_over_balance: number;

  // Engine metadata (NEW — not in MalakiPayslip)
  _engine: {
    preset: string;
    policy_id: string;
    policy_name: string;
    rules_applied: string[];
  };
}