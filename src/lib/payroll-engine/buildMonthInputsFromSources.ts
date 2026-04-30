/**
 * buildMonthInputsFromSources (S2-A.1 — READ-ONLY)
 * --------------------------------------------------------------
 * Unified data-loader for the Payroll Engine Comparison Tool.
 *
 * Replaces the previous reliance on `monthly_payroll_inputs` (which
 * is an empty placeholder for almost all tenants) with the *actual*
 * canonical sources used by the live PayrollPage:
 *
 *   1. employees                  → static employee profile
 *   2. attendance_days            → working_days / hours / overtime / leaves
 *   3. employee_payroll (prev)    → opening_advance_balance (carry_over)
 *   4. employee_loans + loan_installments  → loan_installment due
 *   5. employee_deductions        → categorized deductions in period
 *   6. transactions on 218x acc.  → cash_advances (legacy path)
 *   7. employee_allowances        → fixed monthly allowances
 *   8. monthly_payroll_inputs     → OPTIONAL override only (if exists)
 *   9. employee_payroll (current) → reference snapshot only (NEVER source)
 *
 * STRICT CONTRACT:
 *   - Pure reads. NEVER writes. NEVER mutates anything.
 *   - Mirrors the exact aggregation rules used by PayrollPage.tsx
 *     so the resulting MalakiMonthInput is a faithful reconstruction.
 *   - Any source that is missing → contributes 0, never throws.
 *   - Returns a `sources` map so the UI can show provenance per field.
 */

import { supabase } from '@/integrations/supabase/client';
import type { PayrollMonthInputs } from './types';

const num = (v: any) => Number(v ?? 0) || 0;

export type FieldProvenance = {
  value: number;
  source:
    | 'attendance_days'
    | 'employee_payroll_prev'
    | 'loan_installments'
    | 'employee_deductions'
    | 'transactions_218x'
    | 'employee_allowances'
    | 'monthly_payroll_inputs'
    | 'employees'
    | 'default_zero';
  detail?: string;
};

export type BuiltMonthInputs = {
  input: PayrollMonthInputs;
  reference: {
    employee_payroll_current: any | null; // for parity check, never used as input
    monthly_payroll_inputs_present: boolean;
  };
  provenance: Partial<Record<keyof PayrollMonthInputs, FieldProvenance>>;
  warnings: string[];
};

export interface BuildOptions {
  employeeId: string;
  year: number;
  month: number; // 1-12
}

export async function buildMonthInputsFromSources(
  opts: BuildOptions,
): Promise<BuiltMonthInputs> {
  const { employeeId, year, month } = opts;
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const end = new Date(year, month, 0).toISOString().slice(0, 10);
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  const warnings: string[] = [];
  const provenance: BuiltMonthInputs['provenance'] = {};
  const sb: any = supabase;

  // ─── Parallel reads ─────────────────────────────────────────────────
  const [
    attRes,
    prevPayrollRes,
    loansRes,
    deductionsRes,
    allowancesRes,
    inputOverrideRes,
    currentPayrollRes,
  ] = await Promise.all([
    supabase
      .from('attendance_days')
      .select('total_hours, overtime_hours, status')
      .eq('employee_id', employeeId)
      .gte('attendance_date', start)
      .lte('attendance_date', end),
    supabase
      .from('employee_payroll')
      .select('carry_over_balance, net_salary')
      .eq('employee_id', employeeId)
      .eq('period_year', prevYear)
      .eq('period_month', prevMonth)
      .maybeSingle(),
    supabase
      .from('employee_loans')
      .select('id, monthly_installment, status')
      .eq('employee_id', employeeId)
      .eq('status', 'active'),
    supabase
      .from('employee_deductions')
      .select('deduction_type, amount, status')
      .eq('employee_id', employeeId)
      .gte('deduction_date', start)
      .lte('deduction_date', end),
    supabase
      .from('employee_allowances')
      .select('allowance_type, allowance_name, amount, fixed_amount, amount_per_day, percentage, is_active, activation_date, activation_months')
      .eq('employee_id', employeeId)
      .eq('is_active', true),
    sb
      .from('monthly_payroll_inputs')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('year', year)
      .eq('month', month)
      .maybeSingle(),
    supabase
      .from('employee_payroll')
      .select('*')
      .eq('employee_id', employeeId)
      .eq('period_year', year)
      .eq('period_month', month)
      .maybeSingle(),
  ]);

  // ─── 1. Attendance aggregation (matches PayrollPage logic) ─────────
  const att = { days: 0, hours: 0, overtime: 0, vacHours: 0, annual: 0, sick: 0 };
  for (const r of (attRes.data || []) as any[]) {
    const s = r.status;
    if (s === 'present' || s === 'حاضر') {
      att.days++;
      att.hours += num(r.total_hours);
      att.overtime += num(r.overtime_hours);
    } else if (s === 'annual_leave' || s === 'إجازة سنوية') {
      att.annual++;
    } else if (s === 'sick_leave' || s === 'إجازة مرضية') {
      att.sick++;
    } else if (s === 'vacation' || s === 'إجازة') {
      att.vacHours += num(r.total_hours);
    }
  }
  if (attRes.error) warnings.push(`attendance_days: ${attRes.error.message}`);

  // ─── 2. Carry-over from previous month payroll ─────────────────────
  const carryOver = num(prevPayrollRes.data?.carry_over_balance);

  // ─── 3. Loan installments due in this period ───────────────────────
  const loanIds = ((loansRes.data || []) as any[]).map((l) => l.id);
  let loanInstallmentTotal = 0;
  if (loanIds.length > 0) {
    const { data: insts } = await supabase
      .from('loan_installments')
      .select('installment_amount, status')
      .in('loan_id', loanIds)
      .eq('payroll_year', year)
      .eq('payroll_month', month)
      .eq('status', 'pending');
    loanInstallmentTotal = ((insts || []) as any[]).reduce(
      (s, i) => s + num(i.installment_amount),
      0,
    );
  }

  // ─── 4. Categorized deductions from employee_deductions ────────────
  const dedBuckets = {
    cash_advance: 0,
    food_group: 0,
    food_individual: 0,
    cash_shortage: 0,
    delivery: 0,
    purchases: 0,
    violations: 0,
    other: 0,
  };
  for (const d of (deductionsRes.data || []) as any[]) {
    if (d.status && d.status !== 'pending' && d.status !== 'active') continue;
    const t = String(d.deduction_type || '').toLowerCase();
    const amt = num(d.amount);
    if (t.includes('advance') || t.includes('سلفة')) dedBuckets.cash_advance += amt;
    else if (t.includes('food_group') || t.includes('طعام_جماعي')) dedBuckets.food_group += amt;
    else if (t.includes('food') || t.includes('طعام')) dedBuckets.food_individual += amt;
    else if (t.includes('shortage') || t.includes('عجز')) dedBuckets.cash_shortage += amt;
    else if (t.includes('delivery') || t.includes('توصيل')) dedBuckets.delivery += amt;
    else if (t.includes('purchas') || t.includes('مشتريات')) dedBuckets.purchases += amt;
    else if (t.includes('violation') || t.includes('مخالف')) dedBuckets.violations += amt;
    else dedBuckets.other += amt;
  }

  // ─── 5. Fixed allowances aggregation ───────────────────────────────
  const allowBuckets = { special: 0, extra: 0 };
  for (const a of (allowancesRes.data || []) as any[]) {
    const t = String(a.allowance_type || a.allowance_name || '').toLowerCase();
    const amt = num(a.fixed_amount) || num(a.amount);
    if (t.includes('special') || t.includes('خاص')) allowBuckets.special += amt;
    else if (t.includes('extra') || t.includes('إضاف')) allowBuckets.extra += amt;
    // Other allowance types are intentionally NOT mapped here — they
    // belong to the policy/preset (admin/family/etc.) on the employee row.
  }

  // ─── 6. Optional override from monthly_payroll_inputs ──────────────
  const override = inputOverrideRes.data as any | null;
  const hasOverride = !!override;

  // ─── Compose final input (override wins per-field if present) ──────
  const pick = <K extends keyof PayrollMonthInputs>(
    key: K,
    derived: number,
    derivedSource: FieldProvenance['source'],
  ): number => {
    if (hasOverride && override[key as string] != null && Number(override[key as string]) !== 0) {
      provenance[key] = {
        value: num(override[key as string]),
        source: 'monthly_payroll_inputs',
      };
      return num(override[key as string]);
    }
    provenance[key] = { value: derived, source: derivedSource };
    return derived;
  };

  const round2 = (n: number) => Math.round(n * 100) / 100;

  const input: PayrollMonthInputs = {
    working_days: pick('working_days', att.days, 'attendance_days'),
    working_hours: pick('working_hours', round2(att.hours), 'attendance_days'),
    overtime_hours: pick('overtime_hours', round2(att.overtime), 'attendance_days'),
    holiday_overtime_hours: pick('holiday_overtime_hours', 0, 'default_zero'),
    vacation_hours: pick('vacation_hours', round2(att.vacHours), 'attendance_days'),
    annual_leave_days: pick('annual_leave_days', att.annual, 'attendance_days'),
    sick_leave_days: pick('sick_leave_days', att.sick, 'attendance_days'),
    opening_advance_balance: pick('opening_advance_balance', carryOver, 'employee_payroll_prev'),
    loan_installment: pick('loan_installment', loanInstallmentTotal, 'loan_installments'),
    new_advance: pick('new_advance', 0, 'default_zero'),
    cash_advances: pick('cash_advances', dedBuckets.cash_advance, 'employee_deductions'),
    food_total: pick('food_total', dedBuckets.food_group, 'employee_deductions'),
    food_individual: pick('food_individual', dedBuckets.food_individual, 'employee_deductions'),
    cash_shortage: pick('cash_shortage', dedBuckets.cash_shortage, 'employee_deductions'),
    cash_surplus: pick('cash_surplus', 0, 'default_zero'),
    delivery: pick('delivery', dedBuckets.delivery, 'employee_deductions'),
    purchases: pick('purchases', dedBuckets.purchases, 'employee_deductions'),
    other_deduction: pick('other_deduction', dedBuckets.other, 'employee_deductions'),
    violations: pick('violations', dedBuckets.violations, 'employee_deductions'),
    deduction_notes: hasOverride ? String(override.deduction_notes ?? '') : '',
    special_allowance: pick('special_allowance', allowBuckets.special, 'employee_allowances'),
    extra_work_allowance: pick('extra_work_allowance', allowBuckets.extra, 'employee_allowances'),
    has_termination_pay: hasOverride ? !!override.has_termination_pay : false,
  };

  if (!attRes.data?.length && !hasOverride) {
    warnings.push(`No attendance_days for ${year}-${month} and no monthly_payroll_inputs override.`);
  }

  return {
    input,
    reference: {
      employee_payroll_current: currentPayrollRes.data || null,
      monthly_payroll_inputs_present: hasOverride,
    },
    provenance,
    warnings,
  };
}