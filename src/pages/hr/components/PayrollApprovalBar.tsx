import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Lock, Send, CheckCircle2, RotateCcw, Info, Banknote } from "lucide-react";
import {
  PAYROLL_STATUS_META,
  useEmployeePayrollRow,
  useSubmitPayroll,
  useApprovePayroll,
  useRejectPayroll,
  usePayPayrollEmployee,
  type SubmitPayrollInput,
} from "@/hooks/hr/usePayrollApproval";
import { PayrollPaymentDialog } from "@/components/hr/payroll/PayrollPaymentDialog";

interface Props {
  employeeId: string;
  year: number;
  month: number;
  /** computed preview snapshot — required to support "Submit for Approval" */
  previewSnapshot:
    | (Omit<SubmitPayrollInput, "employee_id" | "period_month" | "period_year">)
    | null;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("ar", { maximumFractionDigits: 2 }).format(Number(v || 0));

export function PayrollApprovalBar({
  employeeId,
  year,
  month,
  previewSnapshot,
}: Props) {
  const { data: row, isLoading } = useEmployeePayrollRow(employeeId, year, month);
  const submitMut = useSubmitPayroll();
  const approveMut = useApprovePayroll();
  const rejectMut = useRejectPayroll();
  const payMut = usePayPayrollEmployee();

  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [payOpen, setPayOpen] = useState(false);

  const status: keyof typeof PAYROLL_STATUS_META = row?.status ?? "preview";
  const meta = PAYROLL_STATUS_META[status];
  const tone =
    meta.tone === "amber"
      ? "bg-amber-50 dark:bg-amber-900/20 border-amber-300 dark:border-amber-700/50"
      : meta.tone === "emerald"
      ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700/50"
      : meta.tone === "primary"
      ? "bg-primary/5 border-primary/40"
      : meta.tone === "rose"
      ? "bg-rose-50 dark:bg-rose-900/20 border-rose-300 dark:border-rose-700/50"
      : "bg-muted/40 border-border";

  const handleSubmit = () => {
    if (!previewSnapshot) return;
    submitMut.mutate({
      employee_id: employeeId,
      period_month: month,
      period_year: year,
      ...previewSnapshot,
    });
  };

  const handleApprove = () => {
    if (!row) return;
    approveMut.mutate({ payrollId: row.id, employeeId });
  };

  const handleReject = () => {
    if (!row) return;
    rejectMut.mutate(
      { payrollId: row.id, reason, employeeId },
      {
        onSuccess: () => {
          setRejectOpen(false);
          setReason("");
        },
      },
    );
  };

  return (
    <Card className={`border ${tone}`}>
      <CardContent className="p-3 flex flex-wrap items-center gap-3 justify-between" dir="rtl">
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="text-sm font-semibold gap-1">
            {meta.label}
          </Badge>

          {row?.approved_at && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Lock className="h-3 w-3" />
              اعتُمد في {new Date(row.approved_at).toLocaleString("ar")}
            </span>
          )}
          {row?.submitted_at && !row?.approved_at && (
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Info className="h-3 w-3" />
              قُدِّم في {new Date(row.submitted_at).toLocaleString("ar")}
            </span>
          )}
          {row?.rejection_reason && (
            <span className="text-[11px] text-amber-700 dark:text-amber-400 font-medium">
              سبب الإرجاع: {row.rejection_reason}
            </span>
          )}
          {!row && previewSnapshot && (
            <span className="text-[11px] text-muted-foreground">
              صافي تقديري: <b>₪{fmt(previewSnapshot.net_salary)}</b>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Preview → Submit */}
          {!row && (
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!previewSnapshot || submitMut.isPending || isLoading}
              className="gap-1"
            >
              <Send className="h-4 w-4" />
              تقديم للاعتماد
            </Button>
          )}

          {/* Submitted → Approve / Reject + Re-submit (refresh snapshot) */}
          {row?.status === "submitted" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleSubmit}
                disabled={!previewSnapshot || submitMut.isPending}
                className="gap-1"
              >
                <RotateCcw className="h-4 w-4" />
                تحديث القيم
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRejectOpen(true)}
                disabled={rejectMut.isPending}
                className="gap-1 border-rose-300 text-rose-700 hover:bg-rose-50"
              >
                إرجاع للمراجعة
              </Button>
              <Button
                size="sm"
                onClick={handleApprove}
                disabled={approveMut.isPending}
                className="gap-1 bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4" />
                اعتماد
              </Button>
            </>
          )}

          {/* Returned → allow editing values & re-submitting */}
          {row?.status === "returned" && (
            <>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!previewSnapshot || submitMut.isPending}
                className="gap-1"
              >
                <Send className="h-4 w-4" />
                إعادة التقديم
              </Button>
            </>
          )}

          {/* Approved → Re-open (reject back to submitted) */}
          {row?.status === "approved" && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setRejectOpen(true)}
                disabled={rejectMut.isPending}
                className="gap-1"
              >
                <RotateCcw className="h-4 w-4" />
                إرجاع للمراجعة
              </Button>
              <Button
                size="sm"
                onClick={() => setPayOpen(true)}
                disabled={payMut.isPending}
                className="gap-1 bg-emerald-600 hover:bg-emerald-700"
              >
                <Banknote className="h-4 w-4" />
                دفع الراتب
              </Button>
            </>
          )}

          {row?.status === "paid" && (
            <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-700">
              <Lock className="h-3 w-3" />
              مغلق نهائياً
            </Badge>
          )}
        </div>
      </CardContent>

      {/* Reject / re-open dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              إرجاع الراتب للمراجعة
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              سيتم وضع الراتب في حالة «معاد للمراجعة» — قابل للتعديل وإعادة التقديم.
              هذا ليس إلغاءً نهائياً.
            </p>
            <Textarea
              placeholder="سبب الإرجاع (إجباري)…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              إلغاء
            </Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!reason.trim() || rejectMut.isPending}
              onClick={handleReject}
            >
              تأكيد الإرجاع
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment dialog */}
      {row && (
        <PayrollPaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          title="دفع راتب الموظف"
          summary={`صافي الراتب: ₪${fmt(row.net_salary)} — ${row.period_month}/${row.period_year}`}
          isSubmitting={payMut.isPending}
          onConfirm={(p) => {
            payMut.mutate(
              {
                payrollId: row.id,
                paymentMethod: p.paymentMethod,
                bankAccountId: p.bankAccountId,
                chequeNumber: p.chequeNumber,
                chequeDueDate: p.chequeDueDate,
                paymentDate: p.paymentDate,
                employeeId,
              },
              { onSuccess: () => setPayOpen(false) },
            );
          }}
        />
      )}
    </Card>
  );
}