import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Wallet, ArrowDownCircle, ArrowUpCircle, HandCoins } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEmployeeMovements, tCategory, type EmployeeMovement } from "@/hooks/hr/useEmployeeFinancialMovements";
import { formatCurrency, safeNum } from "@/lib/employeeFinancialDisplay";

interface Props { employeeId: string; }

export default function EmployeeFinancialSummaryTab({ employeeId }: Props) {
  const { data: movements = [], isLoading } = useEmployeeMovements(employeeId);
  const [loanInfo, setLoanInfo] = useState<{ amount: number; start_date?: string; installments?: number } | null>(null);

  // Try to fetch the most recent approved loan_request from employee_forms (best-effort)
  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("employee_forms")
        .select("form_data, created_at, status")
        .eq("employee_id", employeeId)
        .eq("form_type", "loan_request")
        .in("status", ["approved", "pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancel && data?.form_data) {
        const fd: any = data.form_data;
        const amount = safeNum(fd.loan_amount ?? fd.amount);
        if (amount > 0) {
          setLoanInfo({
            amount,
            start_date: fd.work_start_date || data.created_at,
            installments: safeNum(fd.installments) || undefined,
          });
        }
      }
    })();
    return () => { cancel = true; };
  }, [employeeId]);

  const summary = useMemo(() => {
    let owesCompany = 0; // employee debit
    let owedToEmployee = 0; // credit
    const byCategory: Record<string, { debit: number; credit: number }> = {};
    let loanInstallmentsPaid = 0;

    for (const m of movements) {
      const amt = safeNum(m.amount);
      const cat = m.category || "other";
      if (!byCategory[cat]) byCategory[cat] = { debit: 0, credit: 0 };
      if (m.movement_type === "debit") {
        owesCompany += amt;
        byCategory[cat].debit += amt;
        if (cat === "loan_installment") loanInstallmentsPaid += amt;
      } else if (m.movement_type === "credit") {
        owedToEmployee += amt;
        byCategory[cat].credit += amt;
      }
    }
    return {
      owesCompany, owedToEmployee, net: owesCompany - owedToEmployee, byCategory, loanInstallmentsPaid,
    };
  }, [movements]);

  const loanRemaining = loanInfo ? Math.max(0, loanInfo.amount - summary.loanInstallmentsPaid) : null;
  const installmentValue = loanInfo?.installments && loanInfo.installments > 0
    ? loanInfo.amount / loanInfo.installments : null;

  return (
    <div className="space-y-4 px-4 pt-3" dir="rtl" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}>
      <h2 className="text-lg font-bold pt-2 flex items-center gap-2">
        <Wallet className="h-5 w-5 text-primary" />
        ملخصي المالي
      </h2>

      {/* Top KPI cards */}
      <div className="grid grid-cols-3 gap-2">
        <Card className="border-rose-500/20 bg-rose-500/5">
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-rose-700 dark:text-rose-400">
              <ArrowDownCircle className="h-3.5 w-3.5" /> على ذمتي
            </div>
            <div className="text-sm font-bold text-rose-700 dark:text-rose-400">{formatCurrency(summary.owesCompany)}</div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-3 space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-400">
              <ArrowUpCircle className="h-3.5 w-3.5" /> مستحق لي
            </div>
            <div className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{formatCurrency(summary.owedToEmployee)}</div>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3 space-y-1">
            <div className="text-[10px] text-primary">صافي الرصيد</div>
            <div className={`text-sm font-bold ${summary.net >= 0 ? "text-rose-700 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400"}`}>
              {formatCurrency(Math.abs(summary.net))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Loan card */}
      <Card className="border-border bg-card">
        <CardContent className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold">القرض الحسن</span>
          </div>
          {loanInfo ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Field label="قيمة القرض" value={formatCurrency(loanInfo.amount)} />
              {loanInfo.installments != null && <Field label="عدد الدفعات" value={String(loanInfo.installments)} />}
              {installmentValue != null && <Field label="قيمة القسط" value={formatCurrency(installmentValue)} />}
              <Field label="ما تم دفعه" value={formatCurrency(summary.loanInstallmentsPaid)} accent="ok" />
              <Field label="المتبقي" value={formatCurrency(loanRemaining ?? 0)} accent="bad" />
              {loanInfo.start_date && (
                <Field label="تاريخ البداية" value={new Date(loanInfo.start_date).toLocaleDateString("ar-EG-u-ca-gregory")} />
              )}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">لا يوجد قرض حسن نشط حالياً.</p>
          )}
        </CardContent>
      </Card>

      {/* Category breakdown */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs font-semibold">تفصيل حسب البند</div>
          {isLoading ? (
            <div className="flex justify-center py-6">
              <div className="h-5 w-5 rounded-full border-2 border-muted animate-spin" style={{ borderTopColor: "hsl(var(--primary))" }} />
            </div>
          ) : Object.keys(summary.byCategory).length === 0 ? (
            <p className="text-xs text-muted-foreground p-4 text-center">لا توجد حركات مالية</p>
          ) : (
            <ul className="divide-y divide-border">
              {Object.entries(summary.byCategory).map(([cat, totals]) => (
                <li key={cat} className="flex items-center justify-between px-3 py-2 text-xs">
                  <span className="text-muted-foreground">{tCategory(cat)}</span>
                  <div className="flex items-center gap-3">
                    {totals.debit > 0 && <span className="text-rose-600">-{formatCurrency(totals.debit)}</span>}
                    {totals.credit > 0 && <span className="text-emerald-600">+{formatCurrency(totals.credit)}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Latest movements */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          <div className="px-3 py-2 border-b border-border bg-muted/30 text-xs font-semibold">آخر الحركات</div>
          {movements.length === 0 ? (
            <p className="text-xs text-muted-foreground p-4 text-center">لا توجد حركات</p>
          ) : (
            <ul className="divide-y divide-border">
              {movements.slice(0, 20).map((m: EmployeeMovement) => (
                <li key={m.id} className="flex items-center justify-between px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{tCategory(m.category)}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {new Date(m.movement_date).toLocaleDateString("ar-EG-u-ca-gregory")}
                      {m.description ? ` • ${m.description}` : ""}
                    </div>
                  </div>
                  <span className={`shrink-0 font-semibold ${m.movement_type === "debit" ? "text-rose-600" : "text-emerald-600"}`}>
                    {m.movement_type === "debit" ? "-" : "+"}{formatCurrency(m.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, value, accent }: { label: string; value: string; accent?: "ok" | "bad" }) {
  return (
    <div className="rounded-lg bg-muted/30 p-2">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className={`font-semibold ${accent === "ok" ? "text-emerald-600" : accent === "bad" ? "text-rose-600" : "text-foreground"}`}>{value}</div>
    </div>
  );
}
