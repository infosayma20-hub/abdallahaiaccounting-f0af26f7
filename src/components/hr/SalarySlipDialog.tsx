import { useState, useEffect } from "react";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Printer, FileText } from "lucide-react";
import { formatCurrency, type SalarySlip, calculateLeaveBalance } from "@/lib/hr-utils";
import { supabase } from "@/integrations/supabase/client";

interface Movement {
  id: string;
  source_type: string;
  description: string;
  amount: number;
  movement_date: string;
  status: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  slip: SalarySlip | null;
  employeeName: string;
  department: string;
  startDate: string;
  month: number;
  year: number;
  companyName?: string;
  employee?: {
    id: string;
    id_number?: string;
    job_title?: string;
    base_salary?: number;
    salary_type?: string;
    bank_name?: string;
    bank_account?: string;
    annual_leave_balance?: number;
    annual_leave_days?: number;
    previous_year_balance?: number;
    transportation_allowance_per_day?: number;
    meal_allowance_per_day?: number;
    spouse_allowance_amount?: number;
    children_count?: number;
    child_allowance_per_child?: number;
  };
  userId?: string;
}

const SOURCE_LABELS: Record<string, string> = {
  hr_advance: "سلفة",
  pos_meal: "وجبة POS",
  pos_sale_credit: "مبيعات POS",
  pos_shortage: "عجز صندوق",
  finance_manual: "مسحوب يدوي",
  salary_deduction: "خصم تأديبي",
  insurance: "تأمين",
  tax: "ضريبة",
};

const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

export default function SalarySlipDialog({ open, onClose, slip, employeeName, department, startDate, month, year, companyName, employee, userId }: Props) {
  const [movements, setMovements] = useState<Movement[]>([]);

  const [installmentDeductions, setInstallmentDeductions] = useState<{label: string; amount: number}[]>([]);

  useEffect(() => {
    if (open && employee?.id && userId) {
      // Fetch financial movements
      supabase
        .from("employee_financial_movements")
        .select("id, source_type, description, amount, movement_date, status")
        .eq("employee_id", employee.id)
        .eq("user_id", dataOwnerId!)
        .eq("salary_month", month)
        .eq("salary_year", year)
        .eq("status", "approved")
        .eq("movement_type", "debit")
        .order("movement_date", { ascending: true })
        .then(({ data }) => setMovements((data as Movement[]) || []));

      // Fetch advance installments for this month
      const dueMonth = `${year}-${String(month).padStart(2, "0")}-01`;
      supabase
        .from("employee_advance_installments")
        .select("*, employee_advances(advance_type, amount)")
        .eq("employee_id", employee.id)
        .eq("user_id", dataOwnerId!)
        .eq("due_month", dueMonth)
        .then(({ data }) => {
          const items = ((data as any[]) || []).map((inst: any) => {
            const adv = inst.employee_advances;
            const typeLabel = adv?.advance_type === "قرض_حسن" ? "قسط قرض" : "قسط سلفة";
            return { label: `${typeLabel} (${inst.installment_number})`, amount: Number(inst.amount) };
          });
          setInstallmentDeductions(items);
        });
    }
  }, [open, employee?.id, userId, month, year]);

  if (!slip) return null;

  const handlePrint = () => { /* no browser print */ };

  // Group movements by source_type
  const groupedMovements: Record<string, Movement[]> = {};
  movements.forEach(m => {
    if (!groupedMovements[m.source_type]) groupedMovements[m.source_type] = [];
    groupedMovements[m.source_type].push(m);
  });

  const sumByType = (type: string) =>
    (groupedMovements[type] || []).reduce((s, m) => s + Number(m.amount), 0);

  // Leave balance
  const leaveEntitlement = employee?.annual_leave_days || 14;
  const leaveUsed = slip.annualLeaveDays || 0;
  const leaveRemaining = Math.max(0, (employee?.annual_leave_balance || leaveEntitlement) - leaveUsed);

  // Build earnings list
  const earningsList: [string, number][] = ([
    ["الراتب الأساسي", slip.basicSalary],
    [`مواصلات (${slip.presentDays} يوم)`, slip.transportationAllowance],
    [`وجبات (${slip.presentDays} يوم)`, slip.mealAllowance],
    ["علاوة زوجة", slip.spouseAllowance],
    [`علاوة أبناء (${employee?.children_count || 0})`, slip.childrenAllowance],
    ["أوفرتايم", slip.overtimeAmount],
    ["بدلات أخرى", slip.customAllowances],
  ] as [string, number][]).filter(([, v]) => v > 0);

  // Build detailed deductions
  const deductionsList: [string, number][] = [];

  // Add movements by type
  Object.entries(groupedMovements).forEach(([type, items]) => {
    const label = SOURCE_LABELS[type] || type;
    const total = items.reduce((s, m) => s + Number(m.amount), 0);
    if (total > 0) {
      const detail = items.length > 1 ? ` (${items.length} مرات)` : items.length === 1 ? ` ${items[0].movement_date.slice(5)}` : "";
      deductionsList.push([`${label}${detail}`, total]);
    }
  });

  // Add standard deductions
  if (slip.socialInsurance > 0) deductionsList.push(["تأمين اجتماعي 7.5%", slip.socialInsurance]);
  if (slip.absenceDeduction > 0) deductionsList.push([`غياب (${slip.absentDays} يوم)`, slip.absenceDeduction]);

  // If no movement details, show the aggregate deductions from the slip
  if (movements.length === 0 && slip.advanceDeduction > 0) {
    deductionsList.unshift(["سلف ومسحوبات", slip.advanceDeduction]);
  }
  if (slip.otherDeductions > 0) deductionsList.push(["خصومات أخرى", slip.otherDeductions]);

  // Add advance installments
  installmentDeductions.forEach(inst => {
    deductionsList.push([inst.label, inst.amount]);
  });

  const totalDeductions = deductionsList.reduce((s, [, v]) => s + v, 0);
  const totalEarnings = earningsList.reduce((s, [, v]) => s + v, 0);
  const netSalary = totalEarnings - totalDeductions;

  const bankDisplay = employee?.bank_account
    ? `****${employee.bank_account.slice(-4)}`
    : null;

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg print:max-w-full print:shadow-none print:border-none" dir="rtl">
        <DialogHeader className="print:hidden">
          <DialogTitle className="text-center text-lg">
            قسيمة راتب شهر {monthNames[month - 1]} {year}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm" id="salary-slip-content">
          {/* Print header */}
          <div className="hidden print:block text-center space-y-1 mb-4">
            {companyName && <p className="text-lg font-bold">{companyName}</p>}
            <p className="text-base font-bold">قسيمة راتب شهر {monthNames[month - 1]} {year}</p>
            <p className="text-xs text-muted-foreground">سري وخاص - للموظف فقط</p>
          </div>

          {/* Employee Info */}
          <div className="bg-muted/50 rounded-xl p-3 space-y-1">
            <p className="font-bold text-foreground text-base">{employeeName}</p>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
              {employee?.job_title && <span>الوظيفة: {employee.job_title}</span>}
              {department && <span>القسم: {department}</span>}
              {employee?.id_number && <span>رقم الهوية: {employee.id_number}</span>}
              <span>تاريخ التعيين: {startDate}</span>
              <span>الراتب الأساسي: {formatCurrency(employee?.base_salary || slip.basicSalary)}/{employee?.salary_type || "شهري"}</span>
            </div>
            {companyName && <p className="text-xs text-muted-foreground print:hidden">{companyName}</p>}
          </div>

          {/* Days Breakdown */}
          <div className="border border-border rounded-xl p-3 space-y-1">
            <h4 className="font-bold text-xs text-foreground mb-2 flex items-center gap-1">📅 تفاصيل أيام الشهر</h4>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">أيام العمل في الشهر:</span><b>{slip.workDays} يوم</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">أيام الحضور الفعلي:</span><b>{slip.presentDays} يوم</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">إجازات سنوية:</span><b>{slip.annualLeaveDays} يوم</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">عطل رسمية:</span><b>{slip.officialHolidayDays} يوم</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">عطل أسبوعية:</span><b>{slip.weeklyDaysOff} أيام</b></div>
              <div className="flex justify-between"><span className="text-muted-foreground">أيام الغياب:</span><b className={slip.absentDays > 0 ? "text-destructive" : ""}>{slip.absentDays} يوم</b></div>
            </div>
            <Separator className="my-1.5" />
            <div className="flex justify-between text-xs">
              <span className="font-medium">مجموع الأيام المدفوعة:</span>
              <b>{slip.totalPaidDays} يوم</b>
            </div>
            {slip.totalPaidDays >= 25 ? (
              <Badge variant="default" className="text-[10px] mt-1">✅ لا خصم (المدفوع ≥ 25 يوم)</Badge>
            ) : slip.absentDays > 0 ? (
              <Badge variant="destructive" className="text-[10px] mt-1">⚠️ غياب {slip.absentDays} يوم</Badge>
            ) : null}
          </div>

          {/* Earnings & Deductions side by side */}
          <div className="grid grid-cols-2 gap-3">
            {/* Earnings */}
            <div className="border border-border rounded-xl p-3">
              <h4 className="font-bold text-emerald-600 mb-2 text-xs">💚 الاستحقاقات</h4>
              <div className="space-y-1.5">
                {earningsList.map(([label, val]) => (
                  <div key={label} className="flex justify-between text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{formatCurrency(val)}</span>
                  </div>
                ))}
                <Separator />
                <div className="flex justify-between font-bold text-xs">
                  <span>الإجمالي</span>
                  <span className="text-emerald-600">{formatCurrency(totalEarnings)}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div className="border border-border rounded-xl p-3">
              <h4 className="font-bold text-destructive mb-2 text-xs">🔴 الخصومات</h4>
              <div className="space-y-1.5">
                {deductionsList.length === 0 ? (
                  <p className="text-muted-foreground text-xs">لا خصومات</p>
                ) : (
                  deductionsList.map(([label, val]) => (
                    <div key={label} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{label}</span>
                      <span className="font-medium">{formatCurrency(val)}</span>
                    </div>
                  ))
                )}
                <Separator />
                <div className="flex justify-between font-bold text-xs">
                  <span>الإجمالي</span>
                  <span className="text-destructive">{formatCurrency(totalDeductions)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Net Salary */}
          <div className="bg-primary/10 rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">💰 صافي الراتب</p>
            <p className={`text-2xl font-bold ${netSalary >= 0 ? "text-primary" : "text-destructive"}`}>
              {formatCurrency(netSalary)}
            </p>
            {bankDisplay && (
              <p className="text-xs text-muted-foreground mt-1">
                طريقة الصرف: تحويل بنكي | الحساب: {bankDisplay}
              </p>
            )}
          </div>

          {/* Leave Balance */}
          <div className="border border-border rounded-xl p-3">
            <h4 className="font-bold text-xs text-foreground mb-2">📊 رصيد الإجازات</h4>
            <div className="grid grid-cols-3 gap-2 text-xs text-center">
              <div>
                <p className="text-muted-foreground">الاستحقاق</p>
                <p className="font-bold">{leaveEntitlement} يوم</p>
              </div>
              <div>
                <p className="text-muted-foreground">المستخدم</p>
                <p className="font-bold">{leaveUsed} يوم</p>
              </div>
              <div>
                <p className="text-muted-foreground">الباقي</p>
                <p className="font-bold text-primary">{leaveRemaining} يوم</p>
              </div>
            </div>
          </div>

          {/* Signature area (print only) */}
          <div className="hidden print:block border-t border-border pt-4 mt-4">
            <div className="grid grid-cols-2 gap-8 text-xs">
              <div>
                <p>توقيع الموظف: _______________</p>
              </div>
              <div>
                <p>توقيع المدير: _______________</p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">التاريخ: {new Date().toLocaleDateString("ar-PS")}</p>
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-2 print:hidden">
          <Button variant="outline" onClick={onClose}>إغلاق</Button>
          <Button onClick={handlePrint} className="gap-2">
            <Printer className="h-4 w-4" /> طباعة
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
