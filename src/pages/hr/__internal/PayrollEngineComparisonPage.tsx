/**
 * Payroll Engine Comparison Tool (S2-A — Internal/Admin only)
 * 
 * Route: /hr/__engine-comparison
 * Purpose: Validate that the new generic engine produces IDENTICAL output
 *          to calculateMalakiPayslip for real employee data.
 * 
 * Read-only. No mutations. Not linked from any nav.
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calculateMalakiPayslip, type MalakiEmployee, type MalakiMonthInput } from '@/lib/malaki-payroll';
import { calculatePayslipWithPolicy, loadPolicyForEmployee } from '@/hooks/hr/usePayrollCalculator';
import type { PayrollEmployeeData, PayrollMonthInputs, PayslipResult } from '@/lib/payroll-engine/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

type DiffRow = {
  employee_id: string;
  employee_name: string;
  field: string;
  malaki: number;
  generic: number;
  diff: number;
};

type RowResult = {
  employee_id: string;
  employee_name: string;
  status: 'match' | 'diff' | 'error' | 'no-policy' | 'no-input';
  message?: string;
  malaki?: any;
  generic?: PayslipResult;
  diffs: DiffRow[];
};

function toEmployeeData(emp: any): PayrollEmployeeData & MalakiEmployee {
  return {
    id: emp.id,
    full_name: emp.full_name,
    start_date: emp.start_date ?? new Date().toISOString().slice(0, 10),
    hourly_rate: Number(emp.hourly_rate ?? 0),
    base_salary: Number(emp.base_salary ?? 0),
    admin_allowance: Number(emp.admin_allowance ?? 0),
    transfer_allowance: Number(emp.transfer_allowance ?? 0),
    food_transport_override: emp.food_transport_override == null ? null : Number(emp.food_transport_override),
    wives_count: Number(emp.wives_count ?? 0),
    children_count: Number(emp.children_count ?? 0),
    other_allowances: Number(emp.other_allowances ?? 0),
    special_work_allowance: Number(emp.special_work_allowance ?? 0),
    annual_leave_balance: Number(emp.annual_leave_balance ?? 0),
    annual_leave_days: Number(emp.annual_leave_days ?? 0),
    is_terminated: !!emp.is_terminated,
    terminated_at: emp.terminated_at ?? null,
  };
}

function toMonthInput(row: any): PayrollMonthInputs & MalakiMonthInput {
  return {
    working_days: Number(row?.working_days ?? 0),
    working_hours: Number(row?.working_hours ?? 0),
    overtime_hours: Number(row?.overtime_hours ?? 0),
    holiday_overtime_hours: Number(row?.holiday_overtime_hours ?? 0),
    vacation_hours: Number(row?.vacation_hours ?? 0),
    annual_leave_days: Number(row?.annual_leave_days ?? 0),
    sick_leave_days: Number(row?.sick_leave_days ?? 0),
    opening_advance_balance: Number(row?.opening_advance_balance ?? 0),
    loan_installment: Number(row?.loan_installment ?? 0),
    new_advance: Number(row?.new_advance ?? 0),
    cash_advances: Number(row?.cash_advances ?? 0),
    food_total: Number(row?.food_total ?? 0),
    food_individual: Number(row?.food_individual ?? 0),
    cash_shortage: Number(row?.cash_shortage ?? 0),
    cash_surplus: Number(row?.cash_surplus ?? 0),
    delivery: Number(row?.delivery ?? 0),
    purchases: Number(row?.purchases ?? 0),
    other_deduction: Number(row?.other_deduction ?? 0),
    violations: Number(row?.violations ?? 0),
    deduction_notes: row?.deduction_notes ?? '',
    special_allowance: Number(row?.special_allowance ?? 0),
    extra_work_allowance: Number(row?.extra_work_allowance ?? 0),
    has_termination_pay: !!row?.has_termination_pay,
  };
}

const COMPARE_FIELDS: (keyof PayslipResult)[] = [
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
];

const EPSILON = 0.01;

export default function PayrollEngineComparisonPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [limit, setLimit] = useState(15);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);

  const { data: employees, isLoading: empLoading } = useQuery({
    queryKey: ['cmp-employees', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('full_name')
        .limit(limit);
      if (error) throw error;
      return data ?? [];
    },
  });

  const summary = useMemo(() => {
    const total = results.length;
    const match = results.filter((r) => r.status === 'match').length;
    const diff = results.filter((r) => r.status === 'diff').length;
    const skipped = results.filter((r) => r.status === 'no-policy' || r.status === 'no-input').length;
    const error = results.filter((r) => r.status === 'error').length;
    return { total, match, diff, skipped, error };
  }, [results]);

  const runComparison = async () => {
    if (!employees) return;
    setRunning(true);
    setResults([]);
    const out: RowResult[] = [];

    for (const emp of employees) {
      const empData = toEmployeeData(emp);
      try {
        const loaded = await loadPolicyForEmployee(emp.id);
        if (!loaded) {
          out.push({
            employee_id: emp.id,
            employee_name: emp.full_name,
            status: 'no-policy',
            message: 'No payroll profile / policy linked',
            diffs: [],
          });
          continue;
        }

        const sb: any = supabase;
        const { data: inputRow } = await sb
          .from('monthly_payroll_inputs')
          .select('*')
          .eq('employee_id', emp.id)
          .eq('period_year', year)
          .eq('period_month', month)
          .maybeSingle();

        if (!inputRow) {
          out.push({
            employee_id: emp.id,
            employee_name: emp.full_name,
            status: 'no-input',
            message: `No monthly_payroll_inputs row for ${year}-${month}`,
            diffs: [],
          });
          continue;
        }

        const input = toMonthInput(inputRow);
        const malakiSlip = calculateMalakiPayslip(empData, input, year, month);
        const genericSlip = calculatePayslipWithPolicy(empData, input, { year, month }, loaded.policy);

        const diffs: DiffRow[] = [];
        for (const f of COMPARE_FIELDS) {
          const a = Number((malakiSlip as any)[f] ?? 0);
          const b = Number((genericSlip as any)[f] ?? 0);
          if (Math.abs(a - b) > EPSILON) {
            diffs.push({
              employee_id: emp.id,
              employee_name: emp.full_name,
              field: f as string,
              malaki: a,
              generic: b,
              diff: b - a,
            });
          }
        }

        out.push({
          employee_id: emp.id,
          employee_name: emp.full_name,
          status: diffs.length === 0 ? 'match' : 'diff',
          malaki: malakiSlip,
          generic: genericSlip,
          diffs,
        });
      } catch (e: any) {
        out.push({
          employee_id: emp.id,
          employee_name: emp.full_name,
          status: 'error',
          message: e?.message ?? String(e),
          diffs: [],
        });
      }
    }

    setResults(out);
    setRunning(false);
  };

  return (
    <div className="container mx-auto p-6 space-y-6" dir="rtl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            🧪 Payroll Engine Comparison (S2-A) — Read-Only
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            تقارن نتائج <code className="bg-muted px-1 rounded">calculateMalakiPayslip</code> مع المحرك الجديد{' '}
            <code className="bg-muted px-1 rounded">calculatePayslipWithPolicy</code> على نفس البيانات الفعلية. الفرق المسموح: ±0.01 ₪.
          </p>
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs">السنة</label>
              <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24" />
            </div>
            <div>
              <label className="text-xs">الشهر</label>
              <Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-20" />
            </div>
            <div>
              <label className="text-xs">عدد الموظفين</label>
              <Input type="number" min={1} max={100} value={limit} onChange={(e) => setLimit(Number(e.target.value))} className="w-24" />
            </div>
            <Button onClick={runComparison} disabled={running || empLoading || !employees?.length}>
              {running ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
              تشغيل المقارنة
            </Button>
          </div>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>الملخص</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-3 flex-wrap">
            <Badge variant="outline">الإجمالي: {summary.total}</Badge>
            <Badge className="bg-emerald-600">✓ مطابق: {summary.match}</Badge>
            <Badge className="bg-red-600">✗ مختلف: {summary.diff}</Badge>
            <Badge variant="secondary">— تم تخطّيه: {summary.skipped}</Badge>
            <Badge variant="destructive">! أخطاء: {summary.error}</Badge>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {results.map((r) => (
          <Card key={r.employee_id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                {r.status === 'match' && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
                {r.status === 'diff' && <XCircle className="h-5 w-5 text-red-600" />}
                {(r.status === 'no-policy' || r.status === 'no-input') && (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                )}
                {r.status === 'error' && <XCircle className="h-5 w-5 text-red-700" />}
                <CardTitle className="text-base">{r.employee_name}</CardTitle>
              </div>
              <Badge variant={r.status === 'match' ? 'default' : 'destructive'}>{r.status}</Badge>
            </CardHeader>
            {r.message && <CardContent className="text-sm text-muted-foreground">{r.message}</CardContent>}
            {r.diffs.length > 0 && (
              <CardContent>
                <table className="w-full text-sm border">
                  <thead className="bg-muted">
                    <tr>
                      <th className="p-2 text-right">الحقل</th>
                      <th className="p-2 text-right">Malaki</th>
                      <th className="p-2 text-right">Generic</th>
                      <th className="p-2 text-right">الفرق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.diffs.map((d) => (
                      <tr key={d.field} className="border-t">
                        <td className="p-2 font-mono text-xs">{d.field}</td>
                        <td className="p-2">{d.malaki.toFixed(2)}</td>
                        <td className="p-2">{d.generic.toFixed(2)}</td>
                        <td className="p-2 text-red-600 font-bold">{d.diff.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}