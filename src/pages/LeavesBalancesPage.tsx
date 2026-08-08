import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { FinanceShell } from "@/components/finance/shell";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Upload, Users, Palmtree, Heart, TrendingUp, TrendingDown, FileSpreadsheet } from "lucide-react";
import { calculateAnnualLeaveEntitlement, calculateLeaveBalance, calculateSickBalance } from "@/lib/hr-utils";
import { fetchConfirmedReversals, netUsedDays, emptyBucket } from "@/lib/hr/leaveReversals";
import { LeaveBalancesImportDialog } from "@/components/hr/LeaveBalancesImportDialog";
import { multiWordMatchAny } from "@/lib/utils";
import { format } from "date-fns";

type EmpRow = {
  id: string;
  full_name: string;
  employee_number: string | null;
  start_date: string | null;
  previous_year_balance: number;
  sick_leave_days: number;
  branch_name: string;
  department: string | null;
  usedAnnual: number;
  usedSick: number;
  entitlement: number;      // prorated to year-end
  accruedToDate: number;    // accrued up to today
  carriedOver: number;
  availableAnnual: number;
  availableYearEnd: number;  // متاح لنهاية السنة (استحقاق السنة كاملاً)
  availableSick: number;
  sickEntitlement: number;      // prorated to year-end
  sickAccruedToDate: number;    // accrued up to today
};

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function LeavesBalancesPage() {
  const { dataOwnerId } = useDataOwnerId();
  const [q, setQ] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("all");
  const [importOpen, setImportOpen] = useState(false);
  const [detailFor, setDetailFor] = useState<EmpRow | null>(null);

  const { data: employees = [], refetch, isLoading } = useQuery({
    queryKey: ["leaves-balances-employees", dataOwnerId],
    queryFn: async () => {
      if (!dataOwnerId) return [];
      const { data, error } = await supabase
        .from("employees")
        .select("id, full_name, employee_number, start_date, previous_year_balance, sick_leave_days, department, branches(name)")
        .eq("user_id", dataOwnerId)
        .not("full_name", "ilike", "%دايال%")
        .order("employee_number");
      if (error) throw error;
      return data || [];
    },
    enabled: !!dataOwnerId,
  });

  const { data: leaves = [] } = useQuery({
    queryKey: ["leaves-balances-leaves", dataOwnerId],
    queryFn: async () => {
      if (!dataOwnerId) return [];
      const { data, error } = await supabase
        .from("employee_leaves")
        .select("id, employee_id, leave_type, start_date, end_date, days_count, status, notes")
        .eq("user_id", dataOwnerId)
        .gte("start_date", `${new Date().getFullYear()}-01-01`);
      if (error) throw error;
      return data || [];
    },
    enabled: !!dataOwnerId,
  });

  const { data: reversalMap } = useQuery({
    queryKey: ["leaves-balances-reversals", dataOwnerId],
    queryFn: () => fetchConfirmedReversals({ ownerId: dataOwnerId }),
    enabled: !!dataOwnerId,
  });

  const rows: EmpRow[] = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const approvedByEmp = new Map<string, { annual: number; sick: number }>();
    for (const l of leaves as any[]) {
      if (!(l.status === "approved" || l.status === "موافق عليها")) continue;
      const y = new Date(l.start_date).getFullYear();
      if (y !== currentYear) continue;
      const bucket = approvedByEmp.get(l.employee_id) || { annual: 0, sick: 0 };
      const d = Number(l.days_count || 0);
      if (l.leave_type === "سنوية") bucket.annual += d;
      else if (l.leave_type === "مرضية") bucket.sick += d;
      approvedByEmp.set(l.employee_id, bucket);
    }
    return (employees as any[]).map((e) => {
      const raw = approvedByEmp.get(e.id) || { annual: 0, sick: 0 };
      const rev = reversalMap?.get(e.id) || emptyBucket();
      const used = {
        annual: netUsedDays(raw.annual, rev.annual),
        sick: netUsedDays(raw.sick, rev.sick),
      };
      const startDate = e.start_date || "2024-01-01";
      const bal = calculateLeaveBalance(startDate, Number(e.previous_year_balance || 0), used.annual);
      const sickEnt = Number(e.sick_leave_days || 14);
      const sickBal = calculateSickBalance(startDate, used.sick, sickEnt);
      return {
        id: e.id,
        full_name: e.full_name,
        employee_number: e.employee_number,
        start_date: e.start_date,
        previous_year_balance: Number(e.previous_year_balance || 0),
        sick_leave_days: sickEnt,
        branch_name: e.branches?.name || "—",
        department: e.department,
        usedAnnual: used.annual,
        usedSick: used.sick,
        entitlement: bal.entitlement,
        accruedToDate: bal.accruedToDate,
        carriedOver: bal.carriedOver,
        availableAnnual: bal.available,
        availableYearEnd: +(bal.carriedOver + bal.entitlement - used.annual).toFixed(2),
        availableSick: sickBal.available,
        sickEntitlement: sickBal.entitlement,
        sickAccruedToDate: sickBal.accruedToDate,
      };
    });
  }, [employees, leaves, reversalMap]);

  const branches = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => r.branch_name && s.add(r.branch_name));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (branchFilter !== "all" && r.branch_name !== branchFilter) return false;
      if (q.trim() && !multiWordMatchAny(q, r.full_name, r.employee_number || "", r.branch_name, r.department || "")) return false;
      return true;
    });
  }, [rows, branchFilter, q]);

  const totals = useMemo(() => {
    return filtered.reduce(
      (acc, r) => {
        acc.employees++;
        acc.usedAnnual += r.usedAnnual;
        acc.usedSick += r.usedSick;
        acc.availAnnual += r.availableAnnual;
        acc.availYearEnd += r.availableYearEnd;
        acc.availSick += r.availableSick;
        return acc;
      },
      { employees: 0, usedAnnual: 0, usedSick: 0, availAnnual: 0, availYearEnd: 0, availSick: 0 }
    );
  }, [filtered]);

  return (
    <FinanceShell
      title="أرصدة الإجازات"
      subtitle="عرض ومتابعة الأرصدة السنوية والمرضية لجميع الموظفين"
      breadcrumb={[
        { label: "الموارد البشرية", href: "/hr" },
        { label: "أرصدة الإجازات" },
      ]}
      rightSlot={
        <Button size="sm" onClick={() => setImportOpen(true)}>
          <Upload className="h-4 w-4 ml-1" /> استيراد Excel
        </Button>
      }
    >
      <div className="space-y-4" dir="rtl">
        {/* Filters */}
        <Card className="p-3 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="text-[11px] text-muted-foreground block mb-1">بحث</label>
            <div className="relative">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="الاسم / الرقم / الفرع / القسم"
                className="h-8 pr-7 text-[12.5px]"
              />
            </div>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">الفرع</label>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="h-8 w-[180px] text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-primary" />
              <span className="text-[10px] text-muted-foreground">عدد الموظفين</span>
            </div>
            <p className="text-sm font-bold tabular-nums">{totals.employees}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="h-4 w-4 text-amber-600" />
              <span className="text-[10px] text-muted-foreground">مستخدم سنوي</span>
            </div>
            <p className="text-sm font-bold tabular-nums text-amber-700">{fmt(totals.usedAnnual)}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-emerald-600" />
              <span className="text-[10px] text-muted-foreground">متاح سنوي</span>
            </div>
            <p className="text-sm font-bold tabular-nums text-emerald-700">{fmt(totals.availAnnual)}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-indigo-600" />
              <span className="text-[10px] text-muted-foreground">متاح لنهاية السنة</span>
            </div>
            <p className="text-sm font-bold tabular-nums text-indigo-700">{fmt(totals.availYearEnd)}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Heart className="h-4 w-4 text-rose-600" />
              <span className="text-[10px] text-muted-foreground">مستخدم مرضي</span>
            </div>
            <p className="text-sm font-bold tabular-nums text-rose-700">{fmt(totals.usedSick)}</p>
          </Card>
          <Card className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Palmtree className="h-4 w-4 text-teal-600" />
              <span className="text-[10px] text-muted-foreground">متاح مرضي</span>
            </div>
            <p className="text-sm font-bold tabular-nums text-teal-700">{fmt(totals.availSick)}</p>
          </Card>
        </div>

        {/* Grid */}
        <Card className="overflow-hidden">
          <div className="overflow-auto max-h-[calc(100vh-380px)]">
            <table className="w-full text-[12.5px]">
              <thead className="bg-muted/60 sticky top-0 z-10">
                <tr className="text-right">
                  <th className="px-3 py-2 font-semibold w-10 text-center">#</th>
                  <th className="px-3 py-2 font-semibold">الرقم</th>
                  <th className="px-3 py-2 font-semibold">الموظف</th>
                  <th className="px-3 py-2 font-semibold">الفرع</th>
                  <th className="px-3 py-2 font-semibold">القسم</th>
                  <th className="px-3 py-2 font-semibold text-center">تاريخ التعيين</th>
                  <th className="px-3 py-2 font-semibold text-center bg-amber-500/10">افتتاحي</th>
                  <th className="px-3 py-2 font-semibold text-center bg-amber-500/10">استحقاق سنوي</th>
                  <th className="px-3 py-2 font-semibold text-center bg-amber-500/10">مستحق حتى اليوم</th>
                  <th className="px-3 py-2 font-semibold text-center bg-amber-500/10">مستخدم</th>
                  <th className="px-3 py-2 font-semibold text-center bg-amber-500/10">متاح</th>
                  <th className="px-3 py-2 font-semibold text-center bg-amber-500/10">متاح لنهاية السنة</th>
                  <th className="px-3 py-2 font-semibold text-center bg-rose-500/10">مرضي</th>
                  <th className="px-3 py-2 font-semibold text-center bg-rose-500/10">مستحق حتى اليوم</th>
                  <th className="px-3 py-2 font-semibold text-center bg-rose-500/10">مستخدم</th>
                  <th className="px-3 py-2 font-semibold text-center bg-rose-500/10">متاح</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                    <tr><td colSpan={16} className="text-center py-10 text-muted-foreground">جاري التحميل...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={16} className="text-center py-10 text-muted-foreground">لا توجد بيانات</td></tr>
                ) : (
                  filtered.map((r, i) => (
                    <tr
                      key={r.id}
                      className="border-t border-border hover:bg-muted/30 cursor-pointer"
                      onClick={() => setDetailFor(r)}
                    >
                      <td className="px-3 py-2 text-center text-muted-foreground">{i + 1}</td>
                      <td className="px-3 py-2 tabular-nums">{r.employee_number || "—"}</td>
                      <td className="px-3 py-2 font-medium">{r.full_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.branch_name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.department || "—"}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">
                        {r.start_date ? format(new Date(r.start_date), "yyyy-MM-dd") : "—"}
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">{fmt(r.carriedOver)}</td>
                      <td className="px-3 py-2 text-center tabular-nums">{fmt(r.entitlement)}</td>
                      <td className="px-3 py-2 text-center tabular-nums font-semibold">{fmt(r.accruedToDate)}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-amber-700">{fmt(r.usedAnnual)}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30 tabular-nums">
                          {fmt(r.availableAnnual)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className="bg-indigo-500/10 text-indigo-700 border-indigo-500/30 tabular-nums">
                          {fmt(r.availableYearEnd)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">{fmt(r.sickEntitlement)}</td>
                      <td className="px-3 py-2 text-center tabular-nums font-semibold">{fmt(r.sickAccruedToDate)}</td>
                      <td className="px-3 py-2 text-center tabular-nums text-rose-700">{fmt(r.usedSick)}</td>
                      <td className="px-3 py-2 text-center">
                        <Badge variant="outline" className="bg-teal-500/10 text-teal-700 border-teal-500/30 tabular-nums">
                          {fmt(r.availableSick)}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Detail Dialog */}
      <Dialog open={!!detailFor} onOpenChange={(v) => !v && setDetailFor(null)}>
        <DialogContent className="max-w-3xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-primary" />
              {detailFor?.full_name} — أرصدة الإجازات
            </DialogTitle>
          </DialogHeader>
          {detailFor && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="border rounded-lg p-2">
                  <div className="text-muted-foreground text-[10px]">الرقم</div>
                  <div className="font-semibold">{detailFor.employee_number || "—"}</div>
                </div>
                <div className="border rounded-lg p-2">
                  <div className="text-muted-foreground text-[10px]">الفرع</div>
                  <div className="font-semibold">{detailFor.branch_name}</div>
                </div>
                <div className="border rounded-lg p-2">
                  <div className="text-muted-foreground text-[10px]">تاريخ التعيين</div>
                  <div className="font-semibold tabular-nums">
                    {detailFor.start_date ? format(new Date(detailFor.start_date), "yyyy-MM-dd") : "—"}
                  </div>
                </div>
                <div className="border rounded-lg p-2">
                  <div className="text-muted-foreground text-[10px]">القسم</div>
                  <div className="font-semibold">{detailFor.department || "—"}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="border rounded-lg p-3 bg-amber-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Palmtree className="h-4 w-4 text-amber-700" />
                    <h4 className="text-sm font-bold text-amber-800">إجازة سنوية</h4>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span>رصيد افتتاحي</span><span className="tabular-nums font-medium">{fmt(detailFor.carriedOver)}</span></div>
                    <div className="flex justify-between"><span>استحقاق السنة (متناسب)</span><span className="tabular-nums font-medium">{fmt(detailFor.entitlement)}</span></div>
                    <div className="flex justify-between"><span>مستحق حتى اليوم</span><span className="tabular-nums font-medium">{fmt(detailFor.accruedToDate)}</span></div>
                    <div className="flex justify-between"><span>مستخدم</span><span className="tabular-nums font-medium text-amber-700">{fmt(detailFor.usedAnnual)}</span></div>
                    <div className="border-t pt-1 mt-1 flex justify-between font-bold text-emerald-700"><span>المتاح</span><span className="tabular-nums">{fmt(detailFor.availableAnnual)}</span></div>
                    <div className="flex justify-between font-bold text-indigo-700"><span>المتاح لنهاية السنة</span><span className="tabular-nums">{fmt(detailFor.availableYearEnd)}</span></div>
                  </div>
                </div>
                <div className="border rounded-lg p-3 bg-rose-500/5">
                  <div className="flex items-center gap-2 mb-2">
                    <Heart className="h-4 w-4 text-rose-700" />
                    <h4 className="text-sm font-bold text-rose-800">إجازة مرضية</h4>
                  </div>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between"><span>استحقاق السنة (متناسب)</span><span className="tabular-nums font-medium">{fmt(detailFor.sickEntitlement)}</span></div>
                    <div className="flex justify-between"><span>مستحق حتى اليوم</span><span className="tabular-nums font-medium">{fmt(detailFor.sickAccruedToDate)}</span></div>
                    <div className="flex justify-between"><span>مستخدم</span><span className="tabular-nums font-medium text-rose-700">{fmt(detailFor.usedSick)}</span></div>
                    <div className="border-t pt-1 mt-1 flex justify-between font-bold text-teal-700"><span>المتاح</span><span className="tabular-nums">{fmt(detailFor.availableSick)}</span></div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold mb-2">سجل الإجازات هذه السنة</h4>
                <div className="border rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/60 sticky top-0">
                      <tr>
                        <th className="px-2 py-1.5 text-right">النوع</th>
                        <th className="px-2 py-1.5 text-right">من</th>
                        <th className="px-2 py-1.5 text-right">إلى</th>
                        <th className="px-2 py-1.5 text-center">أيام</th>
                        <th className="px-2 py-1.5 text-right">الحالة</th>
                        <th className="px-2 py-1.5 text-right">ملاحظات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(leaves as any[])
                        .filter((l) => l.employee_id === detailFor.id)
                        .sort((a, b) => (b.start_date || "").localeCompare(a.start_date || ""))
                        .map((l) => (
                          <tr key={l.id} className="border-t">
                            <td className="px-2 py-1.5">{l.leave_type}</td>
                            <td className="px-2 py-1.5 tabular-nums">{l.start_date}</td>
                            <td className="px-2 py-1.5 tabular-nums">{l.end_date}</td>
                            <td className="px-2 py-1.5 text-center tabular-nums">{l.days_count}</td>
                            <td className="px-2 py-1.5">
                              <Badge variant="outline" className={
                                l.status === "approved" ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" :
                                l.status === "rejected" ? "bg-rose-500/10 text-rose-700 border-rose-500/30" :
                                "bg-amber-500/10 text-amber-700 border-amber-500/30"
                              }>
                                {l.status === "approved" ? "معتمدة" : l.status === "rejected" ? "مرفوضة" : "معلقة"}
                              </Badge>
                            </td>
                            <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[200px]">{l.notes || "—"}</td>
                          </tr>
                        ))}
                      {(leaves as any[]).filter((l) => l.employee_id === detailFor.id).length === 0 && (
                        <tr><td colSpan={6} className="text-center py-4 text-muted-foreground">لا توجد إجازات</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {dataOwnerId && (
        <LeaveBalancesImportDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          dataOwnerId={dataOwnerId}
          employees={(employees as any[]).map((e) => ({
            id: e.id,
            full_name: e.full_name,
            employee_number: e.employee_number,
          }))}
          onDone={() => refetch()}
        />
      )}
    </FinanceShell>
  );
}