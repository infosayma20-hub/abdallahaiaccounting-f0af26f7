import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Users, Loader2, Search } from "lucide-react";

interface Emp {
  id: string;
  full_name: string;
  position?: string | null;
  branch_id?: string | null;
  manager_employee_id?: string | null;
}

interface Branch { id: string; name: string }

interface Props {
  managerEmployeeId: string;
  companyId: string;
  branches: Branch[];
  /** Only branches the manager covers (from branch_manager_assignments). Empty = show all. */
  scopedBranchIds?: string[];
}

/**
 * Pick which employees report directly to this manager. Writes
 * employees.manager_employee_id so multiple managers can split a
 * branch's team across different shifts.
 */
export default function ManagerTeamPicker({ managerEmployeeId, companyId, branches, scopedBranchIds }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    let q = supabase
      .from("employees")
      .select("id, full_name, position, branch_id, manager_employee_id")
      .eq("user_id", companyId)
      .eq("is_active", true)
      .neq("id", managerEmployeeId)
      .order("full_name");
    if (scopedBranchIds && scopedBranchIds.length) q = q.in("branch_id", scopedBranchIds);
    const { data, error } = await q;
    if (error) {
      console.error("[ManagerTeamPicker] load failed:", error);
      toast.error("تعذّر تحميل قائمة الموظفين");
    } else {
      setEmployees((data || []) as Emp[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [managerEmployeeId, companyId, (scopedBranchIds || []).join(",")]);

  const branchName = useMemo(() => {
    const m = new Map(branches.map((b) => [b.id, b.name]));
    return (id?: string | null) => (id ? m.get(id) || "—" : "—");
  }, [branches]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (branchFilter !== "all" && e.branch_id !== branchFilter) return false;
      if (!term) return true;
      return e.full_name.toLowerCase().includes(term) || (e.position || "").toLowerCase().includes(term);
    });
  }, [employees, search, branchFilter]);

  const toggle = async (emp: Emp, on: boolean) => {
    // Guard: if already managed by someone else, ask before stealing.
    if (on && emp.manager_employee_id && emp.manager_employee_id !== managerEmployeeId) {
      const ok = window.confirm(`${emp.full_name} مرتبط حالياً بمدير آخر. هل تريد نقله لفريقك؟`);
      if (!ok) return;
    }
    setSaving(emp.id);
    try {
      const { error } = await supabase
        .from("employees")
        .update({ manager_employee_id: on ? managerEmployeeId : null } as any)
        .eq("id", emp.id);
      if (error) throw error;
      setEmployees((prev) => prev.map((x) => x.id === emp.id ? { ...x, manager_employee_id: on ? managerEmployeeId : null } : x));
    } catch (e: any) {
      console.error("[ManagerTeamPicker] toggle failed:", e);
      toast.error(e?.message || "تعذّر حفظ التغيير");
    } finally {
      setSaving(null);
    }
  };

  const myTeamCount = employees.filter((e) => e.manager_employee_id === managerEmployeeId).length;
  const scopedBranches = scopedBranchIds && scopedBranchIds.length
    ? branches.filter((b) => scopedBranchIds.includes(b.id))
    : branches;

  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h5 className="text-xs font-bold">موظفو فريقي</h5>
          {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <span className="text-[11px] text-muted-foreground">المختارون: {myTeamCount}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        اختر الموظفين الذين سيكون مديراً لهم (لجدول الدوام، الحضور، والعقوبات). يمكن لأكثر من مدير اقتسام موظفي نفس الفرع بحسب الشفت.
      </p>

      <div className="flex flex-wrap gap-2 mb-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو المسمى…"
            className="w-full text-xs rounded-md border border-border bg-background px-2 py-1.5 pr-7"
          />
        </div>
        {scopedBranches.length > 1 && (
          <select
            value={branchFilter}
            onChange={(e) => setBranchFilter(e.target.value)}
            className="text-xs rounded-md border border-border bg-background px-2 py-1.5"
          >
            <option value="all">كل الفروع</option>
            {scopedBranches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}
      </div>

      <div className="max-h-72 overflow-y-auto space-y-1 pr-1">
        {filtered.length === 0 ? (
          <p className="text-[11px] text-muted-foreground py-4 text-center">
            {loading ? "جاري التحميل…" : "لا يوجد موظفون."}
          </p>
        ) : filtered.map((emp) => {
          const mine = emp.manager_employee_id === managerEmployeeId;
          const takenByOther = !!emp.manager_employee_id && !mine;
          const busy = saving === emp.id;
          return (
            <label
              key={emp.id}
              className={`flex items-center justify-between gap-2 text-sm rounded-md border px-2.5 py-2 cursor-pointer transition ${
                mine ? "border-primary/60 bg-primary/5" : takenByOther ? "border-amber-200 bg-amber-50/40 dark:bg-amber-900/10" : "border-border bg-background hover:bg-muted/40"
              } ${busy ? "opacity-60 pointer-events-none" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{emp.full_name}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {emp.position || "—"} • {branchName(emp.branch_id)}
                  {takenByOther && <span className="text-amber-700 dark:text-amber-400"> • تابع لمدير آخر</span>}
                </div>
              </div>
              <input
                type="checkbox"
                className="h-4 w-4 shrink-0"
                checked={mine}
                disabled={busy || loading}
                onChange={(e) => toggle(emp, e.target.checked)}
              />
            </label>
          );
        })}
      </div>
    </div>
  );
}