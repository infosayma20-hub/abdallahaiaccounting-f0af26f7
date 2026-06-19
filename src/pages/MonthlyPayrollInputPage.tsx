import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Save, ArrowRight, Loader2, Calculator, Fingerprint, DollarSign, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { fmtCurrency, calculateMalakiPayslip, type MalakiEmployee, type MalakiMonthInput } from "@/lib/malaki-payroll";
import * as XLSX from "xlsx";

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

const PAYROLL_FIELDS: { key: keyof MalakiMonthInput; label: string }[] = [
  { key: "working_days", label: "أيام العمل" },
  { key: "working_hours", label: "ساعات العمل" },
  { key: "overtime_hours", label: "ساعات إضافية" },
  { key: "holiday_overtime_hours", label: "إضافي أعياد" },
  { key: "vacation_hours", label: "ساعات إجازة" },
  { key: "annual_leave_days", label: "إجازة سنوية" },
  { key: "sick_leave_days", label: "إجازة مرضية" },
  { key: "opening_advance_balance", label: "رصيد أول الشهر" },
  { key: "loan_installment", label: "قرض حسن" },
  { key: "new_advance", label: "سلف جديدة" },
  { key: "cash_advances", label: "مسحوبات سلف" },
  { key: "food_total", label: "أكل جماعي" },
  { key: "food_individual", label: "أكل فردي" },
  { key: "cash_shortage", label: "عجز صندوق" },
  { key: "cash_surplus", label: "فائض صندوق" },
  { key: "delivery", label: "توصيل" },
  { key: "purchases", label: "مشتريات" },
  { key: "other_deduction", label: "أخرى" },
  { key: "violations", label: "مخالفات" },
  { key: "special_allowance", label: "بدل أعمال أخرى" },
  { key: "extra_work_allowance", label: "بدل دوام إضافي" },
];

const MonthlyPayrollInputPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [inputs, setInputs] = useState<Record<string, MalakiMonthInput>>({});
  const [saving, setSaving] = useState(false);
  const [fillingAttendance, setFillingAttendance] = useState(false);
  const [fillingDeductions, setFillingDeductions] = useState(false);
  // Phase 2.1: detect dual-mode tenants (e.g. Malaki) to show a warning
  // because POS pos_meal movements are already discounted.
  const [isDualMealMode, setIsDualMealMode] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (!user) return;
        const { data: company } = await supabase
          .from("companies")
          .select("id")
          .eq("owner_id", user.id)
          .maybeSingle();
        if (!company?.id) return;
        const { data: ps } = await supabase
          .from("payroll_settings" as any)
          .select("meal_discount_mode")
          .eq("company_id", company.id)
          .maybeSingle();
        setIsDualMealMode((ps as any)?.meal_discount_mode === "dual");
      } catch { /* ignore */ }
    })();
  }, [user]);

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

  // ━━━ Auto-fill from Attendance ━━━
  const fillFromAttendance = async () => {
    if (!employees || !user) return;
    setFillingAttendance(true);
    try {
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
      const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split("T")[0];

      const { data: attendanceData, error } = await supabase
        .from("attendance_days")
        .select("employee_id, total_hours, overtime_hours, status")
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate);

      if (error) throw error;

      if (!attendanceData || attendanceData.length === 0) {
        toast.info("لا توجد بيانات بصمة لهذا الشهر");
        setFillingAttendance(false);
        return;
      }

      // Aggregate per employee
      const empAgg: Record<string, { days: number; hours: number; overtime: number; vacationHours: number; annualLeave: number; sickLeave: number }> = {};
      for (const rec of attendanceData) {
        if (!empAgg[rec.employee_id]) {
          empAgg[rec.employee_id] = { days: 0, hours: 0, overtime: 0, vacationHours: 0, annualLeave: 0, sickLeave: 0 };
        }
        const agg = empAgg[rec.employee_id];
        if (rec.status === "present" || rec.status === "حاضر") {
          agg.days++;
          agg.hours += Number(rec.total_hours) || 0;
          agg.overtime += Number(rec.overtime_hours) || 0;
        } else if (rec.status === "annual_leave" || rec.status === "إجازة سنوية") {
          agg.annualLeave++;
        } else if (rec.status === "sick_leave" || rec.status === "إجازة مرضية") {
          agg.sickLeave++;
        } else if (rec.status === "vacation" || rec.status === "إجازة") {
          agg.vacationHours += Number(rec.total_hours) || 0;
        }
      }

      let filled = 0;
      setInputs(prev => {
        const next = { ...prev };
        for (const emp of employees) {
          const agg = empAgg[emp.id];
          if (agg) {
            next[emp.id] = {
              ...(next[emp.id] || defaultInput),
              working_days: agg.days,
              working_hours: Math.round(agg.hours * 100) / 100,
              overtime_hours: Math.round(agg.overtime * 100) / 100,
              vacation_hours: Math.round(agg.vacationHours * 100) / 100,
              annual_leave_days: agg.annualLeave,
              sick_leave_days: agg.sickLeave,
            };
            filled++;
          }
        }
        return next;
      });

      toast.success(`تم تعبئة بيانات الدوام لـ ${filled} موظف من البصمة ✅`);
    } catch (e: any) {
      toast.error(e.message || "خطأ في جلب بيانات البصمة");
    }
    setFillingAttendance(false);
  };

  // ━━━ Auto-fill Deductions from Financial Transactions ━━━
  const fillFromTransactions = async () => {
    if (!employees || !user) return;
    setFillingDeductions(true);
    try {
      const startDate = `${selectedYear}-${String(selectedMonth).padStart(2, "0")}-01`;
      const endDate = new Date(selectedYear, selectedMonth, 0).toISOString().split("T")[0];

      // Get employee accounts (2180+) to map account_code -> employee
      const { data: empAccounts } = await supabase
        .from("accounts")
        .select("account_code, account_name")
        .eq("parent_code", "2180")
        .eq("is_active", true);

      // Get transactions on employee accounts during the period
      const { data: txData, error } = await supabase
        .from("transactions")
        .select("debit_account_code, credit_account_code, amount, description, transaction_type")
        .gte("transaction_date", startDate)
        .lte("transaction_date", endDate)
        .or("debit_account_code.like.118%,credit_account_code.like.118%")
        .eq("is_deleted", false);

      if (error) throw error;

      if (!txData || txData.length === 0) {
        toast.info("لا توجد حركات مالية مرتبطة بالموظفين هذا الشهر");
        setFillingDeductions(false);
        return;
      }

      // Map account codes to employee names
      const codeToName: Record<string, string> = {};
      if (empAccounts) {
        for (const acc of empAccounts) {
          // Extract employee name from account name like "ذمم موظف - محمد"
          const match = acc.account_name.match(/ذمم موظف\s*[-–]\s*(.+)/);
          if (match) codeToName[acc.account_code] = match[1].trim();
        }
      }

      // Match transactions to employees by name
      let filled = 0;
      setInputs(prev => {
        const next = { ...prev };
        for (const emp of employees) {
          let totalDeductions = 0;
          const notes: string[] = [];
          
          for (const tx of txData) {
            const empAccountCode = tx.debit_account_code?.startsWith("118") ? tx.debit_account_code : tx.credit_account_code;
            const empName = codeToName[empAccountCode || ""];
            
            if (empName && emp.full_name.includes(empName)) {
              totalDeductions += Number(tx.amount) || 0;
              notes.push(`${tx.description || tx.transaction_type}: ₪${tx.amount}`);
            }
          }

          if (totalDeductions > 0) {
            next[emp.id] = {
              ...(next[emp.id] || defaultInput),
              cash_advances: (next[emp.id]?.cash_advances || 0) + totalDeductions,
              deduction_notes: [next[emp.id]?.deduction_notes, ...notes].filter(Boolean).join("\n"),
            };
            filled++;
          }
        }
        return next;
      });

      toast.success(`تم جلب خصومات ${filled} موظف من الحركات المالية ✅`);
    } catch (e: any) {
      toast.error(e.message || "خطأ في جلب الحركات المالية");
    }
    setFillingDeductions(false);
  };

  // ━━━ Export Excel Template ━━━
  const exportTemplate = () => {
    if (!employees) return;
    const headers = ["اسم الموظف", ...PAYROLL_FIELDS.map(f => f.label)];
    const rows = employees.map((emp: any) => {
      const inp = inputs[emp.id] || defaultInput;
      return [emp.full_name, ...PAYROLL_FIELDS.map(f => inp[f.key] ?? 0)];
    });

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws["!cols"] = headers.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "بيانات الرواتب");
    XLSX.writeFile(wb, `رواتب_${months[selectedMonth - 1]}_${selectedYear}.xlsx`);
    toast.success("تم تحميل القالب ✅");
  };

  // ━━━ Import Excel ━━━
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !employees) return;

    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws) as Record<string, any>[];

      if (data.length === 0) {
        toast.error("الملف فارغ");
        return;
      }

      let matched = 0;
      setInputs(prev => {
        const next = { ...prev };
        for (const row of data) {
          const name = row["اسم الموظف"]?.toString().trim();
          if (!name) continue;
          const emp = employees.find((e: any) => e.full_name === name);
          if (!emp) continue;

          const updated = { ...(next[emp.id] || defaultInput) };
          for (const field of PAYROLL_FIELDS) {
            if (row[field.label] !== undefined && row[field.label] !== "") {
              (updated as any)[field.key] = Number(row[field.label]) || 0;
            }
          }
          next[emp.id] = updated;
          matched++;
        }
        return next;
      });

      toast.success(`تم استيراد بيانات ${matched} موظف من الملف ✅`);
    } catch (err: any) {
      toast.error(err.message || "خطأ في قراءة الملف");
    }
    if (fileRef.current) fileRef.current.value = "";
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
            <p className="text-xs text-muted-foreground">{months[selectedMonth - 1]} {selectedYear}</p>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving || isLoading} size="sm">
          {saving ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Save className="h-4 w-4 ml-1" />}
          حفظ الكل
        </Button>
      </div>

      {/* Period selector + Action buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>{[2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
        </Select>

        <div className="border-r border-border h-6 mx-1 hidden sm:block" />

        <Button variant="outline" size="sm" onClick={fillFromAttendance} disabled={fillingAttendance || isLoading}>
          {fillingAttendance ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <Fingerprint className="h-3.5 w-3.5 ml-1" />}
          تعبئة من البصمة
        </Button>
        <Button variant="outline" size="sm" onClick={fillFromTransactions} disabled={fillingDeductions || isLoading}>
          {fillingDeductions ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <DollarSign className="h-3.5 w-3.5 ml-1" />}
          جلب الخصومات المالية
        </Button>

        <div className="border-r border-border h-6 mx-1 hidden sm:block" />

        <Button variant="outline" size="sm" onClick={exportTemplate} disabled={isLoading}>
          <Download className="h-3.5 w-3.5 ml-1" />
          تصدير قالب Excel
        </Button>
        <div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleImport} className="hidden" />
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={isLoading}>
            <Upload className="h-3.5 w-3.5 ml-1" />
            استيراد من Excel
          </Button>
        </div>
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
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-bold text-foreground whitespace-nowrap">{emp.full_name}</span>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{emp.department || ""}</span>
                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">₪{emp.hourly_rate || 9.6}/ساعة</span>
                  </div>
                  {preview !== null && (
                    <div className="flex items-center gap-1 flex-shrink-0">
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
