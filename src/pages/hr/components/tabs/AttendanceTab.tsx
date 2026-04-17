import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Employee360Data } from "@/hooks/hr/useEmployee360";

interface Props {
  data: Employee360Data;
}

const STATUS_TONE: Record<string, string> = {
  present: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  حاضر: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  complete: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  late: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  متأخر: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  absent: "bg-rose-500/10 text-rose-600 border-rose-500/30",
  غائب: "bg-rose-500/10 text-rose-600 border-rose-500/30",
  incomplete: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  ناقص: "bg-orange-500/10 text-orange-600 border-orange-500/30",
};

export function AttendanceTab({ data }: Props) {
  const days = data.attendance.days || [];
  const stats = data.attendance.stats;
  const lastEvent = data.attendance.events?.[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <MiniCard label="إجمالي" value={stats.totalDays} />
        <MiniCard label="حاضر" value={stats.presentDays} tone="positive" />
        <MiniCard label="متأخر" value={stats.lateDays} tone="warning" />
        <MiniCard label="غائب" value={stats.absentDays} tone="danger" />
        <MiniCard label="ساعات إضافية" value={`${stats.totalOvertime.toFixed(1)}`} tone="primary" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-right">آخر تسجيل دخول</CardTitle>
        </CardHeader>
        <CardContent className="text-right">
          {lastEvent ? (
            <div className="flex items-center justify-between text-sm">
              <Badge variant="outline">{lastEvent.event_type}</Badge>
              <span className="text-muted-foreground">
                {new Date(lastEvent.event_time).toLocaleString("ar")}
              </span>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد سجلات دخول حديثة.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-right">سجل الحضور — آخر 30 يوم</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {days.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">لا توجد سجلات حضور.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr className="text-right">
                    <th className="px-4 py-2 font-medium">التاريخ</th>
                    <th className="px-4 py-2 font-medium">دخول</th>
                    <th className="px-4 py-2 font-medium">خروج</th>
                    <th className="px-4 py-2 font-medium">ساعات</th>
                    <th className="px-4 py-2 font-medium">إضافي</th>
                    <th className="px-4 py-2 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {days.map((d: any) => (
                    <tr key={d.id} className="border-t hover:bg-muted/30 text-right">
                      <td className="px-4 py-2 tabular-nums">{d.attendance_date}</td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {d.first_check_in
                          ? new Date(d.first_check_in).toLocaleTimeString("ar", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-2 tabular-nums text-muted-foreground">
                        {d.last_check_out
                          ? new Date(d.last_check_out).toLocaleTimeString("ar", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-2 tabular-nums">{Number(d.total_hours || 0).toFixed(1)}</td>
                      <td className="px-4 py-2 tabular-nums">{Number(d.overtime_hours || 0).toFixed(1)}</td>
                      <td className="px-4 py-2">
                        <Badge variant="outline" className={STATUS_TONE[d.status] || ""}>
                          {d.status}
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

function MiniCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: any;
  tone?: "neutral" | "positive" | "warning" | "danger" | "primary";
}) {
  const cls = {
    neutral: "text-foreground",
    positive: "text-emerald-700 dark:text-emerald-400",
    warning: "text-amber-700 dark:text-amber-400",
    danger: "text-rose-700 dark:text-rose-400",
    primary: "text-primary",
  }[tone];
  return (
    <Card className="p-3 text-right">
      <p className="text-[11px] text-muted-foreground mb-1">{label}</p>
      <p className={`text-xl font-bold tabular-nums ${cls}`}>{value}</p>
    </Card>
  );
}
