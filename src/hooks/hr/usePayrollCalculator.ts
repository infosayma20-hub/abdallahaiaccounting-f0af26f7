/**
 * usePayrollCalculator (S2-A — Read-Only Adapter)
 * 
 * NOT WIRED INTO ANY UI. Used only by the internal Comparison Tool
 * (/hr/__engine-comparison) to validate parity with Malaki Engine.
 * 
 * Reads policy from hr_payroll_policies via employee_payroll_profile.
 * Falls back to 'malaki' preset detection by company name pattern.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calculatePayslip } from '@/lib/payroll-engine/calculator';
import type {
  PayrollEmployeeData,
  PayrollMonthInputs,
  PayrollPeriod,
  PayrollPolicy,
  PayslipResult,
} from '@/lib/payroll-engine/types';

const VALID_PRESETS = ['standard', 'malaki', 'custom'] as const;
type EnginePreset = (typeof VALID_PRESETS)[number];

/**
 * Loads the policy for an employee. Preset is read EXCLUSIVELY from
 * hr_payroll_policies.engine_preset — never inferred from any name.
 * Throws if the DB value is not one of the allowed presets (defensive).
 */
async function loadPolicyForEmployee(employeeId: string): Promise<PayrollPolicy | null> {
  const sb: any = supabase;
  const { data: profile, error: pErr } = await sb
    .from('employee_payroll_profile')
    .select('policy_id')
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile?.policy_id) return null;

  const { data: policy, error: polErr } = await sb
    .from('hr_payroll_policies')
    .select('*')
    .eq('id', profile.policy_id)
    .single();
  if (polErr) throw polErr;

  const rawPreset = (policy as any).engine_preset;
  if (!VALID_PRESETS.includes(rawPreset)) {
    throw new Error(
      `[payroll-engine] Policy "${policy.id}" has invalid engine_preset="${rawPreset}". Expected one of: ${VALID_PRESETS.join(', ')}.`
    );
  }

  return {
    id: policy.id,
    company_id: policy.company_id,
    name: policy.name,
    preset: rawPreset as EnginePreset,
    salary_basis: policy.salary_basis as PayrollPolicy['salary_basis'],
    month_days_mode: policy.month_days_mode as PayrollPolicy['month_days_mode'],
    month_days_custom: Number(policy.month_days_custom ?? 0),
    daily_work_hours: Number(policy.daily_work_hours ?? 8),
    overtime_multiplier: Number(policy.overtime_multiplier ?? 1.5),
    overtime_after_hours: Number(policy.overtime_after_hours ?? 0),
    absence_calculation: policy.absence_calculation ?? '',
    late_calculation: policy.late_calculation ?? '',
    late_grace_minutes: Number(policy.late_grace_minutes ?? 0),
    late_per_minute_rate: Number(policy.late_per_minute_rate ?? 0),
    allowances_attendance_linked: !!policy.allowances_attendance_linked,
    deductions_mode: policy.deductions_mode ?? '',
    is_default: !!policy.is_default,
  };
}

/**
 * Pure adapter — accepts already-loaded employee + month inputs and returns a payslip.
 * Use when you already have the data (e.g. in comparison tool).
 */
export function calculatePayslipWithPolicy(
  emp: PayrollEmployeeData,
  input: PayrollMonthInputs,
  period: PayrollPeriod,
  policy: PayrollPolicy
): PayslipResult {
  return calculatePayslip(emp, input, period, policy);
}

/**
 * Hook variant: loads policy from DB then computes.
 * Returns null if employee has no payroll profile.
 */
export function usePayrollCalculator(
  emp: PayrollEmployeeData | null,
  input: PayrollMonthInputs | null,
  period: PayrollPeriod
) {
  return useQuery({
    queryKey: ['payroll-calculator-v2', emp?.id, period.year, period.month, input],
    enabled: !!emp && !!input,
    queryFn: async (): Promise<PayslipResult | null> => {
      if (!emp || !input) return null;
      const policy = await loadPolicyForEmployee(emp.id);
      if (!policy) return null;
      return calculatePayslip(emp, input, period, policy);
    },
  });
}

export { loadPolicyForEmployee };