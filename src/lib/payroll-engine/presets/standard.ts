/**
 * Standard Payroll Preset (S2-A.2 — Generic, Read-Only)
 *
 * Purpose:
 *   Generic payroll calculation driven entirely by:
 *     - hr_payroll_policies (root rules: salary_basis, month_days, overtime, ...)
 *     - hr_payroll_components (allowances + deductions, structured calc only)
 *
 *   ZERO Malaki-specific logic. ZERO eval. ZERO writes.
 *
 * Supported component calculation_type values (whitelist):
 *   - 'fixed_amount'       → uses component.value as-is
 *   - 'percent_of_basic'   → value% × base_salary
 *   - 'percent_of_gross'   → value% × (attendance_salary + sum(allowances_so_far))
 *   - 'per_day'            → value × working_days
 *   - 'per_hour'           → value × working_hours
 *
 * Anything else (e.g. calculation_type='formula' with formula_expression)
 * is INTENTIONALLY NOT EXECUTED. We log a warning `formula_not_supported_yet`
 * and treat the component value as 0. Provenance is preserved.
 *
 * IMPORTANT — Live data status (recorded 2026-04-30):
 *   - hr_payroll_components table is EMPTY across the whole tenant base.
 *   - "Lemon & Mint" company has no row in hr_payroll_policies yet.
 *   - Therefore Live Parity Tests cannot run yet — only Synthetic tests.
 *   - Settings UI to define policies/components/profiles is the next step
 *     after this preset is validated.
 */

import type {
  PayrollEmployeeData,
  PayrollMonthInputs,
  PayrollPeriod,
  PayrollPolicy,
  PayslipResult,
} from '../types';

// ─── Component contract ──────────────────────────────────────────
// Mirrors hr_payroll_components row shape (only fields the engine needs).
export interface StandardComponent {
  id: string;
  code: string;
  name_ar: string | null;
  kind: 'allowance' | 'deduction';
  calculation_type: string; // whitelisted at runtime
  value: number;
  formula_expression: string | null;
  is_attendance_linked: boolean;
  is_active: boolean;
}

// Allowed structured calc types (anything else → warning, value=0)
const SUPPORTED_CALC_TYPES = new Set([
  'fixed_amount',
  'percent_of_basic',
  'percent_of_gross',
  'per_day',
  'per_hour',
]);

// ─── Helpers ─────────────────────────────────────────────────────
function resolveMonthDays(policy: PayrollPolicy, period: PayrollPeriod): number {
  switch (policy.month_days_mode) {
    case 'fixed_26':
      return 26;
    case 'fixed_28':
      return 28;
    case 'fixed_30':
      return 30;
    case 'actual':
      return new Date(period.year, period.month, 0).getDate();
    case 'custom':
      return policy.month_days_custom > 0 ? policy.month_days_custom : 30;
    default:
      return 30;
  }
}

function computeAttendanceSalary(
  emp: PayrollEmployeeData,
  input: PayrollMonthInputs,
  policy: PayrollPolicy,
  monthDays: number,
  rules: string[]
): number {
  const basis = policy.salary_basis;
  const dailyHours = policy.daily_work_hours > 0 ? policy.daily_work_hours : 8;
  const overtimeMult = policy.overtime_multiplier > 0 ? policy.overtime_multiplier : 1.5;

  if (basis === 'monthly') {
    // Pro-rate base_salary by working_days/monthDays
    const base = Number(emp.base_salary || 0);
    const dailyRate = base / monthDays;
    const baseEarned = dailyRate * input.working_days;

    // Overtime: derived hourly rate from monthly base
    const derivedHourlyRate = base / monthDays / dailyHours;
    const otPay = input.overtime_hours * derivedHourlyRate * overtimeMult;

    rules.push(
      `monthly: base=${base} ÷ ${monthDays}d = ${dailyRate.toFixed(2)}/d × ${input.working_days}d = ${baseEarned.toFixed(2)}; OT ${input.overtime_hours}h × ${derivedHourlyRate.toFixed(2)} × ${overtimeMult} = ${otPay.toFixed(2)}`
    );
    return baseEarned + otPay;
  }

  if (basis === 'daily') {
    // hourly_rate field (re-purposed for daily presets) OR base_salary as daily
    const dailyRate = Number(emp.base_salary || emp.hourly_rate || 0);
    const baseEarned = dailyRate * input.working_days;
    const otPay = input.overtime_hours * (dailyRate / dailyHours) * overtimeMult;
    rules.push(
      `daily: ${dailyRate}/d × ${input.working_days}d = ${baseEarned.toFixed(2)}; OT ${input.overtime_hours}h × ${(dailyRate / dailyHours).toFixed(2)} × ${overtimeMult} = ${otPay.toFixed(2)}`
    );
    return baseEarned + otPay;
  }

  // hourly
  const hr = Number(emp.hourly_rate || 0);
  const basePay = input.working_hours * hr;
  const otPay = input.overtime_hours * hr * overtimeMult;
  rules.push(
    `hourly: ${input.working_hours}h × ${hr} = ${basePay.toFixed(2)}; OT ${input.overtime_hours}h × ${hr} × ${overtimeMult} = ${otPay.toFixed(2)}`
  );
  return basePay + otPay;
}

function evalComponent(
  c: StandardComponent,
  ctx: { base_salary: number; working_days: number; working_hours: number; gross_so_far: number }
): { amount: number; warning?: string } {
  if (!SUPPORTED_CALC_TYPES.has(c.calculation_type)) {
    return {
      amount: 0,
      warning: `formula_not_supported_yet: component "${c.code}" calc="${c.calculation_type}"`,
    };
  }
  const v = Number(c.value || 0);
  switch (c.calculation_type) {
    case 'fixed_amount':
      return { amount: v };
    case 'percent_of_basic':
      return { amount: (v / 100) * ctx.base_salary };
    case 'percent_of_gross':
      return { amount: (v / 100) * ctx.gross_so_far };
    case 'per_day':
      return { amount: v * ctx.working_days };
    case 'per_hour':
      return { amount: v * ctx.working_hours };
    default:
      return { amount: 0, warning: `unhandled_calc_type: ${c.calculation_type}` };
  }
}

// ─── Main entry ──────────────────────────────────────────────────
export interface StandardPresetOptions {
  components: StandardComponent[]; // pre-loaded for the policy
}

export function calculateStandardPreset(
  emp: PayrollEmployeeData,
  input: PayrollMonthInputs,
  period: PayrollPeriod,
  policy: PayrollPolicy,
  opts: StandardPresetOptions
): PayslipResult & { _engine: PayslipResult['_engine'] & { warnings: string[]; component_breakdown: Array<{ code: string; kind: string; amount: number; source: string }> } } {
  const rules: string[] = [];
  const warnings: string[] = [];
  const breakdown: Array<{ code: string; kind: string; amount: number; source: string }> = [];

  const monthDays = resolveMonthDays(policy, period);
  rules.push(`policy.month_days_mode=${policy.month_days_mode} → ${monthDays}d`);

  // ─ Attendance-driven base earning ─
  const attendance_salary = computeAttendanceSalary(emp, input, policy, monthDays, rules);

  // Attendance ratio (for is_attendance_linked components)
  const attendanceRatio = monthDays > 0 ? Math.min(1, input.working_days / monthDays) : 1;

  // ─ Components ─
  const active = (opts.components || []).filter((c) => c.is_active);
  let totalAllowances = 0;
  let totalDeductions = 0;

  for (const c of active) {
    const { amount, warning } = evalComponent(c, {
      base_salary: Number(emp.base_salary || 0),
      working_days: input.working_days,
      working_hours: input.working_hours,
      gross_so_far: attendance_salary + totalAllowances,
    });
    if (warning) warnings.push(warning);

    const finalAmount = c.is_attendance_linked ? amount * attendanceRatio : amount;
    const sourceTag = warning
      ? 'unsupported_calc'
      : c.is_attendance_linked
      ? `${c.calculation_type}_×_attendance_ratio(${attendanceRatio.toFixed(2)})`
      : c.calculation_type;

    breakdown.push({ code: c.code, kind: c.kind, amount: finalAmount, source: sourceTag });

    if (c.kind === 'allowance') totalAllowances += finalAmount;
    else totalDeductions += finalAmount;
  }

  // ─ Generic input deductions (sources from buildMonthInputsFromSources) ─
  const inputDeductions =
    Number(input.opening_advance_balance || 0) +
    Number(input.loan_installment || 0) +
    Number(input.new_advance || 0) +
    Number(input.cash_advances || 0) +
    Number(input.cash_shortage || 0) +
    Number(input.delivery || 0) +
    Number(input.purchases || 0) +
    Number(input.other_deduction || 0) +
    Number(input.violations || 0) +
    Number(input.food_total || 0) +
    Number(input.food_individual || 0);

  const total_deductions = totalDeductions + inputDeductions;

  // ─ Other input-driven additions ─
  const special_allowance = Number(input.special_allowance || 0);
  const extra_work_allowance = Number(input.extra_work_allowance || 0);

  const total_earnings = attendance_salary + totalAllowances + special_allowance + extra_work_allowance;
  const net_salary = total_earnings - total_deductions;

  return {
    working_days: input.working_days,
    regular_hours: input.working_hours,
    overtime_hours: input.overtime_hours,
    vacation_hours: input.vacation_hours,
    annual_leave_days: input.annual_leave_days,
    sick_leave_days: input.sick_leave_days,

    attendance_salary,

    // Malaki-specific fields → 0 in standard preset
    annual_allowance: 0,
    admin_allowance: 0,
    food_transport_base: 0,
    food_transport_net: 0,
    family_allowance: 0,
    other_allowances: totalAllowances, // expose component allowances aggregated here
    gross_fixed: totalAllowances,
    fixed_deduction: 0,
    net_fixed: totalAllowances,

    attendance_bonus: 0,
    special_allowance,
    extra_work_allowance,
    entitlements: 0,

    total_earnings,

    deduction_opening_balance: Number(input.opening_advance_balance || 0),
    deduction_loan: Number(input.loan_installment || 0),
    deduction_new_advance: Number(input.new_advance || 0),
    deduction_cash_advance: Number(input.cash_advances || 0),
    deduction_food_group: Number(input.food_total || 0),
    deduction_food_individual: Number(input.food_individual || 0),
    deduction_cash_shortage: Number(input.cash_shortage || 0),
    deduction_cash_surplus: Number(input.cash_surplus || 0),
    deduction_delivery: Number(input.delivery || 0),
    deduction_purchases: Number(input.purchases || 0),
    deduction_other: Number(input.other_deduction || 0),
    deduction_violations: Number(input.violations || 0),
    total_deductions,

    net_salary,
    carry_over_balance: net_salary < 0 ? Math.abs(net_salary) : 0,

    _engine: {
      preset: 'standard',
      policy_id: policy.id,
      policy_name: policy.name,
      rules_applied: rules,
      warnings,
      component_breakdown: breakdown,
    },
  };
}