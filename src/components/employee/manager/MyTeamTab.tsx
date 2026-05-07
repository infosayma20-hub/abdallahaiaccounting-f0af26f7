import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users } from "lucide-react";
import ManagerHeader from "./ManagerHeader";

type Emp = {
  id: string;
  full_name: string;
  position: string | null;
  phone: string | null;
};

type TodayInfo = {
  status: string | null;
  first_check_in: string | null;
  last_check_out: string | null;
  shift_label: string | null;
};

function initials(name: string) {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "؟";
}

export default function MyTeamTab({ branchId, branchName, onBack }: { branchId: string | null; branchName: string; onBack: () => void }) {
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [today, setToday] = useState<Record<string, TodayInfo>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!branchId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data: emps } = await supabase
        .from("employees")
        .select("id, full_name, position, phone")
        .eq("branch_id", branchId)
        .eq("is_active", true)
        .order("full_name");
      const list = (emps || []) as Emp[];
      setEmployees(list);
      if (list.length) {
        const ids = list.map(e => e.id);
        const todayDate = new Date().toISOString().slice(0, 10);
        const [days, roster] = await Promise.all([
          supabase.from("attendance_days").select("employee_id, status, first_check_in, last_check_out").in("employee_id", ids).eq("attendance_date", todayDate),
          supabase.from("daily_roster").select("employee_id, status, shift_template_id, shift_templates:shift_template_id(name_ar)").in("employee_id", ids).eq("roster_date", todayDate),
        ]);
        const map: Record<string, TodayInfo> = {};
        list.forEach(e => { map[e.id] = { status: null, first_check_in: null, last_check_out: null, shift_label: null }; });
        (days.data || []).forEach((d: any) => {
          map[d.employee_id] = { ...map[d.employee_id], status: d.status, first_check_in: d.first_check_in, last_check_out: d.last_check_out };
        });
        (roster.data || []).forEach((r: any) => {
          const lbl = r.shift_templates?.name_ar || (r.status === "off" ? "OFF" : r.status === "leave" ? "إجازة" : r.status === "coverage" ? "تغطية" : null);
          map[r.employee_id] = { ...map[r.employee_id], shift_label: lbl };
        });
        setToday(map);
      }
      setLoading(false);
    })();
  }, [branchId]);

  const statusBadge = (s: string | null) => {
    if (!s) return { label: "—", cls: "bg-secondary text-muted-foreground" };
    if (s === "present") return { label: "حاضر", cls: "bg-emerald-500/10 text-emerald-500" };
    if (s === "late") return { label: "متأخر", cls: "bg-warning/10 text-warning" };
    if (s === "absent") return { label: "غائب", cls: "bg-destructive/10 text-destructive" };
    if (s === "incomplete") return { label: "ناقص", cls: "bg-orange-500/10 text-orange-500" };
    if (s === "leave") return { label: "إجازة", cls: "bg-blue-500/10 text-blue-500" };
    return { label: s, cls: "bg-secondary text-muted-foreground" };
  };

  return (
    <div dir="rtl" className="pb-24">
      <ManagerHeader title="فريقي" subtitle={branchName} onBack={onBack} />
      <div className="px-3 pt-3 space-y-2">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">جار التحميل…</div>
        ) : !employees.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            لا يوجد موظفين في فرعك
          </div>
        ) : employees.map(emp => {
          const t = today[emp.id] || { status: null, first_check_in: null, last_check_out: null, shift_label: null };
          const sb = statusBadge(t.status);
          return (
            <div key={emp.id} className="bg-card border border-border rounded-2xl p-3 flex items-center gap-3">
              <div className="h-11 w-11 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">
                {initials(emp.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{emp.full_name}</div>
                {emp.position && <div className="text-[11px] text-muted-foreground truncate">{emp.position}</div>}
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-md ${sb.cls}`}>{sb.label}</span>
                  {t.shift_label && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-primary/10 text-primary">{t.shift_label}</span>}
                </div>
              </div>
              <div className="text-left text-[10px] text-muted-foreground tabular-nums" dir="ltr">
                {t.first_check_in ? new Date(t.first_check_in).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) : "—"}
                {" / "}
                {t.last_check_out ? new Date(t.last_check_out).toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" }) : "—"}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}