import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Employee360Data } from "@/hooks/hr/useEmployee360";

interface Props {
  data: Employee360Data;
}

const STATUS_TONE: Record<string, string> = {
  approved: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  معتمد: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  pending: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  "قيد المراجعة": "bg-amber-500/10 text-amber-600 border-amber-500/30",
  rejected: "bg-rose-500/10 text-rose-600 border-rose-500/30",
  مرفوض: "bg-rose-500/10 text-rose-600 border-rose-500/30",
};

export function LeavesTab({ data }: Props) {
  const e = data.employee;
  const requests = data.leaves.requests || [];
  const annualBalance = Number(e?.annual_leave_balance ?? 0);
  const sickBalance = Number(e?.sick_leave_balance ?? 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <BalanceCard label="رصيد سنوي" value={annualBalance} unit="يوم" tone="primary" />
        <BalanceCard label="رصيد مرضي" value={sickBalance} unit="يوم" tone="positive" />
        <BalanceCard label="إجازات معتمدة" value={data.leaves.approvedCount} unit="" tone="positive" />
        <BalanceCard label="إجازات معلقة" value={data.leaves.pendingCount} unit="" tone="warning" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-right">سجل الإجازات</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">لا توجد طلبات إجازة.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr className="text-right">
                    <th className="px-4 py-2 font-medium">النوع</th>
                    <th className="px-4 py-2 font-medium">من</th>
                    <th className="px-4 py-2 font-medium">إلى</th>
                    <th className="px-4 py-2 font-medium">أيام</th>
                    <th className="px-4 py-2 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r: any) => (
                    <tr key={r.id} className="border-t hover:bg-muted/30 text-right">
                      <td className="px-4 py-2">{r.leave_type}</td>
                      <td className="px-4 py-2 tabular-nums">{r.start_date}</td>
                      <td className="px-4 py-2 tabular-nums">{r.end_date}</td>
                      <td className="px-4 py-2 tabular-nums">{r.days_count}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={STATUS_TONE[r.status] || ""}>
                          {r.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BalanceCard({
  label,
  value,
  unit,
  tone,
}: {
  label: string;
  value: number;
  unit: string;
  tone: "positive" | "warning" | "primary";
}) {
  const cls = {
    positive: "text-emerald-700 dark:text-emerald-400",
    warning: "text-amber-700 dark:text-amber-400",
    primary: "text-primary",
  }[tone];
  return (
    <Card className="p-3 text-right">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${cls}`}>
        {value} <span className="text-xs font-normal text-muted-foreground">{unit}</span>
      </p>
    </Card>
  );
}
