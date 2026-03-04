import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Printer } from "lucide-react";
import { formatCurrency, type SalarySlip } from "@/lib/hr-utils";

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
}

const months = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

export default function SalarySlipDialog({ open, onClose, slip, employeeName, department, startDate, month, year, companyName }: Props) {
  if (!slip) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent className="max-w-lg print:max-w-full print:shadow-none" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-center text-lg">
            قسيمة راتب شهر {months[month - 1]} {year}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm" id="salary-slip-content">
          {/* Employee Info */}
          <div className="bg-muted/50 rounded-xl p-3 space-y-1">
            <p className="font-bold text-foreground">{employeeName}</p>
            <p className="text-xs text-muted-foreground">
              {department && `${department} | `}تاريخ البداية: {startDate}
            </p>
            {companyName && <p className="text-xs text-muted-foreground">{companyName}</p>}
          </div>

          {/* Earnings & Deductions side by side */}
          <div className="grid grid-cols-2 gap-3">
            {/* Earnings */}
            <div className="border border-border rounded-xl p-3">
              <h4 className="font-bold text-emerald-600 mb-2 text-xs">الاستحقاقات</h4>
              <div className="space-y-1.5">
                {[
                  ["الراتب الأساسي", slip.basicSalary],
                  ["مواصلات", slip.transportationAllowance],
                  ["وجبات", slip.mealAllowance],
                  ["علاوة زوجة", slip.spouseAllowance],
                  ["علاوة أبناء", slip.childrenAllowance],
                  ["أوفرتايم", slip.overtimeAmount],
                  ["بدلات أخرى", slip.customAllowances],
                ].filter(([, v]) => (v as number) > 0).map(([label, val]) => (
                  <div key={label as string} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{formatCurrency(val as number)}</span>
                  </div>
                ))}
                <div className="border-t border-border pt-1.5 flex justify-between font-bold">
                  <span>إجمالي</span>
                  <span className="text-emerald-600">{formatCurrency(slip.totalEarnings)}</span>
                </div>
              </div>
            </div>

            {/* Deductions */}
            <div className="border border-border rounded-xl p-3">
              <h4 className="font-bold text-red-500 mb-2 text-xs">الخصومات</h4>
              <div className="space-y-1.5">
                {[
                  ["غياب", slip.absenceDeduction],
                  ["تأخر", slip.lateDeduction],
                  ["سلف", slip.advanceDeduction],
                  ["تأمين اجتماعي", slip.socialInsurance],
                  ["خصومات أخرى", slip.otherDeductions],
                ].filter(([, v]) => (v as number) > 0).map(([label, val]) => (
                  <div key={label as string} className="flex justify-between">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium">{formatCurrency(val as number)}</span>
                  </div>
                ))}
                {slip.totalDeductions === 0 && (
                  <p className="text-muted-foreground text-xs">لا خصومات</p>
                )}
                <div className="border-t border-border pt-1.5 flex justify-between font-bold">
                  <span>إجمالي</span>
                  <span className="text-red-500">{formatCurrency(slip.totalDeductions)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Net Salary */}
          <div className="bg-primary/10 rounded-xl p-4 text-center">
            <p className="text-xs text-muted-foreground mb-1">صافي الراتب</p>
            <p className="text-2xl font-bold text-primary">{formatCurrency(slip.netSalary)}</p>
          </div>

          {/* Days Breakdown */}
          <div className="bg-muted/30 rounded-xl p-3 flex flex-wrap gap-3 text-xs justify-center">
            <span>أيام الدوام: <b>{slip.workDays}</b></span>
            <span>حضور: <b>{slip.presentDays}</b></span>
            <span>إجازة سنوية: <b>{slip.annualLeaveDays}</b></span>
            <span>عطل رسمية: <b>{slip.officialHolidayDays}</b></span>
            <span>عطل أسبوعية: <b>{slip.weeklyDaysOff}</b></span>
            <span>مجموع المدفوع: <b>{slip.totalPaidDays}</b></span>
            {slip.totalPaidDays >= 25 ? (
              <Badge variant="default" className="text-[10px]">✅ لا خصم</Badge>
            ) : (
              <Badge variant="destructive" className="text-[10px]">⚠️ غياب {slip.absentDays} يوم</Badge>
            )}
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
