import { useMemo, useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Wallet,
  ShieldCheck,
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import {
  usePayrollMonth,
  usePayPayrollEmployee,
  usePayPayrollBatch,
  PAYROLL_STATUS_META,
  type PayrollStatus,
} from "@/hooks/hr/usePayrollApproval";
import { PayrollPaymentDialog } from "@/components/hr/payroll/PayrollPaymentDialog";
import { toast } from "sonner";

const arabicMonths = [
  "يناير","فبراير","مارس","أبريل","مايو","يونيو",
  "يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر",
];
const fmt = (v: number) =>
  new Intl.NumberFormat("ar", { maximumFractionDigits: 2 }).format(Number(v || 0));

const LAST_METHOD_KEY = "payroll-payment:last-method";
const LAST_BANK_KEY = "payroll-payment:last-bank";

function StatusBadge({ status }: { status: PayrollStatus }) {
  const meta = PAYROLL_STATUS_META[status];
  const cls =
    meta.tone === "amber"
      ? "bg-amber-100 text-amber-700"
      : meta.tone === "emerald"
      ? "bg-emerald-100 text-emerald-700"
      : meta.tone === "primary"
      ? "bg-primary/10 text-primary"
      : meta.tone === "rose"
      ? "bg-rose-100 text-rose-700"
      : "bg-muted text-muted-foreground";
  return <Badge variant="outline" className={`${cls} border-0 font-medium`}>{meta.label}</Badge>;
}

/**
 * B3.7.1 — Payroll Payment Center
 *
 * Dedicated execution surface for finance / cashier role.
 * - Lists ONLY `approved` rows (paid rows are shown as audit context).
 * - Filters: month, year, branch.
 * - Selection: per-row checkbox + select-all.
 * - Single payment-method picker for the whole action.
 * - "دفع المحدد" → loops payroll_pay_employee per row (atomic per row).
 * - "دفع الكل المعتمد للشهر" → calls payroll_pay_batch (single voucher).
 *
 * No accounting logic here. All posting happens inside the SECURITY DEFINER
 * RPCs on the database side. The DB trigger trg_guard_employee_payroll_payment
 * blocks any other path to the `paid` state.
 */
export default function PayrollPaymentCenter() {
  const [params, setParams] = useSearchParams();

  const now = new Date();
  const initialYear = Number(params.get("year")) || now.getFullYear();
  const initialMonth = Number(params.get("month")) || now.getMonth() + 1;
  const initialBranch = params.get("branch") || "all";

  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [branchId, setBranchId] = useState<string>(initialBranch);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Sync filters → URL (so Approval Center can deep-link with ?month=&branch=)
  useEffect(() => {
    const next = new URLSearchParams(params);
    next.set("year", String(year));
    next.set("month", String(month));
    if (branchId && branchId !== "all") next.set("branch", branchId);
    else next.delete("branch");
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, branchId]);

  const monthQ = usePayrollMonth(year, month);

  // Branches for filter
  const branchesQ = useQuery({
    queryKey: ["payroll-payment-branches", monthQ.data?.ownerId],
    enabled: !!monthQ.data?.ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id,name")
        .eq("user_id", monthQ.data!.ownerId)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Resolve employee → branch map for filtering
  const employeeBranchQ = useQuery({
    queryKey: ["payroll-payment-emp-branches", monthQ.data?.ownerId],
    enabled: !!monthQ.data?.ownerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id,branch_id")
        .eq("user_id", monthQ.data!.ownerId);
      if (error) throw error;
      const map = new Map<string, string | null>();
      (data || []).forEach((e: any) => map.set(e.id, e.branch_id));
      return map;
    },
  });

  const allRows = monthQ.data?.rows || [];
  const empBranchMap = employeeBranchQ.data;

  // Show only approved + paid (paid is audit only). Filter by branch if chosen.
  const visibleRows = useMemo(() => {
    return allRows
      .filter((r: any) => r.status === "approved" || r.status === "paid")
      .filter((r: any) => {
        if (!branchId || branchId === "all") return true;
        const b = empBranchMap?.get(r.employee_id) ?? null;
        return b === branchId;
      });
  }, [allRows, branchId, empBranchMap]);

  const approvedRows = visibleRows.filter((r: any) => r.status === "approved");
  const paidRows = visibleRows.filter((r: any) => r.status === "paid");

  // ── Selection ──
  // Default: all approved selected when data changes
  useEffect(() => {
    setSelected(new Set(approvedRows.map((r: any) => r.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, month, branchId, allRows.length]);

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const allSelected =
    approvedRows.length > 0 && approvedRows.every((r: any) => selected.has(r.id));
  const someSelected = selected.size > 0 && !allSelected;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(approvedRows.map((r: any) => r.id)));
  };

  const selectedRows = approvedRows.filter((r: any) => selected.has(r.id));
  const selectedTotal = selectedRows.reduce((s, r: any) => s + Number(r.net_salary || 0), 0);
  const totalApproved = approvedRows.reduce((s, r: any) => s + Number(r.net_salary || 0), 0);
  const totalPaid = paidRows.reduce((s, r: any) => s + Number(r.net_salary || 0), 0);

  // ── Payment dialogs ──
  const [selectedPayOpen, setSelectedPayOpen] = useState(false);
  const [batchPayOpen, setBatchPayOpen] = useState(false);

  const payOne = usePayPayrollEmployee();
  const payBatch = usePayPayrollBatch();
  const [bulkBusy, setBulkBusy] = useState(false);

  const remember = (method: string, bankId: string | null) => {
    try {
      localStorage.setItem(LAST_METHOD_KEY, method);
      if (bankId) localStorage.setItem(LAST_BANK_KEY, bankId);
      else localStorage.removeItem(LAST_BANK_KEY);
    } catch { /* ignore */ }
  };

  // Pay selected — sequential per-row to avoid race conditions on guards
  const handlePaySelected = async (payload: any) => {
    setBulkBusy(true);
    setSelectedPayOpen(false);
    remember(payload.paymentMethod, payload.bankAccountId);

    let ok = 0, fail = 0;
    for (const row of selectedRows) {
      try {
        await payOne.mutateAsync({
          payrollId: row.id,
          employeeId: row.employee_id,
          paymentMethod: payload.paymentMethod,
          bankAccountId: payload.bankAccountId,
          chequeNumber: payload.chequeNumber,
          chequeDueDate: payload.chequeDueDate,
          paymentDate: payload.paymentDate,
          paymentAccountCode: payload.paymentAccountCode,
        });
        ok += 1;
      } catch (e: any) {
        fail += 1;
        // toast is already shown by the mutation hook
      }
    }
    setBulkBusy(false);
    if (fail === 0) toast.success(`✅ تم دفع ${ok} راتب بنجاح`);
    else toast.warning(`تم دفع ${ok} ، فشل ${fail}`);
    setSelected(new Set());
    monthQ.refetch();
  };

  const handlePayBatch = async (payload: any) => {
    if (!monthQ.data?.ownerId) return;
    setBatchPayOpen(false);
    remember(payload.paymentMethod, payload.bankAccountId);
    try {
      await payBatch.mutateAsync({
        userId: monthQ.data.ownerId,
        year,
        month,
        paymentMethod: payload.paymentMethod,
        bankAccountId: payload.bankAccountId,
        chequeNumber: payload.chequeNumber,
        chequeDueDate: payload.chequeDueDate,
        paymentDate: payload.paymentDate,
        paymentAccountCode: payload.paymentAccountCode,
      });
      setSelected(new Set());
    } catch { /* mutation hook toasts */ }
  };

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 max-w-7xl" dir="rtl">
      {/* ─── Header ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold">مركز دفع الرواتب</h1>
              <p className="text-xs text-muted-foreground">
                تنفيذ دفع الرواتب المعتمدة وإصدار سندات الصرف والقيود المحاسبية
              </p>
            </div>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to={`/payroll/approval?year=${year}&month=${month}`}>
            <ShieldCheck className="h-4 w-4 ml-1" />
            مركز الاعتماد
            <ExternalLink className="h-3 w-3 mr-1" />
          </Link>
        </Button>
      </div>

      {/* ─── Filters ─── */}
      <Card>
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">السنة</label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">الشهر</label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {arabicMonths.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <label className="text-xs text-muted-foreground mb-1 block">الفرع</label>
            <Select value={branchId} onValueChange={setBranchId}>
              <SelectTrigger><SelectValue placeholder="كل الفروع" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                {(branchesQ.data || []).map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* ─── KPI strip ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">معتمد للدفع</div>
          <div className="text-lg font-bold text-emerald-700">{approvedRows.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">إجمالي المعتمد</div>
          <div className="text-lg font-bold">₪{fmt(totalApproved)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">المحدد</div>
          <div className="text-lg font-bold text-primary">{selectedRows.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">إجمالي المحدد</div>
          <div className="text-lg font-bold text-primary">₪{fmt(selectedTotal)}</div>
        </CardContent></Card>
      </div>

      {/* ─── Action bar ─── */}
      <div className="flex flex-wrap items-center justify-between gap-3 sticky top-0 z-10 bg-background/95 backdrop-blur py-2 border-b">
        <div className="text-sm text-muted-foreground">
          {selectedRows.length > 0
            ? `محدد: ${selectedRows.length} موظف — ₪${fmt(selectedTotal)}`
            : "لم يتم اختيار أي موظف"}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            disabled={selectedRows.length === 0 || bulkBusy}
            onClick={() => setSelectedPayOpen(true)}
          >
            <Banknote className="h-4 w-4 ml-1" />
            دفع المحدد ({selectedRows.length})
          </Button>
          <Button
            disabled={approvedRows.length === 0 || bulkBusy}
            onClick={() => setBatchPayOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            <CheckCircle2 className="h-4 w-4 ml-1" />
            دفع الكل ({approvedRows.length})
          </Button>
        </div>
      </div>

      {/* ─── Table ─── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            رواتب {arabicMonths[month - 1]} {year}
            {paidRows.length > 0 && (
              <span className="text-xs text-muted-foreground font-normal mr-2">
                · مدفوع: {paidRows.length} (₪{fmt(totalPaid)})
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {monthQ.isLoading ? (
            <div className="space-y-2">
              {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : visibleRows.length === 0 ? (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>لا توجد رواتب جاهزة للدفع</AlertTitle>
              <AlertDescription>
                لا توجد رواتب معتمدة لهذا الشهر/الفرع. اعتمد الرواتب أولاً من{" "}
                <Link to={`/payroll/approval?year=${year}&month=${month}`} className="underline">
                  مركز الاعتماد
                </Link>.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected}
                        onCheckedChange={toggleAll}
                        aria-label="تحديد الكل"
                        // visual indeterminate
                        data-state={someSelected ? "indeterminate" : allSelected ? "checked" : "unchecked"}
                      />
                    </TableHead>
                    <TableHead>الموظف</TableHead>
                    <TableHead className="text-left">صافي الراتب</TableHead>
                    <TableHead>الحالة</TableHead>
                    <TableHead className="text-left">تاريخ الدفع</TableHead>
                    <TableHead className="text-left w-24">إجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((row: any) => {
                    const emp = row.employees;
                    const isApproved = row.status === "approved";
                    return (
                      <TableRow key={row.id} className={!isApproved ? "opacity-60" : ""}>
                        <TableCell>
                          {isApproved ? (
                            <Checkbox
                              checked={selected.has(row.id)}
                              onCheckedChange={() => toggleOne(row.id)}
                              aria-label={`اختر ${emp?.full_name}`}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">
                          {emp?.full_name || "—"}
                        </TableCell>
                        <TableCell className="text-left font-mono">
                          ₪{fmt(row.net_salary)}
                        </TableCell>
                        <TableCell><StatusBadge status={row.status} /></TableCell>
                        <TableCell className="text-left text-xs text-muted-foreground">
                          {row.paid_date || "—"}
                        </TableCell>
                        <TableCell className="text-left">
                          {isApproved && (
                            <SinglePayButton
                              row={row}
                              busy={bulkBusy}
                              onAfter={() => monthQ.refetch()}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── Pay-selected dialog ─── */}
      <PayrollPaymentDialog
        open={selectedPayOpen}
        onOpenChange={setSelectedPayOpen}
        title={`دفع ${selectedRows.length} موظف محدد`}
        summary={`الإجمالي: ₪${fmt(selectedTotal)} — سند صرف لكل موظف`}
        isSubmitting={bulkBusy}
        onConfirm={handlePaySelected}
      />

      {/* ─── Pay-batch dialog ─── */}
      <PayrollPaymentDialog
        open={batchPayOpen}
        onOpenChange={setBatchPayOpen}
        title={`دفع كل الرواتب المعتمدة — ${arabicMonths[month - 1]} ${year}`}
        summary={`${approvedRows.length} موظف — إجمالي ₪${fmt(totalApproved)} — سند صرف واحد جماعي`}
        isSubmitting={payBatch.isPending}
        onConfirm={handlePayBatch}
      />
    </div>
  );
}

/**
 * Per-row pay button — opens its own dialog so the cashier can pay one
 * employee with a different method/account without disturbing the bulk
 * selection.
 */
function SinglePayButton({
  row,
  busy,
  onAfter,
}: {
  row: any;
  busy: boolean;
  onAfter: () => void;
}) {
  const [open, setOpen] = useState(false);
  const payOne = usePayPayrollEmployee();

  const handle = async (payload: any) => {
    try {
      await payOne.mutateAsync({
        payrollId: row.id,
        employeeId: row.employee_id,
        paymentMethod: payload.paymentMethod,
        bankAccountId: payload.bankAccountId,
        chequeNumber: payload.chequeNumber,
        chequeDueDate: payload.chequeDueDate,
        paymentDate: payload.paymentDate,
        paymentAccountCode: payload.paymentAccountCode,
      });
      setOpen(false);
      onAfter();
    } catch { /* hook toasts */ }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={busy || payOne.isPending}
        onClick={() => setOpen(true)}
      >
        <Banknote className="h-3.5 w-3.5 ml-1" />
        دفع
      </Button>
      <PayrollPaymentDialog
        open={open}
        onOpenChange={setOpen}
        title={`دفع راتب — ${row.employees?.full_name || ""}`}
        summary={`صافي الراتب: ₪${new Intl.NumberFormat("ar").format(Number(row.net_salary || 0))}`}
        isSubmitting={payOne.isPending}
        onConfirm={handle}
      />
    </>
  );
}