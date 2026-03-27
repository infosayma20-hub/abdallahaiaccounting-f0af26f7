import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Printer } from "lucide-react";
import { fmtCurrency, type MalakiPayslip } from "@/lib/malaki-payroll";

const months = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
];

interface Props {
  open: boolean;
  onClose: () => void;
  slip: MalakiPayslip;
  employee: {
    full_name: string;
    department?: string;
    job_title?: string;
    start_date?: string;
    hourly_rate?: number;
    branch_id?: string;
  };
  month: number;
  year: number;
}

const Row = ({ label, value, bold, color }: { label: string; value: string; bold?: boolean; color?: string }) => (
  <div className="flex justify-between py-1">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className={`text-xs ${bold ? "font-bold" : ""} ${color || "text-foreground"}`}>{value}</span>
  </div>
);

const MalakiPayslipDialog = ({ open, onClose, slip, employee, month, year }: Props) => {
  const handlePrint = () => {
    /* no browser print */
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto print:max-w-full print:shadow-none" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-center text-base">
            قسيمة راتب شهر {months[month - 1]} {year}
          </DialogTitle>
        </DialogHeader>

        {/* Employee Info */}
        <div className="bg-muted/30 rounded-lg p-3 text-xs space-y-1">
          <div className="flex justify-between">
            <span>الموظف: <strong>{employee.full_name}</strong></span>
            <span>الوظيفة: {employee.job_title || "-"}</span>
          </div>
          <div className="flex justify-between">
            <span>القسم: {employee.department || "-"}</span>
            <span>تاريخ التعيين: {employee.start_date || "-"}</span>
          </div>
          <div className="flex justify-between">
            <span>الراتب: ₪{employee.hourly_rate || 9.6}/ساعة</span>
          </div>
        </div>

        <Separator />

        {/* Attendance Summary */}
        <div>
          <h3 className="text-xs font-bold text-foreground mb-1">ملخص الدوام</h3>
          <div className="grid grid-cols-2 gap-x-4">
            <Row label="أيام العمل" value={String(slip.working_days)} />
            <Row label="ساعات العمل" value={String(slip.regular_hours)} />
            <Row label="ساعات إضافية" value={String(slip.overtime_hours)} />
            <Row label="ساعات إجازة" value={String(slip.vacation_hours)} />
          </div>
        </div>

        <Separator />

        {/* Earnings */}
        <div>
          <h3 className="text-xs font-bold text-emerald-600 mb-1">الاستحقاقات</h3>
          <Row label="راتب البصمة (الساعات)" value={fmtCurrency(slip.attendance_salary)} />
          {slip.annual_allowance > 0 && <Row label="علاوة سنوية" value={fmtCurrency(slip.annual_allowance)} />}
          {slip.admin_allowance > 0 && <Row label="علاوة إدارية" value={fmtCurrency(slip.admin_allowance)} />}
          {slip.food_transport_net > 0 && <Row label="بدل أكل ومواصلات" value={fmtCurrency(slip.food_transport_net)} />}
          {slip.family_allowance > 0 && <Row label="علاوة زوجة وأبناء" value={fmtCurrency(slip.family_allowance)} />}
          {slip.other_allowances > 0 && <Row label="علاوات أخرى" value={fmtCurrency(slip.other_allowances)} />}
          {slip.attendance_bonus > 0 && <Row label="بدل يوم إضافي" value={fmtCurrency(slip.attendance_bonus)} />}
          {slip.special_allowance > 0 && <Row label="بدل أعمال أخرى" value={fmtCurrency(slip.special_allowance)} />}
          {slip.extra_work_allowance > 0 && <Row label="بدل دوام إضافي" value={fmtCurrency(slip.extra_work_allowance)} />}
          {slip.entitlements > 0 && <Row label="مخالصة ومستحقات" value={fmtCurrency(slip.entitlements)} />}
          {slip.fixed_deduction > 0 && <Row label="خصم من الثابت" value={`- ${fmtCurrency(slip.fixed_deduction)}`} color="text-red-500" />}
          <Separator className="my-1" />
          <Row label="إجمالي الاستحقاقات" value={fmtCurrency(slip.total_earnings)} bold />
        </div>

        <Separator />

        {/* Deductions */}
        <div>
          <h3 className="text-xs font-bold text-red-500 mb-1">الخصومات</h3>
          {slip.deduction_opening_balance > 0 && <Row label="رصيد أول الشهر" value={fmtCurrency(slip.deduction_opening_balance)} color="text-red-500" />}
          {slip.deduction_loan > 0 && <Row label="قرض حسن" value={fmtCurrency(slip.deduction_loan)} color="text-red-500" />}
          {slip.deduction_new_advance > 0 && <Row label="سلف جديدة" value={fmtCurrency(slip.deduction_new_advance)} color="text-red-500" />}
          {slip.deduction_cash_advance > 0 && <Row label="مسحوبات سلف" value={fmtCurrency(slip.deduction_cash_advance)} color="text-red-500" />}
          {slip.deduction_food_group > 0 && <Row label="خصم أكل جماعي (90%)" value={fmtCurrency(slip.deduction_food_group)} color="text-red-500" />}
          {slip.deduction_food_individual > 0 && <Row label="خصم أكل فردي (50%)" value={fmtCurrency(slip.deduction_food_individual)} color="text-red-500" />}
          {slip.deduction_cash_shortage > 0 && <Row label="عجز صندوق" value={fmtCurrency(slip.deduction_cash_shortage)} color="text-red-500" />}
          {slip.deduction_delivery > 0 && <Row label="توصيل" value={fmtCurrency(slip.deduction_delivery)} color="text-red-500" />}
          {slip.deduction_purchases > 0 && <Row label="مشتريات" value={fmtCurrency(slip.deduction_purchases)} color="text-red-500" />}
          {slip.deduction_other > 0 && <Row label="أخرى" value={fmtCurrency(slip.deduction_other)} color="text-red-500" />}
          {slip.deduction_violations > 0 && <Row label="مخالفات" value={fmtCurrency(slip.deduction_violations)} color="text-red-500" />}
          <Separator className="my-1" />
          <Row label="إجمالي الخصومات" value={fmtCurrency(slip.total_deductions)} bold color="text-red-500" />
        </div>

        <Separator />

        {/* Net Salary */}
        <div className="bg-primary/5 rounded-lg p-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-bold text-foreground">💰 صافي الراتب</span>
            <span className={`text-lg font-bold ${slip.net_salary >= 0 ? "text-emerald-600" : "text-red-500"}`}>
              {fmtCurrency(slip.net_salary)}
            </span>
          </div>
          {slip.carry_over_balance > 0 && (
            <div className="text-[10px] text-red-500 mt-1">
              ⚠️ رصيد مرحل للشهر القادم: {fmtCurrency(slip.carry_over_balance)}
            </div>
          )}
        </div>

        <Button variant="outline" size="sm" onClick={handlePrint} className="w-full print:hidden">
          <Printer className="h-4 w-4 ml-1" /> طباعة القسيمة
        </Button>
      </DialogContent>
    </Dialog>
  );
};

export default MalakiPayslipDialog;
