import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Save, ArrowRight, Loader2, Calculator } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fmtCurrency, calculateMalakiPayslip, type MalakiEmployee, type MalakiMonthInput } from "@/lib/malaki-payroll";

const months = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

const defaultInput: MalakiMonthInput = {
  working_days: 0, working_hours: 0, overtime_hours: 0,
  holiday_overtime_hours: 0, vacation_hours: 0,
  annual_leave_days: 0, sick_leave_days: 0,
  opening_advance_balance: 0, loan_installment: 0,
  new_advance: 0, cash_advances: 0,
  food_total: 0, food_individual: 0,
  cash_shortage: 0, cash_surplus: 0,
  delivery: 0, purchases: 0,
  other_deduction: 0, violations: 0,
  deduction_notes: "",
  special_allowance: 0, extra_work_allowance: 0,
  has_termination_pay: false,
};

const MonthlyPayrollInputPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [inputs, setInputs] = useState<Record<string, MalakiMonthInput>>({});
  const [saving, setSaving] = useState(false);

  const { data: employees, isLoading: loadingEmp } = useQuery({
    queryKey: ["payroll-input-employees"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*")
        .eq("is_active", true)
        .order("full_name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: existingInputs, isLoading: loadingInputs } = useQuery({
    queryKey: ["payroll-inputs", selectedMonth, selectedYear],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_payroll_inputs")
        .select("*")
        .eq("year", selectedYear)
        .eq("month", selectedMonth);
      if (error) throw error;
      return data || [];
    },
  });

  // Load existing inputs into state
  useEffect(() => {
    if (!existingInputs || !employees) return;
    const map: Record<string, MalakiMonthInput> = {};
    for (const emp of employees) {
      const existing = existingInputs.find((i: any) => i.employee_id === emp.id);
      if (existing) {
        map[emp.id] = {
          working_days: existing.working_days || 0,
          working_hours: existing.working_hours || 0,
          overtime_hours: existing.overtime_hours || 0,
          holiday_overtime_hours: existing.holiday_overtime_hours || 0,
          vacation_hours: existing.vacation_hours || 0,
          annual_leave_days: existing.annual_leave_days || 0,
          sick_leave_days: existing.sick_leave_days || 0,
          opening_advance_balance: existing.opening_advance_balance || 0,
          loan_installment: existing.loan_installment || 0,
          new_advance: existing.new_advance || 0,
          cash_advances: existing.cash_advances || 0,
          food_total: existing.food_total || 0,
          food_individual: existing.food_individual || 0,
          cash_shortage: existing.cash_shortage || 0,
          cash_surplus: existing.cash_surplus || 0,
          delivery: existing.delivery || 0,
          purchases: existing.purchases || 0,
          other_deduction: existing.other_deduction || 0,
          violations: existing.violations || 0,
          deduction_notes: existing.deduction_notes || "",
          special_allowance: existing.special_allowance || 0,
          extra_work_allowance: existing.extra_work_allowance || 0,
          has_termination_pay: existing.has_termination_pay || false,
        };
      } else {
        map[emp.id] = { ...defaultInput };
      }
    }
    setInputs(map);
  }, [existingInputs, employees]);

  const updateField = (empId: string, field: keyof MalakiMonthInput, value: any) => {
    setInputs(prev => ({
      ...prev,
      [empId]: { ...(prev[empId] || defaultInput), [field]: value },
    }));
  };

  const handleSave = async () => {
    if (!user || !employees) return;
    setSaving(true);
    try {
      const records = employees.map((emp: any) => {
        const inp = inputs[emp.id] || defaultInput;
        return {
          employee_id: emp.id,
          company_id: emp.company_id || null,
          year: selectedYear,
          month: selectedMonth,
          created_by: user.id,
          ...inp,
        };
      });

      const { error } = await supabase
        .from("monthly_payroll_inputs")
        .upsert(records, { onConflict: "employee_id,year,month" });
      if (error) throw error;
      toast.success("تم حفظ بيانات الرواتب بنجاح");
      queryClient.invalidateQueries({ queryKey: ["payroll-inputs"] });
    } catch (e: any) {
      toast.error(e.message || "خطأ في الحفظ");
    } finally {
      setSaving(false);
    }
  };

  // Quick preview of net salary
  const getPreview = (emp: any) => {
    const inp = inputs[emp.id];
    if (!inp || inp.working_days === 0) return null;
    const malakiEmp: MalakiEmployee = {
      id: emp.id,
      full_name: emp.full_name,
      start_date: emp.start_date,
      hourly_rate: Number(emp.hourly_rate) || 9.6,
      base_salary: Number(emp.base_salary) || 0,
      admin_allowance: Number(emp.admin_allowance) || 0,
      transfer_allowance: Number(emp.transfer_allowance) || 0,
      food_transport_override: emp.food_transport_override != null ? Number(emp.food_transport_override) : null,
      wives_count: Number(emp.wives_count) || 0,
      children_count: Number(emp.children_count) || 0,
      other_allowances: Number(emp.other_allowances) || 0,
      special_work_allowance: Number(emp.special_work_allowance) || 0,
      annual_leave_balance: Number(emp.annual_leave_balance) || 0,
      annual_leave_days: Number(emp.annual_leave_days) || 14,
      is_terminated: emp.is_terminated || false,
      terminated_at: emp.terminated_at,
    };
    const slip = calculateMalakiPayslip(malakiEmp, inp, selectedYear, selectedMonth);
    return slip.net_salary;
  };

  const NumField = ({ empId, field, label }: { empId: string; field: keyof MalakiMonthInput; label: string }) => (
    <div>
      <label className="text-[10px] text-muted-foreground block mb-0.5">{label}</label>
      <Input
        type="number"
        step="any"
        className="h-8 text-xs"
        value={String(inputs[empId]?.[field] ?? 0)}
        onChange={e => updateField(empId, field, Number(e.target.value) || 0)}
      />
    </div>
  );

  const isLoading = loadingEmp || loadingInputs;

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/payroll")} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">إدخال بيانات الرواتب الشهرية</h1>
            <p className="text-xs text-muted-foreground">{months[selectedMonth - 1]} {selectedYear} — نظام الملكي</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving || isLoading} size="sm">
          {saving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Save className="h-4 w-4 ml-1" />}
          حفظ الكل
        </Button>
      </div>

      {/* Period selector */}
      <div className="flex gap-3">
        <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>{[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Card className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></Card>
      ) : (
        <div className="space-y-3">
          {employees?.map((emp: any) => {
            const preview = getPreview(emp);
            return (
              <Card key={emp.id} className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="font-bold text-sm text-foreground">{emp.full_name}</span>
                    <span className="text-xs text-muted-foreground mr-2">{emp.department || ""}</span>
                    <span className="text-[10px] text-muted-foreground mr-2">₪{emp.hourly_rate || 9.6}/ساعة</span>
                  </div>
                  {preview !== null && (
                    <div className="flex items-center gap-1">
                      <Calculator className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className={`text-sm font-bold ${preview >= 0 ? "text-emerald-600" : "text-red-500"}`}>
                        {fmtCurrency(preview)}
                      </span>
                    </div>
                  )}
                </div>

                <Tabs defaultValue="attendance" className="w-full">
                  <TabsList className="h-7 mb-2">
                    <TabsTrigger value="attendance" className="text-[10px] h-6 px-2">الدوام</TabsTrigger>
                    <TabsTrigger value="deductions" className="text-[10px] h-6 px-2">الخصومات</TabsTrigger>
                    <TabsTrigger value="special" className="text-[10px] h-6 px-2">بدلات خاصة</TabsTrigger>
                  </TabsList>

                  <TabsContent value="attendance">
                    <div className="grid grid-cols-3 sm:grid-cols-7 gap-2">
                      <NumField empId={emp.id} field="working_days" label="أيام العمل" />
                      <NumField empId={emp.id} field="working_hours" label="ساعات العمل" />
                      <NumField empId={emp.id} field="overtime_hours" label="ساعات إضافية" />
                      <NumField empId={emp.id} field="holiday_overtime_hours" label="إضافي أعياد" />
                      <NumField empId={emp.id} field="vacation_hours" label="ساعات إجازة" />
                      <NumField empId={emp.id} field="annual_leave_days" label="إجازة سنوية (يوم)" />
                      <NumField empId={emp.id} field="sick_leave_days" label="إجازة مرضية (يوم)" />
                    </div>
                  </TabsContent>

                  <TabsContent value="deductions">
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      <NumField empId={emp.id} field="opening_advance_balance" label="رصيد أول الشهر" />
                      <NumField empId={emp.id} field="loan_installment" label="قرض حسن" />
                      <NumField empId={emp.id} field="new_advance" label="سلف جديدة" />
                      <NumField empId={emp.id} field="cash_advances" label="مسحوبات سلف" />
                      <NumField empId={emp.id} field="food_total" label="أكل جماعي" />
                      <NumField empId={emp.id} field="food_individual" label="أكل فردي" />
                      <NumField empId={emp.id} field="cash_shortage" label="عجز صندوق" />
                      <NumField empId={emp.id} field="cash_surplus" label="فائض صندوق" />
                      <NumField empId={emp.id} field="delivery" label="توصيل" />
                      <NumField empId={emp.id} field="purchases" label="مشتريات" />
                      <NumField empId={emp.id} field="other_deduction" label="أخرى" />
                      <NumField empId={emp.id} field="violations" label="مخالفات" />
                    </div>
                    <div className="mt-2">
                      <label className="text-[10px] text-muted-foreground block mb-0.5">ملاحظات الخصم</label>
                      <Textarea
                        className="text-xs h-16"
                        value={inputs[emp.id]?.deduction_notes || ""}
                        onChange={e => updateField(emp.id, "deduction_notes", e.target.value)}
                        placeholder="ملاحظات..."
                      />
                    </div>
                  </TabsContent>

                  <TabsContent value="special">
                    <div className="grid grid-cols-3 gap-2">
                      <NumField empId={emp.id} field="special_allowance" label="بدل أعمال أخرى" />
                      <NumField empId={emp.id} field="extra_work_allowance" label="بدل دوام يوم إضافي (يدوي)" />
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">مخالصة/مستحقات</label>
                        <label className="flex items-center gap-1.5 mt-1">
                          <input
                            type="checkbox"
                            checked={inputs[emp.id]?.has_termination_pay || false}
                            onChange={e => updateField(emp.id, "has_termination_pay", e.target.checked)}
                            className="rounded"
                          />
                          <span className="text-xs">يوجد مخالصة</span>
                        </label>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MonthlyPayrollInputPage;
