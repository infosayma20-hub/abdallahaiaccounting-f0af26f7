/**
 * Payroll Engine Comparison Tool (S2-A.1 — Internal/Admin only)
 *
 * Route: /hr/__engine-comparison
 * Purpose: Validate that the new generic engine produces IDENTICAL output
 *          to calculateMalakiPayslip on REAL canonical sources
 *          (attendance_days + employees + loans + deductions + allowances),
 *          NOT the empty `monthly_payroll_inputs` placeholder.
 *
 * STRICT: Read-only. No DB writes. Not linked from any nav.
 * employee_payroll is shown as a *reference snapshot* only, never as an input.
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { calculateMalakiPayslip, type MalakiEmployee, type MalakiMonthInput } from '@/lib/malaki-payroll';
import { calculatePayslipWithPolicy, loadPolicyForEmployee } from '@/hooks/hr/usePayrollCalculator';
import type { PayrollEmployeeData, PayrollMonthInputs, PayslipResult } from '@/lib/payroll-engine/types';
import { buildMonthInputsFromSources, type BuiltMonthInputs } from '@/lib/payroll-engine/buildMonthInputsFromSources';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle2, XCircle, AlertTriangle, Info } from 'lucide-react';

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
  status: 'match' | 'diff' | 'error' | 'no-policy' | 'no-data';
  message?: string;
  malaki?: any;
  generic?: PayslipResult;
  diffs: DiffRow[];
  built?: BuiltMonthInputs;
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

// (toMonthInput removed — replaced by buildMonthInputsFromSources)

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
  // A.2: Default to Malaki tenant since it's the only implemented preset
  const [companyId, setCompanyId] = useState<string>('b4a221be-7b96-4952-8eb8-6ca749b46ca4');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);

  const { data: companies } = useQuery({
    queryKey: ['cmp-companies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('hr_payroll_policies')
        .select('company_id, engine_preset, companies!inner(id, name)')
        .eq('engine_preset', 'malaki');
      if (error) throw error;
      return (data || []).map((r: any) => ({
        id: r.company_id,
        name: r.companies?.name ?? r.company_id,
      }));
    },
  });

  const { data: employees, isLoading: empLoading } = useQuery({
    queryKey: ['cmp-employees', limit, companyId],
    queryFn: async () => {
      let q = supabase
        .from('employees')
        .select('*')
        .eq('is_active', true)
        .order('full_name')
        .limit(limit);
      if (companyId) q = q.eq('company_id', companyId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const summary = useMemo(() => {
    const total = results.length;
    const match = results.filter((r) => r.status === 'match').length;
    const diff = results.filter((r) => r.status === 'diff').length;
    const skipped = results.filter((r) => r.status === 'no-policy' || r.status === 'no-data').length;
    const error = results.filter((r) => r.status === 'error').length;
    return { total, match, diff, skipped, error };
  }, [results]);

  const downloadReport = () => {
    const report = {
      meta: {
        generated_at: new Date().toISOString(),
        period: { year, month },
        company_id: companyId,
        engine_version: 'S2-A.1',
        legacy: 'src/lib/malaki-payroll.ts',
        generic: "calculatePayslip(preset='malaki')",
        epsilon: EPSILON,
        sources_used: [
          'employees',
          'attendance_days',
          'employee_payroll(prev → carry_over)',
          'employee_loans + loan_installments',
          'employee_deductions',
          'employee_allowances',
          'monthly_payroll_inputs (override only, never default)',
        ],
        write_operations: 'NONE (read-only)',
      },
      summary,
      rows: results.map((r) => ({
        employee_id: r.employee_id,
        employee_name: r.employee_name,
        status: r.status,
        message: r.message,
        inputs: r.built?.input,
        provenance: r.built?.provenance,
        reference_employee_payroll_net: r.built?.reference.employee_payroll_current?.net_salary ?? null,
        legacy_net: r.malaki?.net_salary ?? null,
        generic_net: r.generic?.net_salary ?? null,
        diffs: r.diffs,
      })),
    };
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payroll-parity-${companyId.slice(0, 8)}-${year}-${String(month).padStart(2, '0')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const runComparison = async () => {
    if (!employees) return;
    setRunning(true);
    setResults([]);
    const out: RowResult[] = [];

    for (const emp of employees) {
      const empData = toEmployeeData(emp);
      try {
        const policy = await loadPolicyForEmployee(emp.id);
        if (!policy) {
          out.push({
            employee_id: emp.id,
            employee_name: emp.full_name,
            status: 'no-policy',
            message: 'No payroll profile / policy linked',
            diffs: [],
          });
          continue;
        }

        // Build month inputs from canonical sources (NOT monthly_payroll_inputs)
        const built = await buildMonthInputsFromSources({
          employeeId: emp.id,
          year,
          month,
        });

        const noSignal =
          built.input.working_days === 0 &&
          built.input.working_hours === 0 &&
          built.input.overtime_hours === 0 &&
          !built.reference.monthly_payroll_inputs_present;

        if (noSignal) {
          out.push({
            employee_id: emp.id,
            employee_name: emp.full_name,
            status: 'no-data',
            message: `لا يوجد حضور أو أي input لشهر ${year}-${month}`,
            diffs: [],
            built,
          });
          continue;
        }

        const input = built.input as PayrollMonthInputs & MalakiMonthInput;
        const malakiSlip = calculateMalakiPayslip(empData, input, year, month);
        const genericSlip = calculatePayslipWithPolicy(empData, input, { year, month }, policy);

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
          built,
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
            🧪 Payroll Engine Comparison (S2-A.1) — Read-Only
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            تقارن نتائج <code className="bg-muted px-1 rounded">calculateMalakiPayslip</code> مع المحرك الجديد{' '}
            <code className="bg-muted px-1 rounded">calculatePayslipWithPolicy</code> على نفس البيانات الفعلية. الفرق المسموح: ±0.01 ₪.
          </p>
          <div className="text-xs bg-muted/50 border rounded p-2 leading-relaxed">
            <strong>مصادر البيانات (Read-Only):</strong> employees + attendance_days + employee_payroll(prev) + employee_loans + loan_installments + employee_deductions + employee_allowances.
            <br />
            <code>monthly_payroll_inputs</code> = override اختياري فقط، و <code>employee_payroll</code> الحالي = مرجع للمقارنة (ليس مصدر حساب).
          </div>
          <div className="flex gap-3 items-end flex-wrap">
            <div>
              <label className="text-xs">الشركة (preset=malaki فقط)</label>
              <select
                className="w-72 h-9 rounded border bg-background px-2 text-sm"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
              >
                {(companies || []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
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
            <Button variant="outline" onClick={downloadReport} disabled={results.length === 0}>
              تنزيل تقرير JSON
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

      {results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>نظرة سريعة (أول 20 نتيجة)</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm border">
              <thead className="bg-muted">
                <tr>
                  <th className="p-2 text-right">#</th>
                  <th className="p-2 text-right">الموظف</th>
                  <th className="p-2 text-right">الحالة</th>
                  <th className="p-2 text-right">Malaki Net</th>
                  <th className="p-2 text-right">Generic Net</th>
                  <th className="p-2 text-right">عدد الفروقات</th>
                  <th className="p-2 text-right">السبب / الرسالة</th>
                </tr>
              </thead>
              <tbody>
                {results.slice(0, 20).map((r, i) => {
                  const isDiff = r.status === 'diff';
                  const isErr = r.status === 'error';
                  const isSkip = r.status === 'no-policy' || r.status === 'no-data';
                  const rowClass = isDiff
                    ? 'bg-red-50 dark:bg-red-950/30'
                    : isErr
                    ? 'bg-red-100 dark:bg-red-950/50'
                    : isSkip
                    ? 'bg-amber-50 dark:bg-amber-950/30'
                    : '';
                  return (
                    <tr key={r.employee_id} className={`border-t ${rowClass}`}>
                      <td className="p-2 text-xs">{i + 1}</td>
                      <td className="p-2">{r.employee_name}</td>
                      <td className="p-2">
                        <Badge
                          className={
                            r.status === 'match'
                              ? 'bg-emerald-600'
                              : isDiff
                              ? 'bg-red-600'
                              : isErr
                              ? 'bg-red-700'
                              : 'bg-amber-500'
                          }
                        >
                          {r.status}
                        </Badge>
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {r.malaki ? Number(r.malaki.net_salary).toFixed(2) : '—'}
                      </td>
                      <td className="p-2 font-mono text-xs">
                        {r.generic ? Number(r.generic.net_salary).toFixed(2) : '—'}
                      </td>
                      <td className={`p-2 font-bold ${r.diffs.length > 0 ? 'text-red-600' : ''}`}>
                        {r.diffs.length}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">{r.message ?? '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {results.length > 20 && (
              <div className="text-xs text-muted-foreground mt-2">
                يتم عرض أول 20 من أصل {results.length}. التفاصيل الكاملة في تقرير JSON.
              </div>
            )}
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
                {(r.status === 'no-policy' || r.status === 'no-data') && (
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                )}
                {r.status === 'error' && <XCircle className="h-5 w-5 text-red-700" />}
                <CardTitle className="text-base">{r.employee_name}</CardTitle>
              </div>
              <Badge variant={r.status === 'match' ? 'default' : 'destructive'}>{r.status}</Badge>
            </CardHeader>
            {r.message && <CardContent className="text-sm text-muted-foreground">{r.message}</CardContent>}
            {r.built && (r.status === 'match' || r.status === 'diff') && (
              <CardContent className="text-xs space-y-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Info className="h-3.5 w-3.5" />
                  <span>
                    Inputs: أيام={r.built.input.working_days}، ساعات={r.built.input.working_hours}، إضافي={r.built.input.overtime_hours}، قسط قرض={r.built.input.loan_installment}، رصيد سابق={r.built.input.opening_advance_balance}
                  </span>
                </div>
                {r.built.reference.employee_payroll_current && (
                  <div className="text-muted-foreground">
                    Snapshot in employee_payroll: net={Number(r.built.reference.employee_payroll_current.net_salary).toFixed(2)} (مرجع فقط)
                  </div>
                )}
                {r.built.warnings.length > 0 && (
                  <div className="text-amber-600">⚠ {r.built.warnings.join(' | ')}</div>
                )}
              </CardContent>
            )}
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