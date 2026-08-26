import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, ChevronDown } from "lucide-react";
import ManagerHeader from "./ManagerHeader";
import { useManagedBranchEmployees } from "@/hooks/useBranchRoster";
import { useDepartureCap } from "@/hooks/useDepartureCap";
import {
  computeDayDepartures,
  formatDepartureMinutes,
  emptyDepartureSummary,
  type DepartureSummary,
  type RawPunch,
} from "@/lib/attendance-departures";

type Emp = {
  id: string;
  full_name: string;
  position: string | null;
  phone: string | null;
};

type Session = { in: string | null; out: string | null };

type TodayInfo = {
  status: string | null;
  first_check_in: string | null;
  last_check_out: string | null;
  shift_label: string | null;
  sessions: Session[];
  departures: DepartureSummary;
};

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "؟";
}

const emptyInfo = (): TodayInfo => ({
  status: null,
  first_check_in: null,
  last_check_out: null,
  shift_label: null,
  sessions: [],
  departures: emptyDepartureSummary(false),
});

/** Pair raw punches into in/out sessions in chronological order. */
function buildSessions(punches: RawPunch[]): Session[] {
  const sorted = [...punches]
    .filter((p) => (p as any).status !== "rejected" && (p as any).status !== "cancelled")
    .sort((a, b) => new Date(a.event_time).getTime() - new Date(b.event_time).getTime());
  const out: Session[] = [];
  sorted.forEach((p) => {
    const type = String((p as any).event_type || "");
    if (type.includes("in")) {
      out.push({ in: p.event_time, out: null });
    } else if (type.includes("out")) {
      const open = [...out].reverse().find((s) => s.out === null);
      if (open) open.out = p.event_time;
      else out.push({ in: null, out: p.event_time });
    }
  });
  return out;
}

export default function MyTeamTab({ branchId, branchName, onBack }: { branchId: string | null; branchName: string; onBack: () => void }) {
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [today, setToday] = useState<Record<string, TodayInfo>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: managedEmployees = [], isLoading: employeesLoading } = useManagedBranchEmployees(branchId);
  const { enabled: depEnabled, cap: depCap, maxGap: depMaxGap } = useDepartureCap();

  useEffect(() => {
    if (employeesLoading) { setLoading(true); return; }
    (async () => {
      setLoading(true);
      const list = managedEmployees as Emp[];
      setEmployees(list);
      if (list.length) {
        const ids = list.map(e => e.id);
        const todayDate = new Date().toISOString().slice(0, 10);
        const fromTs = new Date(`${todayDate}T00:00:00+03:00`).toISOString();
        const toTs = new Date(`${todayDate}T23:59:59+03:00`).toISOString();
        const [days, roster, events] = await Promise.all([
          supabase.from("attendance_days").select("id, employee_id, status, first_check_in, last_check_out").in("employee_id", ids).eq("attendance_date", todayDate),
          supabase.from("daily_roster").select("employee_id, status, shift_template_id, shift_templates:shift_template_id(name_ar)").in("employee_id", ids).eq("roster_date", todayDate),
          supabase.from("attendance_events").select("employee_id, event_type, event_time, status, checkout_kind").in("employee_id", ids).gte("event_time", fromTs).lte("event_time", toTs),
        ]);

        const dayRows = (days.data || []) as any[];
        const dayIds = dayRows.map(d => d.id).filter(Boolean);
        let breaks: any[] = [];
        let dismissals: any[] = [];
        if (dayIds.length) {
          const [brRes, disRes] = await Promise.all([
            supabase.from("attendance_breaks").select("attendance_day_id, break_out, break_in, duration_minutes, break_type, counts_toward_cap").in("attendance_day_id", dayIds),
            supabase.from("attendance_derived_gap_dismissals").select("attendance_day_id, gap_out, gap_in").in("attendance_day_id", dayIds),
          ]);
          breaks = brRes.data || [];
          dismissals = disRes.data || [];
        }

        const punchesByEmp = new Map<string, RawPunch[]>();
        ((events.data || []) as any[]).forEach((e) => {
          const arr = punchesByEmp.get(e.employee_id) || [];
          arr.push(e);
          punchesByEmp.set(e.employee_id, arr);
        });

        const map: Record<string, TodayInfo> = {};
        list.forEach(e => { map[e.id] = emptyInfo(); });
        dayRows.forEach((d: any) => {
          map[d.employee_id] = { ...(map[d.employee_id] || emptyInfo()), status: d.status, first_check_in: d.first_check_in, last_check_out: d.last_check_out };
        });
        (roster.data || []).forEach((r: any) => {
          const lbl = r.shift_templates?.name_ar || (r.status === "off" ? "OFF" : r.status === "leave" ? "إجازة" : r.status === "coverage" ? "تغطية" : null);
          map[r.employee_id] = { ...(map[r.employee_id] || emptyInfo()), shift_label: lbl };
        });
        list.forEach((e) => {
          const d = dayRows.find((x: any) => x.employee_id === e.id);
          const punches = punchesByEmp.get(e.id) || [];
          map[e.id] = {
            ...(map[e.id] || emptyInfo()),
            sessions: buildSessions(punches),
            departures: computeDayDepartures({
              dayId: d?.id || null,
              status: d?.status || null,
              windowStart: d?.first_check_in || null,
              windowEnd: d?.last_check_out || null,
              punches,
              storedBreaks: breaks.filter((b) => b.attendance_day_id === d?.id),
              dismissals,
              attendanceDate: todayDate,
              cap: depCap,
              maxGap: depMaxGap,
            }),
          };
        });
        setToday(map);
      } else {
        setToday({});
      }
      setLoading(false);
    })();
  }, [managedEmployees, employeesLoading, depCap, depMaxGap]);

  const statusBadge = (s: string | null) => {
    if (!s) return { label: "—", cls: "bg-secondary text-muted-foreground" };
    if (s === "present") return { label: "حاضر", cls: "bg-emerald-500/10 text-emerald-500" };
    if (s === "late") return { label: "متأخر", cls: "bg-warning/10 text-warning" };
    if (s === "absent") return { label: "غائب", cls: "bg-destructive/10 text-destructive" };
    if (s === "incomplete") return { label: "ناقص", cls: "bg-orange-500/10 text-orange-500" };
    if (s === "leave") return { label: "إجازة", cls: "bg-blue-500/10 text-blue-500" };
    return { label: s, cls: "bg-secondary text-muted-foreground" };
  };

  const fmt = (t: string | null) => t ? new Date(t).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div dir="rtl" className="pb-24">
      <ManagerHeader title="فريقي" subtitle={branchName} onBack={onBack} />
      <div className="px-3 pt-3 space-y-2">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">جار التحميل…</div>
        ) : !employees.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            لا يوجد موظفين في فريقك
          </div>
        ) : employees.map(emp => {
          const t = today[emp.id] || emptyInfo();
          const sb = statusBadge(t.status);
          const dep = t.departures;
          const open = expanded === emp.id;
          return (
            <div key={emp.id} className="bg-card border border-border rounded-2xl p-3">
              <button
                type="button"
                onClick={() => setExpanded(open ? null : emp.id)}
                className="w-full flex items-center gap-3 text-start"
              >
                <div className="h-11 w-11 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">
                  {initials(emp.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{emp.full_name}</div>
                  {emp.position && <div className="text-[11px] text-muted-foreground truncate">{emp.position}</div>}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${sb.cls}`}>{sb.label}</span>
                    {t.shift_label && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">{t.shift_label}</span>}
                    {t.sessions.length > 0 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground">جلسات: {t.sessions.length}</span>
                    )}
                    {depEnabled && dep.applicable && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold tabular-nums ${
                        dep.exceeded ? "bg-destructive/10 text-destructive"
                          : dep.minutes > 0 ? "bg-warning/10 text-warning"
                          : "bg-secondary text-muted-foreground"
                      }`}>
                        مغادرة {formatDepartureMinutes(dep.minutes)} / {depCap}د
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <div className="text-left text-[10px] text-muted-foreground tabular-nums" dir="ltr">
                    {fmt(t.first_check_in)}{" / "}{fmt(t.last_check_out)}
                  </div>
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                </div>
              </button>

              {open && (
                <div className="mt-2 border-t border-border pt-2 space-y-1.5">
                  {t.sessions.length === 0 ? (
                    <div className="text-[11px] text-muted-foreground text-center py-2">لا يوجد بصمات اليوم</div>
                  ) : (
                    t.sessions.map((s, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] tabular-nums">
                        <span className="text-muted-foreground">جلسة {i + 1}</span>
                        <span dir="ltr" className="font-medium">{fmt(s.in)} → {s.out ? fmt(s.out) : "مفتوحة"}</span>
                      </div>
                    ))
                  )}
                  {depEnabled && dep.applicable && (
                    <div className="border-t border-border pt-1.5 space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground">إجمالي المغادرة {dep.count ? `(${dep.count})` : ""}</span>
                        <span className={`font-semibold tabular-nums ${dep.exceeded ? "text-destructive" : "text-foreground"}`}>
                          {formatDepartureMinutes(dep.minutes)} / {depCap}د
                          {dep.minutes > depCap
                            ? ` · تجاوز +${formatDepartureMinutes(dep.minutes - depCap)}`
                            : ` · متبقي ${formatDepartureMinutes(depCap - dep.minutes)}`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
