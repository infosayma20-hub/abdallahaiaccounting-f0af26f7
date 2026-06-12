import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Building2, Loader2, AlertTriangle } from "lucide-react";

interface Branch { id: string; name: string }

interface Props {
  authUserId: string | null | undefined;
  companyId: string | null | undefined;
  branches: Branch[];
}

/**
 * Lets an admin/HR manager pick which branches a manager-employee is
 * responsible for. Writes directly to `branch_manager_assignments`
 * keyed by the employee's auth user id (NOT employee.id), matching the
 * read logic in useManagerBranches.
 */
export default function ManagerBranchesPicker({ authUserId, companyId, branches }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [assigned, setAssigned] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!authUserId || !companyId) { setLoading(false); return; }
      setLoading(true);
      const { data, error } = await supabase
        .from("branch_manager_assignments")
        .select("branch_id")
        .eq("user_id", authUserId)
        .eq("company_id", companyId);
      if (cancelled) return;
      if (error) {
        console.error("[ManagerBranchesPicker] load failed:", error);
        toast.error("تعذّر تحميل فروع المدير");
      } else {
        setAssigned(new Set((data || []).map((r: any) => r.branch_id)));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [authUserId, companyId]);

  if (!authUserId) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-3 text-xs text-amber-800 dark:text-amber-300">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <span>
          هذا الموظف ليس لديه حساب بعد. أنشئ له حساب أولاً من بطاقة الموظف ثم ارجع لتعيين الفروع التي يديرها.
        </span>
      </div>
    );
  }

  if (!companyId) return null;

  const toggle = async (branchId: string, on: boolean) => {
    setSaving(branchId);
    const next = new Set(assigned);
    try {
      if (on) {
        const { error } = await supabase
          .from("branch_manager_assignments")
          .insert({ user_id: authUserId, branch_id: branchId, company_id: companyId } as any);
        if (error && (error as any).code !== "23505") throw error;
        next.add(branchId);
      } else {
        const { error } = await supabase
          .from("branch_manager_assignments")
          .delete()
          .eq("user_id", authUserId)
          .eq("branch_id", branchId)
          .eq("company_id", companyId);
        if (error) throw error;
        next.delete(branchId);
      }
      setAssigned(next);
    } catch (e: any) {
      console.error("[ManagerBranchesPicker] toggle failed:", e);
      toast.error(e?.message || "تعذّر حفظ التغيير");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Building2 className="h-4 w-4 text-primary" />
        <h5 className="text-xs font-bold">الفروع المسؤول عنها</h5>
        {loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
      </div>
      <p className="text-[11px] text-muted-foreground mb-3">
        اختر الفروع التي يديرها هذا المدير. سيظهر له موظفو هذه الفروع لإدارة دواماتهم وحضورهم.
      </p>
      {branches.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">لا توجد فروع مفعّلة.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {branches.map((b) => {
            const checked = assigned.has(b.id);
            const busy = saving === b.id;
            return (
              <label
                key={b.id}
                className={`flex items-center justify-between gap-2 text-sm rounded-md border px-2.5 py-2 cursor-pointer transition ${
                  checked ? "border-primary/50 bg-primary/5" : "border-border bg-background hover:bg-muted/40"
                } ${busy ? "opacity-60 pointer-events-none" : ""}`}
              >
                <span className="truncate">{b.name}</span>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={checked}
                  disabled={busy || loading}
                  onChange={(e) => toggle(b.id, e.target.checked)}
                />
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}