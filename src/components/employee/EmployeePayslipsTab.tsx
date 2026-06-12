import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Receipt, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency, periodLabel, safeNum } from "@/lib/employeeFinancialDisplay";
import { tPayrollStatus, payrollStatusTone } from "@/lib/hrLabels";
import PayslipDetailsDialog from "./PayslipDetailsDialog";

interface Props { employeeId: string; }

export default function EmployeePayslipsTab({ employeeId }: Props) {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<any | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("employee_payroll")
        .select("*")
        .eq("employee_id", employeeId)
        .order("period_year", { ascending: false })
        .order("period_month", { ascending: false })
        .limit(36);
      if (!cancel) {
        setRows(data || []);
        setLoading(false);
      }
    })();
    return () => { cancel = true; };
  }, [employeeId]);

  return (
    <div className="space-y-3 px-4 pt-3" dir="rtl" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}>
      <h2 className="text-lg font-bold pt-2 flex items-center gap-2">
        <Receipt className="h-5 w-5 text-primary" />
        قسائم الراتب ({rows.length})
      </h2>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 rounded-full border-2 border-muted animate-spin" style={{ borderTopColor: "hsl(var(--primary))" }} />
        </div>
      ) : rows.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="p-6 text-center space-y-2">
            <Receipt className="h-8 w-8 mx-auto text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">لا توجد قسائم راتب بعد</p>
            <p className="text-[11px] text-muted-foreground/70">عند إصدار راتب من قِبل HR ستظهر هنا</p>
          </CardContent>
        </Card>
      ) : (
        rows.map((p) => {
          const status = p.is_paid ? "paid" : (p.status || "pending");
          const additions = safeNum(p.total_allowances);
          return (
            <button key={p.id} type="button" onClick={() => { setSelected(p); setOpen(true); }} className="w-full text-right">
              <Card className="border-border bg-card hover:bg-accent/30 transition-colors active:scale-[0.99]">
                <CardContent className="p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{periodLabel(p.period_month, p.period_year)}</span>
                    <Badge variant="outline" className={`text-[10px] ${payrollStatusTone(status)}`}>{tPayrollStatus(status)}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-lg bg-muted/30 p-1.5 text-center">
                      <div className="text-muted-foreground">راتب الحضور</div>
                      <div className="font-semibold">{formatCurrency(p.attendance_salary)}</div>
                    </div>
                    <div className="rounded-lg bg-emerald-500/10 p-1.5 text-center">
                      <div className="text-emerald-700 dark:text-emerald-400">إضافات</div>
                      <div className="font-semibold text-emerald-700 dark:text-emerald-400">{formatCurrency(additions)}</div>
                    </div>
                    <div className="rounded-lg bg-rose-500/10 p-1.5 text-center">
                      <div className="text-rose-700 dark:text-rose-400">خصومات</div>
                      <div className="font-semibold text-rose-700 dark:text-rose-400">{formatCurrency(p.total_deductions)}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-border pt-2">
                    <span className="text-xs text-muted-foreground">الصافي</span>
                    <div className="flex items-center gap-1">
                      <span className="text-base font-bold text-primary">{formatCurrency(p.net_salary)}</span>
                      <ChevronLeft className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })
      )}

      <PayslipDetailsDialog payslip={selected} open={open} onOpenChange={setOpen} />
    </div>
  );
}
