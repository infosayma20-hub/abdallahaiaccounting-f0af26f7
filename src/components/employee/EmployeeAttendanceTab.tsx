import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, ChevronRight, ChevronLeft, ChevronDown, LogIn, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildMonthRows, summarizeMonth, bucketEventsByBusinessDay, type AttDay, type Leave, type AttEvent } from "@/lib/employeeAttendanceDisplay";
import { calculateLeaveBalance, calculateSickBalance } from "@/lib/hr-utils";
import { fetchConfirmedReversals, netUsedDays, emptyBucket } from "@/lib/hr/leaveReversals";
import {
  deriveGapsFromSessions,
  summarizeDepartures,
  isDepartureExemptStatus,
  formatDepartureMinutes,
} from "@/lib/attendance-departures";
import { useDepartureCap } from "@/hooks/useDepartureCap";

interface Props {
  employeeId: string;
  leaveProfile: {
    startDate?: string | null;
    previousYearBalance?: number | null;
    sickLeaveDays?: number | null;
  };
}

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

export default function EmployeeAttendanceTab({ employeeId, leaveProfile }: Props) {
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [attendance, setAttendance] = useState<AttDay[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [events, setEvents] = useState<AttEvent[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState<{
    annual: ReturnType<typeof calculateLeaveBalance>;
    sick: ReturnType<typeof calculateSickBalance>;
  } | null>(null);
  const [balanceError, setBalanceError] = useState(false);

  const from = isoDate(startOfMonth(month));
  const to   = isoDate(endOfMonth(month));

  // ━━ رصيد الإجازات للسنة الحالية (افتتاحي / مستخدم / متاح / نهاية السنة) ━━
  useEffect(() => {
    let cancel = false;
    (async () => {
      if (!employeeId) return;
      setBalances(null);
      setBalanceError(false);
      const year = new Date().getFullYear();
      const [leavesRes, reversalMap] = await Promise.all([
        supabase
          .from("employee_leaves")
          .select("leave_type, days_count, start_date, status")
          .eq("employee_id", employeeId)
          .eq("status", "approved")
          .gte("start_date", `${year}-01-01`)
          .lte("start_date", `${year}-12-31`)
          .limit(500),
        fetchConfirmedReversals({ employeeIds: [employeeId], year }),
      ]);
      if (cancel) return;
      if (leavesRes.error) {
        setBalanceError(true);
        return;
      }
      const rows: any[] = (leavesRes.data as any[]) || [];
      const reversed = reversalMap.get(employeeId) || emptyBucket();
      const sumBy = (t: string) =>
        rows.filter((r) => String(r.leave_type || "").trim() === t)
            .reduce((s, r) => s + Number(r.days_count || 0), 0);
      setBalances({
        annual: calculateLeaveBalance(
          leaveProfile.startDate || `${year}-01-01`,
          Number(leaveProfile.previousYearBalance ?? 0),
          netUsedDays(sumBy("سنوية"), reversed.annual),
        ),
        sick: calculateSickBalance(
          leaveProfile.startDate || `${year}-01-01`,
          netUsedDays(sumBy("مرضية"), reversed.sick),
          Number(leaveProfile.sickLeaveDays ?? 14),
        ),
      });
    })();
    return () => { cancel = true; };
  }, [employeeId, leaveProfile.previousYearBalance, leaveProfile.sickLeaveDays, leaveProfile.startDate]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      setLoading(true);
      // Range in Asia/Hebron — fetch events for full local-day window
      const fromTs = new Date(`${from}T00:00:00+03:00`).toISOString();
      const toTs = new Date(`${to}T23:59:59+03:00`).toISOString();
      const [attRes, leaveRes, leaveTblRes, evRes] = await Promise.all([
        supabase
          .from("attendance_days")
          .select("attendance_date, first_check_in, last_check_out, total_hours, status, notes, is_manually_adjusted")
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
        // HR-entered leaves live in `employee_leaves` (separate from
        // employee-submitted `employee_forms`). Merge both so annual/regular
        // leaves added by HR appear in the employee's calendar too.
        supabase
          .from("employee_leaves")
          .select("start_date, end_date, leave_type, status")
          .eq("employee_id", employeeId)
          .eq("status", "approved")
          .lte("start_date", to)
          .gte("end_date", from)
          .limit(200),
        supabase
          .from("attendance_events")
          .select("event_type, event_time")
          .eq("employee_id", employeeId)
          .in("status", ["valid", "manual"])
          .gte("event_time", fromTs)
          .lte("event_time", toTs)
          .order("event_time", { ascending: true }),
      ]);
      if (cancel) return;
      setAttendance((attRes.data as AttDay[]) || []);
      const AR_TO_SLUG: Record<string, string> = {
        "سنوية": "annual",
        "عادية": "regular",
        "مرضية": "sick",
        "بدون راتب": "unpaid",
        "شخصية": "personal",
        "أمومة": "regular",
        "أبوة": "regular",
        "طارئة": "regular",
        "أخرى": "regular",
      };
      const normalizeType = (t: any) => {
        const s = String(t || "").trim();
        return AR_TO_SLUG[s] || s.toLowerCase();
      };
      const fromForms: Leave[] = ((leaveRes.data as any[]) || []).map((r) => ({
        from_date: r.form_data?.from_date || r.form_data?.start_date,
        to_date:   r.form_data?.to_date   || r.form_data?.end_date,
        leave_type: normalizeType(r.form_data?.leave_type),
      })).filter((l) => l.from_date && l.to_date);
      const fromTable: Leave[] = ((leaveTblRes.data as any[]) || []).map((r) => ({
        from_date: r.start_date,
        to_date: r.end_date,
        leave_type: normalizeType(r.leave_type),
      })).filter((l) => l.from_date && l.to_date);
      // `employee_leaves` is the authoritative HR record. Drop any form-based
      // leave that overlaps an HR record of the same type so HR edits (changed
      // dates / deletions) are reflected instead of duplicated.
      const overlaps = (a: Leave, b: Leave) =>
        a.leave_type === b.leave_type && a.from_date <= b.to_date && b.from_date <= a.to_date;
      const seen = new Set<string>();
      const merged: Leave[] = [];
      for (const l of [...fromTable, ...fromForms.filter((f) => !fromTable.some((t) => overlaps(f, t)))]) {
        const key = `${l.from_date}|${l.to_date}|${l.leave_type}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(l);
      }
      setLeaves(merged);
      // Bucket events by **business day** so a check-out after midnight
      // closes the previous day's open session instead of becoming a lone
      // "ناقص" event on the next day.
      const evs: AttEvent[] = bucketEventsByBusinessDay(
        (evRes.data as any[]) || [],
        "Asia/Hebron",
      );
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
        <Kpi label="إجازة عادية" value={sum.regularLeave} tone="info" />
        <Kpi label="عطل" value={sum.holidays} tone="muted" />
        <Kpi label="غياب" value={sum.absent} tone="bad" />
        <Kpi label="تأخير" value={sum.late} tone="warn" />
        <Kpi label="بصمة ناقصة" value={sum.incomplete} tone="warn" />
      </div>

      {/* رصيد الإجازات للسنة */}
      {balances && (
        <Card className="border-border bg-card">
          <CardContent className="p-3 space-y-3">
            <div className="text-xs font-bold">رصيد الإجازات لسنة {new Date().getFullYear()}</div>

            <div className="space-y-1">
              <div className="text-[11px] font-medium text-primary">سنوية</div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 text-center">
                <BalCell label="رصيد سابق" value={balances.annual.carriedOver} />
                <BalCell label="استحقاق السنة" value={balances.annual.entitlement} />
                <BalCell label="عدد الأيام" value={+(balances.annual.carriedOver + balances.annual.entitlement).toFixed(2)} />
                <BalCell label="أيام مستحقة" value={+(balances.annual.carriedOver + balances.annual.accruedToDate).toFixed(2)} />
                <BalCell label="أيام مستوفاة" value={balances.annual.used} tone="bad" />
                <BalCell label="الرصيد الحالي (المتاح الآن)" value={balances.annual.available} tone="good" />
              </div>
              <div className="text-[10px] text-muted-foreground text-center pt-0.5">
                رصيد السنة (بنهاية السنة):{" "}
                <span className="font-bold text-foreground">
                  {(+(balances.annual.carriedOver + balances.annual.entitlement - balances.annual.used).toFixed(2))} يوم
                </span>
              </div>
            </div>

            <div className="space-y-1 border-t border-border pt-2">
              <div className="text-[11px] font-medium text-primary">مرضية (متاحة بالكامل من بداية السنة)</div>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <BalCell label="استحقاق السنة" value={balances.sick.entitlement} />
                <BalCell label="مستخدم" value={balances.sick.used} tone="bad" />
                <BalCell label="المتاح" value={balances.sick.available} tone="good" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {balanceError && (
        <Card className="border-destructive/40 bg-card">
          <CardContent className="p-3 text-center text-xs text-destructive">
            تعذّر تحميل رصيد الإجازات. لم يتم عرض أرقام بديلة غير صحيحة.
          </CardContent>
        </Card>
      )}

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
                      {(() => {
                        if (!depEnabled || isDepartureExemptStatus(r.status)) return null;
                        const gaps = deriveGapsFromSessions(r.sessions);
                        const dep = summarizeDepartures(
                          gaps.reduce((s, g) => s + g.minutes, 0),
                          gaps.length,
                          { cap: depCap },
                        );
                        if (dep.minutes === 0) return null;
                        return (
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              dep.exceeded
                                ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                                : "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                            }`}
                            title={`مجموع المغادرات ${dep.minutes} دقيقة من أصل ${depCap}`}
                          >
                            مغادرات {formatDepartureMinutes(dep.minutes)}/{depCap}د
                          </Badge>
                        );
                      })()}
                      {r.notes && <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">{r.notes}</span>}
                      {r.sessions.length > 0 && (
                        <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${expanded[r.date] ? "rotate-180" : ""}`} />
                      )}
                    </div>
                  </button>
                  {expanded[r.date] && r.sessions.length > 0 && (
                    <div className="px-3 pb-3 pt-1 bg-muted/20 space-y-1">
                      <div className="text-[10px] text-muted-foreground font-medium">جلسات اليوم ({r.sessions.length})</div>
                      {(() => {
                        if (!depEnabled || isDepartureExemptStatus(r.status)) return null;
                        const gaps = deriveGapsFromSessions(r.sessions);
                        const dep = summarizeDepartures(
                          gaps.reduce((s, g) => s + g.minutes, 0),
                          gaps.length,
                          { cap: depCap },
                        );
                        return (
                          <div
                            className={`rounded-md border px-2 py-1.5 text-[11px] flex items-center justify-between ${
                              dep.exceeded
                                ? "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400"
                                : "border-border bg-card text-foreground"
                            }`}
                          >
                            <span>مجموع المغادرات بين الجلسات ({dep.count})</span>
                            <span className="font-bold tabular-nums">
                              {formatDepartureMinutes(dep.minutes)} / {depCap}د
                              {dep.exceeded
                                ? ` · تجاوز +${formatDepartureMinutes(dep.over)}`
                                : ` · متبقي ${formatDepartureMinutes(dep.remaining)}`}
                            </span>
                          </div>
                        );
                      })()}
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

function BalCell({ label, value, tone }: { label: string; value: number; tone?: "good" | "bad" }) {
  const cls =
    tone === "good" ? (value < 0 ? "text-rose-600 dark:text-rose-400" : "text-emerald-700 dark:text-emerald-400") :
    tone === "bad"  ? "text-rose-700 dark:text-rose-400" : "text-foreground";
  return (
    <div className="rounded-lg bg-muted/30 p-1.5">
      <div className="text-[9px] text-muted-foreground leading-tight">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}
