import { useEffect, useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Loader2, UserPlus, X, Search, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Employee {
  id: string;
  full_name: string;
  job_title?: string | null;
}

/**
 * Compact per-section assignment chip used inside DynamicFormRenderer's section
 * header. Opens a popover with employee search and single-click assignment.
 * Designed to replace the bulky top-of-form FormSectionAssignmentsPanel by
 * surfacing the action right next to each plan item.
 */
export default function InlineSectionAssign({
  templateId,
  sectionKey,
  sectionTitle,
  companyUserId,
}: {
  templateId: string;
  sectionKey: string;
  sectionTitle: string;
  companyUserId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [current, setCurrent] = useState<{ id: string; assignee_employee_id: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [loadedOnce, setLoadedOnce] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data: ures } = await supabase.auth.getUser();
      const uid = ures.user?.id || null;
      let q = supabase
        .from("employees")
        .select("id, full_name, job_title")
        .eq("is_active", true)
        .order("full_name");
      if (companyUserId) q = q.eq("user_id", companyUserId);

      let asnQ = supabase
        .from("form_section_assignments" as any)
        .select("id, assignee_employee_id")
        .is("form_id", null)
        .eq("template_id", templateId)
        .eq("section_key", sectionKey);
      if (uid) asnQ = asnQ.eq("assigned_by", uid);

      const [empRes, asnRes] = await Promise.all([q, asnQ.maybeSingle()]);
      setEmployees(((empRes.data as unknown) as Employee[]) || []);
      setCurrent((asnRes.data as any) || null);
      setLoadedOnce(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Lightweight bootstrap: only load the current assignment (to show the chip
    // label) without fetching the employee list until the popover opens.
    (async () => {
      try {
        const { data: ures } = await supabase.auth.getUser();
        const uid = ures.user?.id || null;
        let q = supabase
          .from("form_section_assignments" as any)
          .select("id, assignee_employee_id")
          .is("form_id", null)
          .eq("template_id", templateId)
          .eq("section_key", sectionKey);
        if (uid) q = q.eq("assigned_by", uid);
        const { data } = await q.maybeSingle();
        setCurrent((data as any) || null);
      } catch {}
    })();
  }, [templateId, sectionKey]);

  useEffect(() => {
    if (open && !loadedOnce) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const empById = useMemo(
    () => Object.fromEntries(employees.map((e) => [e.id, e])),
    [employees],
  );
  const currentEmp = current ? empById[current.assignee_employee_id] : null;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees.slice(0, 12);
    return employees
      .filter((e) =>
        e.full_name?.toLowerCase().includes(q) ||
        (e.job_title || "").toLowerCase().includes(q))
      .slice(0, 12);
  }, [employees, search]);

  const assign = async (emp: Employee) => {
    setBusy(true);
    try {
      if (current) {
        const { error } = await supabase
          .from("form_section_assignments" as any)
          .update({ assignee_employee_id: emp.id, status: "pending" })
          .eq("id", current.id);
        if (error) throw error;
        setCurrent({ ...current, assignee_employee_id: emp.id });
      } else {
        const { data, error } = await supabase
          .from("form_section_assignments" as any)
          .insert({
            template_id: templateId,
            section_key: sectionKey,
            section_title: sectionTitle,
            assignee_employee_id: emp.id,
            user_id: companyUserId,
          })
          .select("id, assignee_employee_id")
          .single();
        if (error) throw error;
        setCurrent(data as any);
      }
      toast({ title: "تم الإسناد", description: `${sectionTitle} → ${emp.full_name}` });
      setSearch("");
      setOpen(false);
    } catch (e: any) {
      toast({ title: "فشل الإسناد", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const unassign = async () => {
    if (!current) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from("form_section_assignments" as any)
        .delete()
        .eq("id", current.id);
      if (error) throw error;
      setCurrent(null);
      toast({ title: "تم إلغاء الإسناد" });
    } catch (e: any) {
      toast({ title: "فشل", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={current ? "secondary" : "ghost"}
          className="h-7 gap-1 text-[10px] px-2"
          onClick={(e) => e.stopPropagation()}
        >
          <UserPlus className="h-3 w-3" />
          {currentEmp ? (
            <span className="max-w-[80px] truncate">{currentEmp.full_name}</span>
          ) : current ? (
            <span>مُسنَد</span>
          ) : (
            <span>إسناد</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        dir="rtl"
        align="start"
        className="w-72 p-2"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-[11px] font-semibold flex items-center justify-between gap-2">
              <span className="truncate">{sectionTitle}</span>
              {current && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-2 text-destructive text-[10px]"
                  disabled={busy}
                  onClick={unassign}
                >
                  <X className="h-3 w-3 ml-1" /> إلغاء
                </Button>
              )}
            </div>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن موظف…"
                className="w-full h-8 text-xs rounded-md border bg-background pr-7 pl-2"
              />
            </div>
            <div className="max-h-56 overflow-y-auto space-y-1">
              {filtered.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-2">
                  لا نتائج
                </p>
              )}
              {filtered.map((e) => {
                const isCurrent = current?.assignee_employee_id === e.id;
                return (
                  <button
                    key={e.id}
                    type="button"
                    disabled={busy}
                    onClick={() => assign(e)}
                    className={`w-full text-right text-[11px] px-2 py-1.5 rounded-md border transition ${isCurrent ? "border-primary bg-primary/10 text-primary" : "bg-muted/30 hover:bg-muted"}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0 truncate">
                        <span className="font-semibold">{e.full_name}</span>
                        {e.job_title && (
                          <span className="text-muted-foreground"> · {e.job_title}</span>
                        )}
                      </div>
                      {isCurrent && <Check className="h-3 w-3 text-primary shrink-0" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}