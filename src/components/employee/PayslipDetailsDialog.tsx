import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatCurrency, periodLabel, safeNum } from "@/lib/employeeFinancialDisplay";
import { tPayrollStatus, payrollStatusTone } from "@/lib/hrLabels";

interface Props {
  payslip: any | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const Row = ({ label, value, accent }: { label: string; value: string; accent?: "ok" | "bad" }) => (
  <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs border-b border-border last:border-0">
    <span className="text-muted-foreground">{label}</span>
    <span className={`font-medium ${accent === "ok" ? "text-emerald-600" : accent === "bad" ? "text-rose-600" : "text-foreground"}`}>{value}</span>
  </div>
);

export default function PayslipDetailsDialog({ payslip, open, onOpenChange }: Props) {
  if (!payslip) return null;

  const additions = safeNum(payslip.total_allowances) + safeNum(payslip.total_overtime);
  const deductions = safeNum(payslip.total_deductions);
  const status = payslip.is_paid ? "paid" : payslip.status || "pending";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto p-4" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-base">
            <span>قسيمة راتب — {periodLabel(payslip.period_month, payslip.period_year)}</span>
            <Badge variant="outline" className={`text-[10px] ${payrollStatusTone(status)}`}>{tPayrollStatus(status)}</Badge>
          </DialogTitle>
        </DialogHeader>

        <section className="rounded-lg border border-border bg-card/50 mt-2">
          <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs font-semibold">تفاصيل الراتب</div>
          <Row label="الراتب الأساسي" value={formatCurrency(payslip.base_salary)} />
          <Row label="راتب الحضور" value={formatCurrency(payslip.attendance_salary)} />
          <Row label="إجمالي البدلات" value={formatCurrency(payslip.total_allowances)} accent="ok" />
          <Row label="إجمالي الأوفرتايم" value={formatCurrency(payslip.total_overtime)} accent="ok" />
          <Row label="إجمالي الإضافات" value={formatCurrency(additions)} accent="ok" />
          <Row label="إجمالي الخصومات" value={formatCurrency(deductions)} accent="bad" />
          <Row label="الصافي" value={formatCurrency(payslip.net_salary)} />
        </section>

        <section className="rounded-lg border border-border bg-card/50 mt-3">
          <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs font-semibold">تفاصيل الخصومات</div>
          <Row label="قسط قرض" value={formatCurrency(payslip.deduction_loan)} />
          <Row label="سلفة جديدة" value={formatCurrency(payslip.deduction_new_advance)} />
          <Row label="سلفة نقدية" value={formatCurrency(payslip.deduction_cash_advance)} />
          <Row label="مشتريات" value={formatCurrency(payslip.deduction_purchases)} />
          <Row label="عجز صندوق" value={formatCurrency(payslip.deduction_cash_shortage)} />
          <Row label="مخالفات" value={formatCurrency(payslip.deduction_violations)} />
          <Row label="وجبات / أكل (مجموعة)" value={formatCurrency(payslip.deduction_food_group)} />
          <Row label="وجبات / أكل (فردي)" value={formatCurrency(payslip.deduction_food_individual)} />
          <Row label="مواصلات / توصيل" value={formatCurrency(payslip.deduction_delivery)} />
          <Row label="أخرى" value={formatCurrency(payslip.deduction_other)} />
        </section>

        {payslip.notes && (
          <p className="text-xs bg-muted/40 rounded-lg p-2 mt-3 whitespace-pre-wrap">{payslip.notes}</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
