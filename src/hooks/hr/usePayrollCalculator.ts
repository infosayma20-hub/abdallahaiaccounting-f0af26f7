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

function detectPreset(policyName: string, companyName: string | null): 'malaki' | 'standard' | 'custom' {
  const haystack = `${policyName} ${companyName ?? ''}`.toLowerCase();
  if (haystack.includes('malaki') || haystack.includes('ملكي')) return 'malaki';
  return 'standard';
}

async function loadPolicyForEmployee(employeeId: string): Promise<{
  policy: PayrollPolicy;
  companyName: string | null;
} | null> {
  const { data: profile, error: pErr } = await supabase
    .from('employee_payroll_profile')
    .select('policy_id')
    .eq('employee_id', employeeId)
    .maybeSingle();
  if (pErr) throw pErr;
  if (!profile?.policy_id) return null;

  const { data: policy, error: polErr } = await supabase
    .from('hr_payroll_policies')
    .select('*, companies:company_id(name)')
    .eq('id', profile.policy_id)
    .single();
  if (polErr) throw polErr;

  const companyName = (policy as any).companies?.name ?? null;
  const preset = detectPreset(policy.name, companyName);

  return {
    policy: {
      id: policy.id,
      company_id: policy.company_id,
      name: policy.name,
      preset,
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
    },
    companyName,
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
      const loaded = await loadPolicyForEmployee(emp.id);
      if (!loaded) return null;
      return calculatePayslip(emp, input, period, loaded.policy);
    },
  });
}

export { loadPolicyForEmployee };