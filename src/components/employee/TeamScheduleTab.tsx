import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function fmtISO(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const o = new Date(d); o.setDate(o.getDate() + n); return o; }
function startOfWeek(d: Date) {
  const day = d.getDay();
  const diff = day === 6 ? 0 : day + 1;
  const o = new Date(d); o.setDate(o.getDate() - diff); o.setHours(0, 0, 0, 0); return o;
}
const DAY_NAMES = ["السبت", "الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"];

type Row = {
  employee_id: string;
  employee_name: string;
  department: string | null;
  branch_id: string | null;
  branch_name: string | null;
  roster_date: string | null;
  status: string | null;
  shift_template_id: string | null;
  shift_name: string | null;
  shift_color: string | null;
  start_time: string | null;
  end_time: string | null;
};

export default function TeamScheduleTab({ onBack }: { onBack: () => void }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekStart = useMemo(() => addDays(startOfWeek(new Date()), weekOffset * 7), [weekOffset]);
  const startStr = fmtISO(weekStart);
  const endStr = fmtISO(addDays(weekStart, 6));

  const { data, isLoading, isError } = useQuery({
    queryKey: ["team-schedule", startStr, endStr],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase.rpc("get_employee_team_schedule", {
        _start_date: startStr,
        _end_date: endStr,
      });
      if (error) throw error;
      return (data || []) as Row[];
    },
  });

  // Group by employee
  const employees = useMemo(() => {
    const map = new Map<string, { name: string; department: string | null; branch_name: string | null; days: Map<string, Row> }>();
    (data || []).forEach((r) => {
      if (!map.has(r.employee_id)) {
        map.set(r.employee_id, { name: r.employee_name, department: r.department, branch_name: r.branch_name, days: new Map() });
      }
      if (r.roster_date) map.get(r.employee_id)!.days.set(r.roster_date, r);
    });
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [data]);

  const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

  return (
    <div className="px-3 py-4 space-y-4 pb-24" dir="rtl">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-xs">رجوع</Button>
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">دوام الفريق</h2>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => setWeekOffset((o) => o - 1)}>
          <ChevronRight className="h-4 w-4" /> السابق
        </Button>
        <div className="text-xs text-muted-foreground font-medium">{startStr} → {endStr}</div>
        <Button variant="outline" size="sm" onClick={() => setWeekOffset((o) => o + 1)}>
          التالي <ChevronLeft className="h-4 w-4" />
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 rounded-lg bg-muted animate-pulse" />)}
        </div>
      )}

      {isError && (
        <Card><CardContent className="py-8 text-center text-sm text-destructive">تعذّر تحميل دوام الفريق. حاول لاحقاً.</CardContent></Card>
      )}

      {!isLoading && !isError && employees.length === 0 && (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">
          لا يوجد دوام زملاء متاح للعرض حالياً
        </CardContent></Card>
      )}

      {/* Mobile: per-day cards */}
      {!isLoading && !isError && employees.length > 0 && (
        <div className="md:hidden space-y-3">
          {weekDays.map((d, i) => {
            const iso = fmtISO(d);
            const isToday = iso === fmtISO(new Date());
            const working = employees
              .map((e) => ({ e, r: e.days.get(iso) }))
              .filter((x) => x.r && x.r.status !== "off" && x.r.status !== "leave");
            return (
              <Card key={iso} className={isToday ? "border-primary/40" : ""}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-bold">{DAY_NAMES[i]}</div>
                    <div className="text-[11px] text-muted-foreground">{iso}</div>
                  </div>
                  {working.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-2 text-center">لا يوجد</div>
                  ) : (
                    <div className="divide-y">
                      {working.map(({ e, r }) => (
                        <div key={e.id} className="flex items-center justify-between py-2">
                          <div>
                            <div className="text-sm font-medium">{e.name}</div>
                            {(e.branch_name || e.department) && (
                              <div className="text-[10px] text-muted-foreground">{[e.branch_name, e.department].filter(Boolean).join(" — ")}</div>
                            )}
                          </div>
                          <div className="text-end">
                            {r!.status === "leave" ? (
                              <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-800">إجازة</span>
                            ) : r!.shift_name ? (
                              <>
                                <div className="text-sm font-bold" style={{ color: r!.shift_color || undefined }}>{r!.shift_name}</div>
                                {r!.start_time && r!.end_time && (
                                  <div className="text-[10px] text-muted-foreground">{r!.start_time.slice(0,5)} – {r!.end_time.slice(0,5)}</div>
                                )}
                              </>
                            ) : (
                              <span className="text-xs">دوام</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Desktop: grid */}
      {!isLoading && !isError && employees.length > 0 && (
        <div className="hidden md:block">
          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="p-2 text-start sticky right-0 bg-muted/40 min-w-[160px]">الموظف</th>
                    {weekDays.map((d, i) => (
                      <th key={i} className="p-2 text-center font-medium min-w-[110px]">
                        <div>{DAY_NAMES[i]}</div>
                        <div className="text-[10px] text-muted-foreground font-normal">{fmtISO(d)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {employees.map((e) => (
                    <tr key={e.id}>
                      <td className="p-2 sticky right-0 bg-background">
                        <div className="font-medium">{e.name}</div>
                        {(e.branch_name || e.department) && (
                          <div className="text-[10px] text-muted-foreground">{[e.branch_name, e.department].filter(Boolean).join(" — ")}</div>
                        )}
                      </td>
                      {weekDays.map((d, i) => {
                        const r = e.days.get(fmtISO(d));
                        return (
                          <td key={i} className="p-2 text-center align-middle">
                            {!r ? <span className="text-muted-foreground">—</span>
                              : r.status === "off" ? <span className="text-[11px] px-2 py-0.5 rounded bg-muted">راحة</span>
                              : r.status === "leave" ? <span className="text-[11px] px-2 py-0.5 rounded bg-amber-100 text-amber-800">إجازة</span>
                              : (
                                <div>
                                  <div className="text-xs font-bold" style={{ color: r.shift_color || undefined }}>{r.shift_name || "دوام"}</div>
                                  {r.start_time && r.end_time && (
                                    <div className="text-[10px] text-muted-foreground">{r.start_time.slice(0,5)}–{r.end_time.slice(0,5)}</div>
                                  )}
                                </div>
                              )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}