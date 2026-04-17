import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Employee360Data } from "@/hooks/hr/useEmployee360";

interface Props {
  data: Employee360Data;
}

const fmt = (v: number) =>
  new Intl.NumberFormat("ar", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(v || 0));

export function LoansTab({ data }: Props) {
  const loans = data.loans.list || [];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card className="p-3 text-right">
          <p className="text-[11px] text-muted-foreground mb-1">إجمالي القروض النشطة</p>
          <p className="text-xl font-bold tabular-nums text-primary">₪{fmt(data.loans.activeTotal)}</p>
        </Card>
        <Card className="p-3 text-right">
          <p className="text-[11px] text-muted-foreground mb-1">المتبقي السداد</p>
          <p className="text-xl font-bold tabular-nums text-amber-600">₪{fmt(data.loans.remainingTotal)}</p>
        </Card>
        <Card className="p-3 text-right">
          <p className="text-[11px] text-muted-foreground mb-1">القسط الشهري</p>
          <p className="text-xl font-bold tabular-nums text-rose-600">₪{fmt(data.loans.monthlyInstallment)}</p>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-right">القروض</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loans.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">لا توجد قروض.</p>
          ) : (
            loans.map((l: any) => {
              const total = Number(l.total_amount || 0);
              const remaining = Number(l.remaining_amount || 0);
              const paid = Math.max(0, total - remaining);
              const progress = total > 0 ? (paid / total) * 100 : 0;
              const isActive = l.status === "active" || l.status === "نشط";
              return (
                <div key={l.id} className="rounded-lg border p-3 space-y-2 text-right">
                  <div className="flex items-center justify-between gap-3">
                    <Badge
                      variant="outline"
                      className={
                        isActive
                          ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                          : "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                      }
                    >
                      {l.status}
                    </Badge>
                    <div>
                      <p className="text-sm font-semibold tabular-nums">₪{fmt(total)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        قسط ₪{fmt(l.monthly_installment)} × {l.total_months} شهر
                      </p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>{Math.round(progress)}%</span>
                      <span>
                        {l.paid_months}/{l.total_months} قسط — متبقي ₪{fmt(remaining)}
                      </span>
                    </div>
                    <Progress value={progress} className="h-2" />
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
