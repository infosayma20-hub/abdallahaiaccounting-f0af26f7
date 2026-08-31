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

interface Link { manager_employee_id: string; employee_id: string }

interface Branch { id: string; name: string }

interface Props {
  managerEmployeeId: string;
  companyId: string;
  branches: Branch[];
  /** Only branches the manager covers (from branch_manager_assignments). Empty = show all. */
  scopedBranchIds?: string[];
}

/**
 * Pick which employees report directly to this manager.
 *
 * Writes to `employee_manager_links` (many-to-many) instead of the legacy
 * single `employees.manager_employee_id` column. This is the root fix for
 * "employees disappear from a manager's team": previously assigning an
 * employee to a second manager overwrote the first manager's link, so the
 * employee silently vanished from the first team. Now an employee can
 * belong to several managers at once (shared employees across shifts).
 */
export default function ManagerTeamPicker({ managerEmployeeId, companyId, branches, scopedBranchIds }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
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

    const [empRes, linkRes] = await Promise.all([
      q,
      supabase
        .from("employee_manager_links" as any)
        .select("manager_employee_id, employee_id")
        .eq("user_id", companyId),
    ]);

    if (empRes.error) {
      console.error("[ManagerTeamPicker] load failed:", empRes.error);
      toast.error("تعذّر تحميل قائمة الموظفين");
    } else {
      setEmployees((empRes.data || []) as Emp[]);
    }
    if (linkRes.error) {
      console.error("[ManagerTeamPicker] links load failed:", linkRes.error);
    } else {
      setLinks((linkRes.data || []) as unknown as Link[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [managerEmployeeId, companyId, (scopedBranchIds || []).join(",")]);

  const branchName = useMemo(() => {
    const m = new Map(branches.map((b) => [b.id, b.name]));
    return (id?: string | null) => (id ? m.get(id) || "—" : "—");
  }, [branches]);

  const nameById = useMemo(() => new Map(employees.map((e) => [e.id, e.full_name])), [employees]);

  /** manager -> direct reports, from the link table (source of truth). */
  const childrenOf = useMemo(() => {
    const m = new Map<string, string[]>();
    links.forEach((l) => {
      const arr = m.get(l.manager_employee_id) || [];
      arr.push(l.employee_id);
      m.set(l.manager_employee_id, arr);
    });
    return m;
  }, [links]);

  const directIds = useMemo(
    () => new Set(childrenOf.get(managerEmployeeId) || []),
    [childrenOf, managerEmployeeId]
  );

  /** Everyone under this manager through sub-managers (indirect reports). */
  const indirectTree = useMemo(() => {
    const out = new Set<string>();
    const queue = [...directIds];
    let guard = 0;
    while (queue.length && guard++ < 5000) {
      const cur = queue.shift()!;
      (childrenOf.get(cur) || []).forEach((cid) => {
        if (cid === managerEmployeeId || directIds.has(cid) || out.has(cid)) return;
        out.add(cid);
        queue.push(cid);
      });
    }
    return out;
  }, [childrenOf, directIds, managerEmployeeId]);

  /** Manager's own chain upward — assigning any of them as a report would create a loop. */
  const ancestors = useMemo(() => {
    const parentsOf = new Map<string, string[]>();
    links.forEach((l) => {
      const arr = parentsOf.get(l.employee_id) || [];
      arr.push(l.manager_employee_id);
      parentsOf.set(l.employee_id, arr);
    });
    const out = new Set<string>();
    const queue = [...(parentsOf.get(managerEmployeeId) || [])];
    let guard = 0;
    while (queue.length && guard++ < 5000) {
      const cur = queue.shift()!;
      if (out.has(cur)) continue;
      out.add(cur);
      (parentsOf.get(cur) || []).forEach((p) => queue.push(p));
    }
    return out;
  }, [links, managerEmployeeId]);

  /** Other managers this employee also reports to (shared employee). */
  const otherManagersOf = useMemo(() => {
    const m = new Map<string, string[]>();
    links.forEach((l) => {
      if (l.manager_employee_id === managerEmployeeId) return;
      const arr = m.get(l.employee_id) || [];
      arr.push(l.manager_employee_id);
      m.set(l.employee_id, arr);
    });
    return m;
  }, [links, managerEmployeeId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return employees.filter((e) => {
      if (branchFilter !== "all" && e.branch_id !== branchFilter) return false;
      if (!term) return true;
      return e.full_name.toLowerCase().includes(term) || (e.position || "").toLowerCase().includes(term);
    });
  }, [employees, search, branchFilter]);

  const toggle = async (emp: Emp, on: boolean) => {
    if (on && ancestors.has(emp.id)) {
      toast.error("لا يمكن ربط مديرك الأعلى كموظف تابع لك (تسلسل دائري)");
      return;
    }
    setSaving(emp.id);
    try {
      if (on) {
        const { error } = await supabase
          .from("employee_manager_links" as any)
          .insert({
            user_id: companyId,
            manager_employee_id: managerEmployeeId,
            employee_id: emp.id,
          } as any);
        if (error && (error as any).code !== "23505") throw error;
        setLinks((prev) =>
          prev.some((l) => l.manager_employee_id === managerEmployeeId && l.employee_id === emp.id)
            ? prev
            : [...prev, { manager_employee_id: managerEmployeeId, employee_id: emp.id }]
        );
      } else {
        const { error } = await supabase
          .from("employee_manager_links" as any)
          .delete()
          .eq("manager_employee_id", managerEmployeeId)
          .eq("employee_id", emp.id);
        if (error) throw error;
        // Legacy column mirrors the primary manager — clear it when it points at me,
        // otherwise the DB would keep the reporting edge alive.
        if (emp.manager_employee_id === managerEmployeeId) {
          const { error: colErr } = await supabase
            .from("employees")
            .update({ manager_employee_id: null } as any)
            .eq("id", emp.id);
          if (colErr) throw colErr;
          setEmployees((prev) => prev.map((x) => (x.id === emp.id ? { ...x, manager_employee_id: null } : x)));
        }
        setLinks((prev) =>
          prev.filter((l) => !(l.manager_employee_id === managerEmployeeId && l.employee_id === emp.id))
        );
      }
    } catch (e: any) {
      console.error("[ManagerTeamPicker] toggle failed:", e);
      toast.error(e?.message || "تعذّر حفظ التغيير");
    } finally {
      setSaving(null);
    }
  };

  const myTeamCount = directIds.size;

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
        <span className="text-[11px] text-muted-foreground">
          مباشر: {myTeamCount}
          {indirectTree.size > 0 && <> • عبر مدراء تابعين: {indirectTree.size} • الإجمالي: {myTeamCount + indirectTree.size}</>}
        </span>

      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        اختر الموظفين الذين سيكون مديراً لهم (لجدول الدوام، الحضور، والعقوبات). يمكن للموظف أن يكون ضمن فريق أكثر من مدير في نفس الوقت — اختياره هنا لا يسحبه من فريق مدير آخر.
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
          const mine = directIds.has(emp.id);
          const indirect = indirectTree.has(emp.id);
          const shared = (otherManagersOf.get(emp.id) || []).length > 0;
          const busy = saving === emp.id;
          return (
            <label
              key={emp.id}
              className={`flex items-center justify-between gap-2 text-sm rounded-md border px-2.5 py-2 cursor-pointer transition ${
                mine
                  ? "border-primary/60 bg-primary/5"
                  : indirect
                    ? "border-primary/25 bg-primary/[0.03]"
                    : "border-border bg-background hover:bg-muted/40"
              } ${busy ? "opacity-60 pointer-events-none" : ""}`}
            >
              <div className="min-w-0 flex-1">
                <div className="font-medium truncate">{emp.full_name}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {emp.position || "—"} • {branchName(emp.branch_id)}
                  {indirect && !mine && (
                    <span className="text-primary"> • ضمن فريقك عبر مدير تابع</span>
                  )}
                  {shared && (
                    <span className="text-muted-foreground">
                      {" "}• مشترك مع: {(otherManagersOf.get(emp.id) || [])
                        .map((id) => nameById.get(id) || "مدير آخر")
                        .join("، ")}
                    </span>
                  )}
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
