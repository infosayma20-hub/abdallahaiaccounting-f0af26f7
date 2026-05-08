import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RefreshCw } from "lucide-react";
import ManagerHeader from "./ManagerHeader";
import { useManagedBranchEmployees } from "@/hooks/useBranchRoster";

type Row = {
  employee_id: string;
  full_name: string;
  position: string | null;
  status: string | null;
  first_check_in: string | null;
  last_check_out: string | null;
  total_hours: number | null;
};

export default function TeamAttendanceTab({ branchId, branchName, onBack }: { branchId: string | null; branchName: string; onBack: () => void }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const { data: employees = [], isLoading: employeesLoading } = useManagedBranchEmployees(branchId);

  const load = useCallback(async () => {
    if (!branchId || employeesLoading) return;
    setLoading(true);
    const list = employees;
    const ids = list.map(e => e.id);
    let days: any[] = [];
    if (ids.length) {
      const { data } = await supabase
        .from("attendance_days")
        .select("employee_id, status, first_check_in, last_check_out, total_hours")
        .in("employee_id", ids)
        .eq("attendance_date", date);
      days = data || [];
    }
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
      };
    }));
    setLoading(false);
  }, [branchId, date, employees, employeesLoading]);

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
    incomplete: rows.filter(r => r.status === "incomplete").length,
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
            { l: "ناقص", v: counts.incomplete, c: "text-orange-500" },
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
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}