import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CheckCircle2,
  ShieldCheck,
  ExternalLink,
  AlertTriangle,
  Lock,
  Banknote,
} from "lucide-react";
import {
  usePayrollMonth,
  useApprovePayrollBatch,
  useApprovePayroll,
  usePayPayrollBatch,
  PAYROLL_STATUS_META,
  type PayrollStatus,
} from "@/hooks/hr/usePayrollApproval";
import { PayrollPaymentDialog } from "@/components/hr/payroll/PayrollPaymentDialog";

const arabicMonths = [
  "يناير","فبراير","مارس","أبريل","مايو","يونيو",
  "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
];
const fmt = (v: number) =>
  new Intl.NumberFormat("ar", { maximumFractionDigits: 2 }).format(Number(v || 0));

function StatusBadge({ status }: { status: PayrollStatus }) {
  const meta = PAYROLL_STATUS_META[status];
  const cls =
    meta.tone === "amber"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
      : meta.tone === "emerald"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
      : meta.tone === "primary"
      ? "bg-primary/10 text-primary"
      : meta.tone === "rose"
      ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
      : "bg-muted text-muted-foreground";
  return <Badge className={`text-[10px] border-0 ${cls}`}>{meta.label}</Badge>;
}

export default function PayrollApprovalCenter() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);

  const { data, isLoading, isError, error } = usePayrollMonth(year, month);
  const approveBatchMut = useApprovePayrollBatch();
  const approveOneMut = useApprovePayroll();
  const payBatchMut = usePayPayrollBatch();

  const rows = data?.rows ?? [];
  const batch = data?.batch ?? null;

  const stats = useMemo(() => {
    const submitted = rows.filter((r: any) => r.status === "submitted");
    const approved = rows.filter((r: any) => r.status === "approved");
    const paid = rows.filter((r: any) => r.status === "paid");
    const cancelled = rows.filter((r: any) => r.status === "cancelled");
    const approvedUnpaid = approved.filter((r: any) => !r.is_paid);
    const totalApprovedUnpaid = approvedUnpaid.reduce(
      (s: number, r: any) => s + Number(r.net_salary || 0),
      0,
    );
    const totalNetSubmitted = submitted.reduce(
      (s: number, r: any) => s + Number(r.net_salary || 0),
      0,
    );
    const totalNetAll = rows.reduce(
      (s: number, r: any) => s + Number(r.net_salary || 0),
      0,
    );
    return {
      submitted, approved, paid, cancelled,
      approvedUnpaid, totalApprovedUnpaid,
      totalNetSubmitted, totalNetAll,
      total: rows.length,
    };
  }, [rows]);

  const yearOptions = [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1];

  const handleBatchApprove = () => {
    if (!data?.ownerId) return;
    approveBatchMut.mutate(
      { userId: data.ownerId, year, month },
      { onSuccess: () => setConfirmOpen(false) },
    );
  };

  return (
    <div className="container max-w-7xl mx-auto p-4 md:p-6 space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-primary" />
            مركز اعتماد الرواتب
          </h1>
          <p className="text-sm text-muted-foreground">
            راجع رواتب الموظفين شهرياً واعتمدها فردياً أو دفعة واحدة.
            لا يتم إنشاء قيود محاسبية في هذه المرحلة.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            className="bg-background border rounded-md px-3 py-1.5 text-sm"
          >
            {arabicMonths.map((name, i) => (
              <option key={i} value={i + 1}>{name}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-background border rounded-md px-3 py-1.5 text-sm"
          >
            {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Batch summary */}
      {batch && (
        <Alert className="border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-700/50">
          <Lock className="h-4 w-4 text-emerald-600" />
          <AlertTitle className="text-emerald-800 dark:text-emerald-300 text-sm">
            دفعة هذا الشهر معتمدة
          </AlertTitle>
          <AlertDescription className="text-xs text-emerald-700 dark:text-emerald-400">
            اعتُمد {batch.total_employees} موظف بإجمالي صافي ₪{fmt(Number(batch.total_net_salary))}
            {batch.approved_at && (
              <> — في {new Date(batch.approved_at).toLocaleString("ar")}</>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground">إجمالي الموظفين</p>
          <p className="text-lg font-bold">{stats.total}</p>
        </Card>
        <Card className="p-3 border-amber-200 dark:border-amber-800/40">
          <p className="text-[10px] text-muted-foreground">قيد الاعتماد</p>
          <p className="text-lg font-bold text-amber-600">{stats.submitted.length}</p>
        </Card>
        <Card className="p-3 border-emerald-200 dark:border-emerald-800/40">
          <p className="text-[10px] text-muted-foreground">معتمد</p>
          <p className="text-lg font-bold text-emerald-600">{stats.approved.length}</p>
        </Card>
        <Card className="p-3 border-primary/20">
          <p className="text-[10px] text-muted-foreground">مدفوع</p>
          <p className="text-lg font-bold text-primary">{stats.paid.length}</p>
        </Card>
        <Card className="p-3">
          <p className="text-[10px] text-muted-foreground">صافي قيد الاعتماد</p>
          <p className="text-lg font-bold tabular-nums">₪{fmt(stats.totalNetSubmitted)}</p>
        </Card>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <Card><CardContent className="p-4 space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent></Card>
      )}

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            تعذر تحميل البيانات: {error instanceof Error ? error.message : "خطأ غير معروف"}
          </AlertDescription>
        </Alert>
      )}

      {/* Empty state */}
      {!isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground space-y-2">
            <p>لم يتم تقديم أي راتب لهذا الشهر بعد.</p>
            <p className="text-xs">
              افتح بطاقة كل موظف ← تبويب «معاينة الراتب» ← اضغط «تقديم للاعتماد».
            </p>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      {!isLoading && rows.length > 0 && (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between">
            <CardTitle className="text-base">رواتب {arabicMonths[month - 1]} {year}</CardTitle>
            {stats.submitted.length > 0 && (
              <Button
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={approveBatchMut.isPending}
                className="gap-1 bg-emerald-600 hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4" />
                اعتماد كل قيد الاعتماد ({stats.submitted.length})
              </Button>
            )}
            {stats.approvedUnpaid.length > 0 && (
              <Button
                size="sm"
                onClick={() => setPayOpen(true)}
                disabled={payBatchMut.isPending}
                className="gap-1 bg-primary hover:bg-primary/90"
              >
                <Banknote className="h-4 w-4" />
                دفع جماعي ({stats.approvedUnpaid.length})
              </Button>
            )}
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">الموظف</TableHead>
                  <TableHead className="text-right">الأساسي</TableHead>
                  <TableHead className="text-right">البدلات</TableHead>
                  <TableHead className="text-right">الخصومات</TableHead>
                  <TableHead className="text-right">الصافي</TableHead>
                  <TableHead className="text-right">الحالة</TableHead>
                  <TableHead className="text-right">إجراءات</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">
                      <div className="font-medium">{r.employees?.full_name || "—"}</div>
                      {r.employees?.employee_code && (
                        <div className="text-[10px] text-muted-foreground">
                          {r.employees.employee_code}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">₪{fmt(Number(r.base_salary))}</TableCell>
                    <TableCell className="text-xs tabular-nums text-emerald-600">
                      +₪{fmt(Number(r.total_allowances) + Number(r.total_overtime || 0))}
                    </TableCell>
                    <TableCell className="text-xs tabular-nums text-rose-600">
                      -₪{fmt(Number(r.total_deductions))}
                    </TableCell>
                    <TableCell className="text-xs font-bold tabular-nums">
                      ₪{fmt(Number(r.net_salary))}
                    </TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {r.status === "submitted" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={approveOneMut.isPending}
                            onClick={() =>
                              approveOneMut.mutate({
                                payrollId: r.id,
                                employeeId: r.employee_id,
                              })
                            }
                            className="h-7 px-2 gap-1 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                          >
                            <CheckCircle2 className="h-3 w-3" />
                            اعتماد
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          asChild
                          className="h-7 px-2"
                        >
                          <Link to={`/hr/employee/${r.employee_id}`}>
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Batch confirm dialog */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد اعتماد الدفعة</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم اعتماد <b>{stats.submitted.length}</b> راتب بإجمالي صافي{" "}
              <b>₪{fmt(stats.totalNetSubmitted)}</b>.
              <br />
              بعد الاعتماد <b>لن يمكن تعديل</b> قيم الراتب أو حذفه إلا بإعادة فتحه يدوياً.
              <br />
              <span className="text-xs text-muted-foreground">
                لا يتم إنشاء قيود محاسبية أو سندات صرف في هذه المرحلة.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleBatchApprove}
              disabled={approveBatchMut.isPending}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              تأكيد الاعتماد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Batch payment dialog */}
      {data?.ownerId && (
        <PayrollPaymentDialog
          open={payOpen}
          onOpenChange={setPayOpen}
          title="دفع جماعي للرواتب المعتمدة"
          summary={`${stats.approvedUnpaid.length} موظف — إجمالي ₪${fmt(stats.totalApprovedUnpaid)}`}
          isSubmitting={payBatchMut.isPending}
          onConfirm={(p) => {
            payBatchMut.mutate(
              {
                userId: data.ownerId,
                year, month,
                paymentMethod: p.paymentMethod,
                bankAccountId: p.bankAccountId,
                chequeNumber: p.chequeNumber,
                chequeDueDate: p.chequeDueDate,
                paymentDate: p.paymentDate,
              },
              { onSuccess: () => setPayOpen(false) },
            );
          }}
        />
      )}
    </div>
  );
}