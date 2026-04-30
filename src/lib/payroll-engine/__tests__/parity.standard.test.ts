/**
 * Standard Preset — Synthetic Parity Tests (S2-A.2)
 *
 * Live Test Status (recorded 2026-04-30):
 *   - hr_payroll_components is empty across all tenants.
 *   - "Lemon & Mint" company has NO row in hr_payroll_policies yet.
 *   - Live parity test on Lemon & Mint is therefore NOT POSSIBLE.
 *   - These synthetic tests validate engine correctness only.
 *   - Next step (after green): build Settings UI for policies + components
 *     + employee_payroll_profile so users can actually drive this engine.
 */

import { describe, it, expect } from 'vitest';
import { calculateStandardPreset, type StandardComponent } from '../presets/standard';
import type {
  PayrollEmployeeData,
  PayrollMonthInputs,
  PayrollPolicy,
  PayrollPeriod,
} from '../types';

const period: PayrollPeriod = { year: 2026, month: 4 };

function emp(overrides: Partial<PayrollEmployeeData> = {}): PayrollEmployeeData {
  return {
    id: 'e1',
    full_name: 'Test',
    start_date: '2024-01-01',
    hourly_rate: 25,
    base_salary: 3000,
    admin_allowance: 0,
    transfer_allowance: 0,
    food_transport_override: null,
    wives_count: 0,
    children_count: 0,
    other_allowances: 0,
    special_work_allowance: 0,
    annual_leave_balance: 0,
    annual_leave_days: 0,
    is_terminated: false,
    terminated_at: null,
    ...overrides,
  };
}

function inp(overrides: Partial<PayrollMonthInputs> = {}): PayrollMonthInputs {
  return {
    working_days: 0,
    working_hours: 0,
    overtime_hours: 0,
    holiday_overtime_hours: 0,
    vacation_hours: 0,
    annual_leave_days: 0,
    sick_leave_days: 0,
    opening_advance_balance: 0,
    loan_installment: 0,
    new_advance: 0,
    cash_advances: 0,
    food_total: 0,
    food_individual: 0,
    cash_shortage: 0,
    cash_surplus: 0,
    delivery: 0,
    purchases: 0,
    other_deduction: 0,
    violations: 0,
    deduction_notes: '',
    special_allowance: 0,
    extra_work_allowance: 0,
    has_termination_pay: false,
    ...overrides,
  };
}

function policy(overrides: Partial<PayrollPolicy> = {}): PayrollPolicy {
  return {
    id: 'p1',
    company_id: 'c1',
    name: 'Standard Test Policy',
    preset: 'standard',
    salary_basis: 'monthly',
    month_days_mode: 'fixed_30',
    month_days_custom: 0,
    daily_work_hours: 8,
    overtime_multiplier: 1.5,
    overtime_after_hours: 0,
    absence_calculation: '',
    late_calculation: '',
    late_grace_minutes: 0,
    late_per_minute_rate: 0,
    allowances_attendance_linked: false,
    deductions_mode: '',
    is_default: false,
    ...overrides,
  };
}

function comp(overrides: Partial<StandardComponent>): StandardComponent {
  return {
    id: 'cmp',
    code: 'X',
    name_ar: 'X',
    kind: 'allowance',
    calculation_type: 'fixed_amount',
    value: 0,
    formula_expression: null,
    is_attendance_linked: false,
    is_active: true,
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────────

describe('Standard Preset — Synthetic Parity', () => {
  it('1) Monthly full attendance, no components', () => {
    const r = calculateStandardPreset(
      emp({ base_salary: 3000 }),
      inp({ working_days: 30 }),
      period,
      policy(),
      { components: [] }
    );
    expect(r.attendance_salary).toBeCloseTo(3000, 2);
    expect(r.total_deductions).toBe(0);
    expect(r.net_salary).toBeCloseTo(3000, 2);
  });

  it('2) Monthly with absence (15/30 days)', () => {
    const r = calculateStandardPreset(
      emp({ base_salary: 3000 }),
      inp({ working_days: 15 }),
      period,
      policy(),
      { components: [] }
    );
    expect(r.attendance_salary).toBeCloseTo(1500, 2);
    expect(r.net_salary).toBeCloseTo(1500, 2);
  });

  it('3) Daily basis: 20 days × 100/day', () => {
    const r = calculateStandardPreset(
      emp({ base_salary: 100, hourly_rate: 0 }),
      inp({ working_days: 20 }),
      period,
      policy({ salary_basis: 'daily' }),
      { components: [] }
    );
    expect(r.attendance_salary).toBeCloseTo(2000, 2);
  });

  it('4) Hourly basis: 160h × 25/h', () => {
    const r = calculateStandardPreset(
      emp({ hourly_rate: 25 }),
      inp({ working_hours: 160 }),
      period,
      policy({ salary_basis: 'hourly' }),
      { components: [] }
    );
    expect(r.attendance_salary).toBeCloseTo(4000, 2);
  });

  it('5) Fixed allowance + fixed deduction', () => {
    const r = calculateStandardPreset(
      emp({ base_salary: 3000 }),
      inp({ working_days: 30 }),
      period,
      policy(),
      {
        components: [
          comp({ code: 'TRANSPORT', kind: 'allowance', calculation_type: 'fixed_amount', value: 200 }),
          comp({ code: 'INSURANCE', kind: 'deduction', calculation_type: 'fixed_amount', value: 50 }),
        ],
      }
    );
    expect(r.other_allowances).toBeCloseTo(200, 2);
    expect(r.total_earnings).toBeCloseTo(3200, 2);
    expect(r.total_deductions).toBeCloseTo(50, 2);
    expect(r.net_salary).toBeCloseTo(3150, 2);
  });

  it('6) Percent of basic (10% of 3000 = 300)', () => {
    const r = calculateStandardPreset(
      emp({ base_salary: 3000 }),
      inp({ working_days: 30 }),
      period,
      policy(),
      {
        components: [
          comp({ code: 'BONUS', kind: 'allowance', calculation_type: 'percent_of_basic', value: 10 }),
        ],
      }
    );
    expect(r.other_allowances).toBeCloseTo(300, 2);
    expect(r.net_salary).toBeCloseTo(3300, 2);
  });

  it('7) Overtime: 10 OT hours @ 1.5x on monthly (3000/30/8 = 12.5/h × 10 × 1.5 = 187.5)', () => {
    const r = calculateStandardPreset(
      emp({ base_salary: 3000 }),
      inp({ working_days: 30, overtime_hours: 10 }),
      period,
      policy(),
      { components: [] }
    );
    expect(r.attendance_salary).toBeCloseTo(3000 + 187.5, 2);
  });

  it('8) Attendance-linked allowance with partial month (200 × 15/30 = 100)', () => {
    const r = calculateStandardPreset(
      emp({ base_salary: 3000 }),
      inp({ working_days: 15 }),
      period,
      policy(),
      {
        components: [
          comp({
            code: 'TRANSPORT',
            kind: 'allowance',
            calculation_type: 'fixed_amount',
            value: 200,
            is_attendance_linked: true,
          }),
        ],
      }
    );
    expect(r.other_allowances).toBeCloseTo(100, 2);
    expect(r.attendance_salary).toBeCloseTo(1500, 2);
    expect(r.net_salary).toBeCloseTo(1600, 2);
  });

  it('safety: formula component is NOT executed, emits warning, contributes 0', () => {
    const r = calculateStandardPreset(
      emp({ base_salary: 3000 }),
      inp({ working_days: 30 }),
      period,
      policy(),
      {
        components: [
          comp({
            code: 'COMPLEX',
            kind: 'allowance',
            calculation_type: 'formula',
            value: 999,
            formula_expression: 'base_salary * 0.5',
          }),
        ],
      }
    );
    expect(r.other_allowances).toBe(0);
    expect(r._engine.warnings.some((w) => w.includes('formula_not_supported_yet'))).toBe(true);
  });
});