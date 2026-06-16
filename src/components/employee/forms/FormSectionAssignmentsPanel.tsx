import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, UserPlus, Check, X, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface Employee {
  id: string;
  full_name: string;
  job_title?: string | null;
  department?: string | null;
}

interface Section {
  key: string;
  title: string;
}

interface Assignment {
  id: string;
  section_key: string;
  assignee_employee_id: string;
  status: string;
  notes: string | null;
}

const EXCLUDED_KEYS = new Set([
  "period",
  "closing_report",
  "approval",
]);

function extractAssignableSections(schema: any): Section[] {
  const sections = schema?.sections;
  if (!Array.isArray(sections)) return [];
  return sections
    .filter((s: any) => s && s.key && !EXCLUDED_KEYS.has(s.key))
    .map((s: any) => ({ key: String(s.key), title: String(s.title || s.key) }));
}

export default function FormSectionAssignmentsPanel({
  formId,
  templateId,
  schema,
  companyUserId,
}: {
  formId: string;
  templateId: string | null;
  schema: any;
  /** Account-owner user_id (employee_forms.user_id), used to scope employees. */
  companyUserId?: string | null;
}) {
  const sections = useMemo(() => extractAssignableSections(schema), [schema]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [search, setSearch] = useState<Record<string, string>>({});
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        let q = supabase
          .from("employees")
          .select("id, full_name, job_title, department")
          .eq("is_active", true)
          .order("full_name");
        if (companyUserId) q = q.eq("user_id", companyUserId);
        const [empRes, asnRes] = await Promise.all([
          q,
          supabase
            .from("form_section_assignments" as any)
            .select("id, section_key, assignee_employee_id, status, notes")
            .eq("form_id", formId),
        ]);
        setEmployees((empRes.data as Employee[]) || []);
        setAssignments((asnRes.data as Assignment[]) || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [formId, companyUserId]);

  const empById = useMemo(() => {
    const m: Record<string, Employee> = {};
    employees.forEach((e) => { m[e.id] = e; });
    return m;
  }, [employees]);

  const assignedBySection = useMemo(() => {
    const m: Record<string, Assignment> = {};
    assignments.forEach((a) => { m[a.section_key] = a; });
    return m;
  }, [assignments]);

  const filteredFor = (sectionKey: string): Employee[] => {
    const q = (search[sectionKey] || "").trim().toLowerCase();
    if (!q) return employees.slice(0, 8);
    return employees
      .filter((e) => e.full_name?.toLowerCase().includes(q)
        || e.job_title?.toLowerCase().includes(q)
        || e.department?.toLowerCase().includes(q))
      .slice(0, 8);
  };

  const assign = async (section: Section, employee: Employee) => {
    setBusyKey(section.key);
    try {
      const existing = assignedBySection[section.key];
      if (existing) {
        const { error } = await supabase
          .from("form_section_assignments" as any)
          .update({ assignee_employee_id: employee.id, status: "pending" })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("form_section_assignments" as any)
          .insert({
            form_id: formId,
            template_id: templateId,
            section_key: section.key,
            section_title: section.title,
            assignee_employee_id: employee.id,
            user_id: companyUserId, // trigger will fill if null
          } as any);
        if (error) throw error;
      }
      // reload
      const { data } = await supabase
        .from("form_section_assignments" as any)
        .select("id, section_key, assignee_employee_id, status, notes")
        .eq("form_id", formId);
      setAssignments((data as Assignment[]) || []);
      setSearch((p) => ({ ...p, [section.key]: "" }));
      toast({ title: "تم الإسناد", description: `${section.title} → ${employee.full_name}` });
    } catch (e: any) {
      toast({ title: "فشل الإسناد", description: e.message, variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  };

  const unassign = async (section: Section) => {
    const existing = assignedBySection[section.key];
    if (!existing) return;
    setBusyKey(section.key);
    try {
      const { error } = await supabase
        .from("form_section_assignments" as any)
        .delete()
        .eq("id", existing.id);
      if (error) throw error;
      setAssignments((prev) => prev.filter((a) => a.id !== existing.id));
      toast({ title: "تم إلغاء الإسناد" });
    } catch (e: any) {
      toast({ title: "فشل", description: e.message, variant: "destructive" });
    } finally {
      setBusyKey(null);
    }
  };

  if (!sections.length) return null;

  return (
    <div className="rounded-lg border bg-background p-3" dir="rtl">
      <div className="flex items-center gap-2 mb-3">
        <UserPlus className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-bold">إسناد بنود الخطة للموظفين</h3>
        <Badge variant="outline" className="text-[10px]">{sections.length} بند</Badge>
      </div>
      {loading ? (
        <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-2">
          {sections.map((s) => {
            const current = assignedBySection[s.key];
            const currentEmp = current ? empById[current.assignee_employee_id] : null;
            const opts = filteredFor(s.key);
            const isBusy = busyKey === s.key;
            return (
              <div key={s.key} className="rounded-md border bg-card p-2.5 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold flex-1 truncate">{s.title}</span>
                  {current && (
                    <Badge variant="secondary" className="text-[10px] gap-1 shrink-0">
                      <Check className="h-3 w-3" />
                      {currentEmp?.full_name || "موظف"}
                    </Badge>
                  )}
                  {current && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive shrink-0"
                      onClick={() => unassign(s)}
                      disabled={isBusy}
                      title="إلغاء الإسناد"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="relative">
                  <Search className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    value={search[s.key] || ""}
                    onChange={(e) => setSearch((p) => ({ ...p, [s.key]: e.target.value }))}
                    placeholder={current ? "تغيير الموظف…" : "ابحث عن موظف بالاسم/المسمى…"}
                    disabled={isBusy}
                    className="w-full h-8 text-xs rounded-md border bg-background pr-7 pl-2"
                  />
                </div>
                {(search[s.key] || !current) && opts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {opts.map((e) => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => assign(s, e)}
                        disabled={isBusy}
                        className="text-[11px] px-2 py-1 rounded-full border bg-muted/40 hover:bg-primary hover:text-primary-foreground transition disabled:opacity-50"
                      >
                        {e.full_name}
                        {e.job_title ? <span className="text-muted-foreground/80"> · {e.job_title}</span> : null}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}