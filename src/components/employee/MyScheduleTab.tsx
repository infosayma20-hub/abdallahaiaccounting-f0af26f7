import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar } from "lucide-react";
import { useMyRoster, useShiftTemplates } from "@/hooks/useBranchRoster";

function fmtISO(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const o = new Date(d); o.setDate(o.getDate() + n); return o; }
function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = day === 6 ? 0 : day + 1;
  const o = new Date(d); o.setDate(o.getDate() - diff); o.setHours(0, 0, 0, 0); return o;
}
const DAY_NAMES = ["السبت","الأحد","الإثنين","الثلاثاء","الأربعاء","الخميس","الجمعة"];

export default function MyScheduleTab({ employeeId, companyId }: { employeeId: string | undefined; companyId?: string | undefined }) {
  const weekStart = useMemo(() => startOfWeek(new Date()), []);
  const startStr = fmtISO(weekStart);
  const endStr = fmtISO(addDays(weekStart, 13)); // 2 weeks

  const { data: roster = [], isLoading } = useMyRoster(employeeId, startStr, endStr);
  const { data: templates = [] } = useShiftTemplates(companyId);

  const byDate = useMemo(() => {
    const m = new Map<string, any>();
    roster.forEach((r) => m.set(r.roster_date, r));
    return m;
  }, [roster]);

  return (
    <div className="px-4 py-4 space-y-4 pb-24" dir="rtl">
      <div className="flex items-center gap-2">
        <Calendar className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">دوامي للأسبوعين القادمين</h2>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground text-center py-8">جار التحميل…</p>
      ) : roster.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground text-sm">
            لم يتم إدخال جدول دوامك بعد. مدير الفرع سيقوم بذلك قريباً.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{startStr} → {endStr}</CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y">
            {Array.from({ length: 14 }).map((_, i) => {
              const d = addDays(weekStart, i);
              const iso = fmtISO(d);
              const entry = byDate.get(iso);
              const tpl = entry?.shift_template_id ? templates.find((t) => t.id === entry.shift_template_id) : null;
              const dayLabel = DAY_NAMES[i % 7];
              const isToday = iso === fmtISO(new Date());
              return (
                <div key={iso} className={`flex items-center justify-between px-4 py-3 ${isToday ? "bg-primary/5" : ""}`}>
                  <div>
                    <div className="text-sm font-medium">{dayLabel}</div>
                    <div className="text-xs text-muted-foreground">{iso}</div>
                  </div>
                  <div className="text-end">
                    {!entry ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : entry.status === "off" ? (
                      <span className="text-xs px-2 py-1 rounded-md bg-muted">راحة</span>
                    ) : entry.status === "leave" ? (
                      <span className="text-xs px-2 py-1 rounded-md bg-amber-100 text-amber-800">إجازة</span>
                    ) : tpl ? (
                      <div>
                        <span className="text-sm font-bold" style={{ color: tpl.color }}>{tpl.name_ar}</span>
                        <div className="text-[11px] text-muted-foreground">{tpl.start_time.slice(0,5)} – {tpl.end_time.slice(0,5)}</div>
                      </div>
                    ) : (
                      <span className="text-xs">دوام</span>
                    )}
                    {entry?.notes && <div className="text-[10px] text-muted-foreground mt-0.5">{entry.notes}</div>}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}