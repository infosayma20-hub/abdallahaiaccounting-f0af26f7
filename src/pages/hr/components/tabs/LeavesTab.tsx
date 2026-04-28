import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Employee360Data } from "@/hooks/hr/useEmployee360";
import { HRTable, HRTHead, HRTH, HRTR, HRTD } from "../HRTable";
import { tFormStatus, formStatusTone, tLeaveType } from "@/lib/hrLabels";

interface Props {
  data: Employee360Data;
}

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

      <Card dir="rtl" className="overflow-hidden">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-right">سجل الإجازات</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {requests.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">لا توجد طلبات إجازة.</p>
          ) : (
            <HRTable>
              <HRTHead>
                <HRTH>النوع</HRTH>
                <HRTH>من</HRTH>
                <HRTH>إلى</HRTH>
                <HRTH>أيام</HRTH>
                <HRTH>الحالة</HRTH>
              </HRTHead>
              <tbody>
                {requests.map((r: any) => (
                  <HRTR key={r.id}>
                    <HRTD>{tLeaveType(r.leave_type)}</HRTD>
                    <HRTD numeric>{r.start_date}</HRTD>
                    <HRTD numeric>{r.end_date}</HRTD>
                    <HRTD numeric>{r.days_count}</HRTD>
                    <HRTD>
                      <Badge variant="outline" className={formStatusTone(r.status)}>
                        {tFormStatus(r.status)}
                      </Badge>
                    </HRTD>
                  </HRTR>
                ))}
              </tbody>
            </HRTable>
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
