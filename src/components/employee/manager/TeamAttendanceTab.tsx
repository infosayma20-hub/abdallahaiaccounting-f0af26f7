import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";
import ManagerHeader from "./ManagerHeader";
import { useManagedBranchEmployees } from "@/hooks/useBranchRoster";
import {
  computeDayDepartures,
  formatDepartureMinutes,
  type DepartureSummary,
  type RawPunch,
} from "@/lib/attendance-departures";
import { useDepartureCap } from "@/hooks/useDepartureCap";

type Row = {
  employee_id: string;
  full_name: string;
  position: string | null;
  status: string | null;
  first_check_in: string | null;
  last_check_out: string | null;
  total_hours: number | null;
  departures: DepartureSummary;
};

export default function TeamAttendanceTab({ branchId, branchName, onBack }: { branchId: string | null; branchName: string; onBack: () => void }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const { data: employees = [], isLoading: employeesLoading } = useManagedBranchEmployees(branchId);
  const { enabled: depEnabled, cap: depCap, maxGap: depMaxGap } = useDepartureCap();

  const load = useCallback(async () => {
    if (!branchId || employeesLoading) return;
    setLoading(true);
    const list = employees;
    const ids = list.map(e => e.id);
    let days: any[] = [];
    if (ids.length) {
      const { data } = await supabase
        .from("attendance_days")
        .select("id, employee_id, status, first_check_in, last_check_out, total_hours")
        .in("employee_id", ids)
        .eq("attendance_date", date);
      days = data || [];
    }
    // المغادرات = الفجوات بين الجلسات (خروج → الدخول التالي) + الاستراحات المسجّلة.
    const dayIds = days.map((d: any) => d.id).filter(Boolean);
    let punches: (RawPunch & { employee_id: string })[] = [];
    let breaks: any[] = [];
    let dismissals: any[] = [];
    if (ids.length && dayIds.length) {
      const fromTs = new Date(`${date}T00:00:00+03:00`).toISOString();
      const toTs = new Date(`${date}T23:59:59+03:00`).toISOString();
      const [evRes, brRes, disRes] = await Promise.all([
        supabase
          .from("attendance_events")
          .select("employee_id, event_type, event_time, status")
          .in("employee_id", ids)
          .gte("event_time", fromTs)
          .lte("event_time", toTs),
        supabase
          .from("attendance_breaks")
          .select("attendance_day_id, break_out, break_in, duration_minutes")
          .in("attendance_day_id", dayIds),
        supabase
          .from("attendance_derived_gap_dismissals")
          .select("attendance_day_id, gap_out, gap_in")
          .in("attendance_day_id", dayIds),
      ]);
      punches = (evRes.data as any) || [];
      breaks = brRes.data || [];
      dismissals = disRes.data || [];
    }
    const punchesByEmp = new Map<string, RawPunch[]>();
    (punches as any[]).forEach((e) => {
      const arr = punchesByEmp.get(e.employee_id) || [];
      arr.push(e);
      punchesByEmp.set(e.employee_id, arr);
    });
    const dmap = new Map(days.map(d => [d.employee_id, d]));
    setRows(list.map(e => {
      const d = dmap.get(e.id);
      return {
        employee_id: e.id,
        full_name: e.full_name,
        position: e.position,
        status: d?.status || null,
        first_check_in: d?.first_check_in || null,
        last_check_out: d?.last_check_out || null,
        total_hours: d?.total_hours || null,
        departures: computeDayDepartures({
          dayId: d?.id || null,
          status: d?.status || null,
          windowStart: d?.first_check_in || null,
          windowEnd: d?.last_check_out || null,
          punches: punchesByEmp.get(e.id) || [],
          storedBreaks: breaks.filter((b) => b.attendance_day_id === d?.id),
          dismissals,
          cap: depCap,
          maxGap: depMaxGap,
        }),
      };
    }));
    setLoading(false);
  }, [branchId, date, employees, employeesLoading, depCap]);

  useEffect(() => { load(); }, [load]);

  // light realtime
  useEffect(() => {
    if (!branchId) return;
    const ch = supabase
      .channel(`team-att-${branchId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "attendance_days" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [branchId, load]);

  const counts = {
    present: rows.filter(r => r.status === "present").length,
    late: rows.filter(r => r.status === "late").length,
    absent: rows.filter(r => r.status === "absent" || (!r.status && date <= new Date().toISOString().slice(0,10))).length,
    exceeded: rows.filter(r => r.departures.exceeded).length,
  };

  const fmt = (t: string | null) => t ? new Date(t).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div dir="rtl" className="pb-24">
      <ManagerHeader title="حضور الفريق" subtitle={branchName} onBack={onBack} />
      <div className="px-3 pt-3 space-y-3">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="flex-1 h-10 rounded-xl border border-border bg-card px-3 text-sm"
          />
          <button onClick={load} className="h-10 w-10 rounded-xl bg-secondary flex items-center justify-center active:scale-95">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2">
          {[
            { l: "حاضر", v: counts.present, c: "text-emerald-500" },
            { l: "متأخر", v: counts.late, c: "text-warning" },
            { l: "غائب", v: counts.absent, c: "text-destructive" },
            ...(depEnabled
              ? [{ l: `تجاوز ${depCap}د`, v: counts.exceeded, c: counts.exceeded ? "text-destructive" : "text-muted-foreground" }]
              : []),
          ].map(s => (
            <div key={s.l} className="bg-card border border-border rounded-xl p-2 text-center">
              <div className={`text-lg font-bold tabular-nums ${s.c}`}>{s.v}</div>
              <div className="text-[10px] text-muted-foreground">{s.l}</div>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {loading || employeesLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">جار التحميل…</div>
          ) : !rows.length ? (
            <div className="p-8 text-center text-muted-foreground text-sm">لا يوجد موظفين</div>
          ) : rows.map(r => {
            const out = !r.status;
            const cls = r.status === "present" ? "bg-emerald-500/10 text-emerald-500"
              : r.status === "late" ? "bg-warning/10 text-warning"
              : r.status === "absent" ? "bg-destructive/10 text-destructive"
              : r.status === "incomplete" ? "bg-orange-500/10 text-orange-500"
              : "bg-secondary text-muted-foreground";
            const label = r.status ? ({ present: "حاضر", late: "متأخر", absent: "غائب", incomplete: "ناقص", leave: "إجازة" } as any)[r.status] || r.status : "خارج الدوام";
            const dep = r.departures;
            return (
              <div key={r.employee_id} className="bg-card border border-border rounded-2xl p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="font-semibold text-sm truncate">{r.full_name}</div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-md ${cls}`}>{label}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground tabular-nums" dir="ltr">
                  <span>دخول: {fmt(r.first_check_in)}</span>
                  <span>خروج: {fmt(r.last_check_out)}</span>
                  <span>{r.total_hours ? `${r.total_hours.toFixed(1)} h` : "—"}</span>
                </div>
                {depEnabled && dep.applicable && (
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] border-t border-border pt-1.5">
                    <span className="text-muted-foreground">
                      المغادرات {dep.count ? `(${dep.count})` : ""}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md font-semibold tabular-nums ${
                        dep.exceeded
                          ? "bg-destructive/10 text-destructive"
                          : dep.minutes > 0
                            ? "bg-warning/10 text-warning"
                            : "bg-secondary text-muted-foreground"
                      }`}
                    >
                      {formatDepartureMinutes(dep.minutes)} / {depCap}د
                      {dep.minutes > depCap
                        ? ` · تجاوز +${formatDepartureMinutes(dep.minutes - depCap)}`
                        : ` · متبقي ${formatDepartureMinutes(depCap - dep.minutes)}`}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}