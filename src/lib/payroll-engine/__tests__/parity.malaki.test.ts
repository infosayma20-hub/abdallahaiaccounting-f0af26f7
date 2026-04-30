/**
 * A.3 — Synthetic Parity Tests (S2-A.1)
 * --------------------------------------------------------------
 * Compares calculatePayslip (new generic engine, preset='malaki')
 * vs calculateMalakiPayslip (legacy engine) on 6 hand-crafted scenarios.
 *
 * Goal: prove the new engine is a bit-for-bit mirror of the legacy
 * engine for all standard Malaki cases. Any diff > 0.01 ₪ fails.
 *
 * NO DB. NO React. Pure functions only.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateMalakiPayslip,
  type MalakiEmployee,
  type MalakiMonthInput,
} from '@/lib/malaki-payroll';
import { calculatePayslip } from '@/lib/payroll-engine/calculator';
import type {
  PayrollEmployeeData,
  PayrollMonthInputs,
  PayrollPolicy,
} from '@/lib/payroll-engine/types';

const malakiPolicy: PayrollPolicy = {
  id: 'test-policy',
  company_id: 'test-co',
  name: 'Malaki Test Policy',
  preset: 'malaki',
  salary_basis: 'monthly',
  month_days_mode: 'fixed_28',
  month_days_custom: 28,
  daily_work_hours: 10,
  overtime_multiplier: 1.5,
  overtime_after_hours: 10,
  absence_calculation: '',
  late_calculation: '',
  late_grace_minutes: 0,
  late_per_minute_rate: 0,
  allowances_attendance_linked: true,
  deductions_mode: '',
  is_default: true,
};

function baseEmp(overrides: Partial<MalakiEmployee> = {}): MalakiEmployee & PayrollEmployeeData {
  return {
    id: 'e1',
    full_name: 'موظف تجريبي',
    start_date: '2023-01-01', // 3+ years tenure → activates food_transport + family
    hourly_rate: 12,
    base_salary: 3500,
    admin_allowance: 0,
    transfer_allowance: 0,
    food_transport_override: null,
    wives_count: 0,
    children_count: 0,
    other_allowances: 0,
    special_work_allowance: 0,
    annual_leave_balance: 0,
    annual_leave_days: 14,
    is_terminated: false,
    terminated_at: null,
    ...overrides,
  };
}

function baseInput(overrides: Partial<MalakiMonthInput> = {}): MalakiMonthInput & PayrollMonthInputs {
  return {
    working_days: 24,
    working_hours: 240,
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

const FIELDS = [
  'attendance_salary',
  'annual_allowance',
  'admin_allowance',
  'food_transport_base',
  'food_transport_net',
  'family_allowance',
  'other_allowances',
  'gross_fixed',
  'fixed_deduction',
  'net_fixed',
  'attendance_bonus',
  'special_allowance',
  'extra_work_allowance',
  'entitlements',
  'total_earnings',
  'deduction_opening_balance',
  'deduction_loan',
  'deduction_new_advance',
  'deduction_cash_advance',
  'deduction_food_group',
  'deduction_food_individual',
  'deduction_cash_shortage',
  'deduction_delivery',
  'deduction_purchases',
  'deduction_other',
  'deduction_violations',
  'total_deductions',
  'net_salary',
  'carry_over_balance',
] as const;

function expectParity(emp: any, input: any, year: number, month: number) {
  const legacy = calculateMalakiPayslip(emp, input, year, month);
  const generic = calculatePayslip(emp, input, { year, month }, malakiPolicy);
  for (const f of FIELDS) {
    const a = Number((legacy as any)[f] ?? 0);
    const b = Number((generic as any)[f] ?? 0);
    expect(
      Math.abs(a - b) < 0.01,
      `Field "${f}" diverged: legacy=${a.toFixed(4)} vs generic=${b.toFixed(4)} (Δ=${(b - a).toFixed(4)})`,
    ).toBe(true);
  }
}

describe('Payroll Engine Parity — Malaki preset (A.3)', () => {
  it('Scenario 1: موظف شهري كامل بدون أي خصومات/إضافات', () => {
    expectParity(baseEmp(), baseInput(), 2025, 6);
  });

  it('Scenario 2: غياب (12 يوم عمل فقط) → fixed_deduction يُفعَّل', () => {
    expectParity(
      baseEmp(),
      baseInput({ working_days: 12, working_hours: 120 }),
      2025,
      6,
    );
  });

  it('Scenario 3: عمل إضافي عادي + إضافي عطل', () => {
    expectParity(
      baseEmp(),
      baseInput({
        working_days: 26,
        working_hours: 260,
        overtime_hours: 20,
        holiday_overtime_hours: 8,
      }),
      2025,
      6,
    );
  });

  it('Scenario 4: موظف متزوج + 3 أطفال (أقدمية 3 سنوات → family_allowance مفعّل)', () => {
    expectParity(
      baseEmp({ wives_count: 1, children_count: 3, admin_allowance: 200 }),
      baseInput(),
      2025,
      6,
    );
  });

  it('Scenario 5: سلف + قرض + خصومات طعام/مخالفات', () => {
    expectParity(
      baseEmp(),
      baseInput({
        opening_advance_balance: 250,
        loan_installment: 300,
        new_advance: 100,
        cash_advances: 150,
        food_total: 80,
        food_individual: 40,
        violations: 50,
        delivery: 30,
      }),
      2025,
      6,
    );
  });

  it('Scenario 6a: موظف جديد (بدأ هذا الشهر) → بدون food_transport/family/annual', () => {
    expectParity(
      baseEmp({ start_date: '2025-06-01' }),
      baseInput({ working_days: 20, working_hours: 200 }),
      2025,
      6,
    );
  });

  it('Scenario 6b: إنهاء خدمة بعد 4 سنوات + رصيد إجازات', () => {
    expectParity(
      baseEmp({
        start_date: '2021-06-01',
        is_terminated: true,
        terminated_at: '2025-06-30',
        annual_leave_balance: 14,
      }),
      baseInput({ has_termination_pay: true }),
      2025,
      6,
    );
  });

  it('Scenario edge: غياب كامل (0 أيام) لا يكسر الحساب', () => {
    expectParity(
      baseEmp(),
      baseInput({ working_days: 0, working_hours: 0 }),
      2025,
      6,
    );
  });
});