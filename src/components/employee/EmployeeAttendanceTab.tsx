import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronRight, ChevronLeft, ChevronDown, LogIn, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildMonthRows, summarizeMonth, type AttDay, type Leave, type AttEvent } from "@/lib/employeeAttendanceDisplay";

interface Props { employeeId: string; }

function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function endOfMonth(d: Date)   { return new Date(d.getFullYear(), d.getMonth() + 1, 0); }
function fmtMonthLabel(d: Date) {
  return d.toLocaleDateString("ar-EG-u-ca-gregory", { month: "long", year: "numeric" });
}
/** Local-time YYYY-MM-DD (avoids UTC shift that would leak the previous day). */
function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function EmployeeAttendanceTab({ employeeId }: Props) {
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [attendance, setAttendance] = useState<AttDay[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [events, setEvents] = useState<AttEvent[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const from = isoDate(startOfMonth(month));
  const to   = isoDate(endOfMonth(month));

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      // Range in Asia/Hebron — fetch events for full local-day window
      const fromTs = new Date(`${from}T00:00:00+03:00`).toISOString();
      const toTs = new Date(`${to}T23:59:59+03:00`).toISOString();
      const [attRes, leaveRes, evRes] = await Promise.all([
        supabase
          .from("attendance_days")
          .select("attendance_date, first_check_in, last_check_out, total_hours, status, notes")
          .eq("employee_id", employeeId)
          .gte("attendance_date", from)
          .lte("attendance_date", to)
          .order("attendance_date", { ascending: true }),
        supabase
          .from("employee_forms")
          .select("form_data, created_at")
          .eq("employee_id", employeeId)
          .eq("form_type", "leave_request")
          .eq("status", "approved")
          .limit(200),
        supabase
          .from("attendance_events")
          .select("event_type, event_time")
          .eq("employee_id", employeeId)
          .eq("status", "valid")
          .gte("event_time", fromTs)
          .lte("event_time", toTs)
          .order("event_time", { ascending: true }),
      ]);
      if (cancel) return;
      setAttendance((attRes.data as AttDay[]) || []);
      const ls: Leave[] = ((leaveRes.data as any[]) || []).map((r) => ({
        from_date: r.form_data?.from_date || r.form_data?.start_date,
        to_date:   r.form_data?.to_date   || r.form_data?.end_date,
        leave_type: r.form_data?.leave_type,
      })).filter((l) => l.from_date && l.to_date);
      setLeaves(ls);
      // Map events to Asia/Hebron local date
      const dtf = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Hebron", year: "numeric", month: "2-digit", day: "2-digit",
      });
      const evs: AttEvent[] = ((evRes.data as any[]) || []).map((e) => ({
        event_type: e.event_type,
        event_time: e.event_time,
        attendance_date: dtf.format(new Date(e.event_time)),
      }));
      setEvents(evs);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, [employeeId, from, to]);

  const rows = useMemo(
    () => buildMonthRows(startOfMonth(month), endOfMonth(month), attendance, leaves, events),
    [month, attendance, leaves, events]
  );
  const sum = useMemo(() => summarizeMonth(rows, leaves), [rows, leaves]);

  const fmtT = (iso: string) =>
    new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Hebron",
    });
  const fmtDur = (ms: number) => {
    const mins = Math.round(ms / 60000);
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h === 0 ? `${m}د` : `${h}س ${m}د`;
  };

  return (
    <div className="space-y-3 px-4 pt-3" dir="rtl" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}>
      <div className="flex items-center justify-between pt-2">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" /> دوامي
        </h2>
        <div className="flex items-center gap-1 bg-card rounded-xl border border-border px-2 py-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium min-w-[100px] text-center">{fmtMonthLabel(month)}</span>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* KPI grid */}
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="أيام الدوام" value={sum.workedDays} />
        <Kpi label="إجمالي الساعات" value={sum.totalHours.toFixed(1)} />
        <Kpi label="إجازة سنوية" value={sum.annualLeave} tone="info" />
        <Kpi label="إجازة عادية" value={sum.regularLeave} tone="info" />
        <Kpi label="إجازة قديمة" value={sum.sickLeave} tone="info" />
        <Kpi label="عطل" value={sum.holidays} tone="muted" />
        <Kpi label="غياب" value={sum.absent} tone="bad" />
        <Kpi label="تأخير" value={sum.late} tone="warn" />
        <Kpi label="بصمة ناقصة" value={sum.incomplete} tone="warn" />
      </div>

      {/* Days list (mobile cards) */}
      <Card className="border-border bg-card">
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 rounded-full border-2 border-muted animate-spin" style={{ borderTopColor: "hsl(var(--primary))" }} />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-xs text-muted-foreground p-6 text-center">لا توجد بيانات لهذا الشهر</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r) => (
                <li key={r.date} className="text-xs">
                  <button
                    type="button"
                    onClick={() => r.sessions.length > 0 && setExpanded((p) => ({ ...p, [r.date]: !p[r.date] }))}
                    className={`w-full px-3 py-2 grid grid-cols-12 gap-2 items-center text-right ${r.sessions.length > 0 ? "hover:bg-muted/40 cursor-pointer" : "cursor-default"}`}
                  >
                    <div className="col-span-3">
                      <div className="font-medium">{r.dayName}</div>
                      <div className="text-[10px] text-muted-foreground" dir="ltr">{r.date.slice(5)}</div>
                    </div>
                    <div className="col-span-4 text-[11px]" dir="ltr">
                      <div>{r.checkIn} → {r.checkOut}</div>
                      <div className="text-muted-foreground">
                        {r.hours !== "—" ? `${r.hours} س` : "—"}
                        {r.sessions.length > 1 && (
                          <span className="ml-1 text-primary">· {r.sessions.length} جلسات</span>
                        )}
                      </div>
                    </div>
                    <div className="col-span-5 flex items-center justify-end gap-1 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] ${r.statusTone}`}>{r.statusLabel}</Badge>
                      {r.notes && <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">{r.notes}</span>}
                      {r.sessions.length > 0 && (
                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded[r.date] ? "rotate-180" : ""}`} />
                      )}
                    </div>
                  </button>
                  {expanded[r.date] && r.sessions.length > 0 && (
                    <div className="px-3 pb-3 pt-1 bg-muted/20 space-y-1">
                      <div className="text-[10px] text-muted-foreground font-medium">جلسات اليوم ({r.sessions.length})</div>
                      {r.sessions.map((s, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-2 py-1.5">
                          <div className="flex items-center gap-2 text-[11px]">
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                              <LogIn className="h-3 w-3" /> {fmtT(s.checkIn)}
                            </span>
                            <span className="text-muted-foreground">←</span>
                            <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
                              <LogOut className="h-3 w-3" />
                              {s.checkOut ? fmtT(s.checkOut) : "مفتوحة"}
                            </span>
                          </div>
                          <span className="text-[11px] font-medium tabular-nums">
                            {s.checkOut ? fmtDur(s.durationMs) : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number | string; tone?: "info" | "warn" | "bad" | "muted" }) {
  const cls =
    tone === "info" ? "border-sky-500/20 bg-sky-500/5 text-sky-700 dark:text-sky-400" :
    tone === "warn" ? "border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-400" :
    tone === "bad"  ? "border-rose-500/20 bg-rose-500/5 text-rose-700 dark:text-rose-400" :
    tone === "muted"? "border-border bg-muted/30 text-foreground" :
                       "border-primary/20 bg-primary/5 text-primary";
  return (
    <Card className={`border ${cls}`}>
      <CardContent className="p-2 text-center">
        <div className="text-[10px] opacity-80">{label}</div>
        <div className="text-base font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
