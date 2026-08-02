import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Loader2, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";

type EmpRow = { id: string; full_name: string; job_title: string | null; is_active: boolean | null };

/**
 * Lets HR pick ANY employee and open (creating on demand) a chat thread,
 * instead of waiting for the employee to message HR first.
 */
export default function StartHRChatDialog({
  open,
  onOpenChange,
  onThreadReady,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onThreadReady: (threadId: string) => void;
}) {
  const [employees, setEmployees] = useState<EmpRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [creatingId, setCreatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    supabase
      .from("employees")
      .select("id, full_name, job_title, is_active")
      .eq("is_active", true)
      .eq("is_terminated", false)
      .order("full_name", { ascending: true })
      .limit(1000)
      .then(({ data, error }) => {
        if (cancelled) return;
        setLoading(false);
        if (error) {
          toast.error("تعذّر تحميل قائمة الموظفين");
          return;
        }
        setEmployees((data as EmpRow[]) || []);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().replace(/\s+/g, "");
    if (!q) return employees;
    return employees.filter((e) => (e.full_name || "").replace(/\s+/g, "").includes(q));
  }, [employees, search]);

  const start = async (emp: EmpRow) => {
    setCreatingId(emp.id);
    const { data, error } = await supabase.rpc("hr_chat_get_or_create_thread", { p_employee_id: emp.id });
    setCreatingId(null);
    if (error || !data) {
      toast.error("تعذّر فتح المحادثة مع هذا الموظف");
      return;
    }
    onOpenChange(false);
    setSearch("");
    onThreadReady(data as string);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" /> بدء محادثة مع موظف
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ابحث باسم الموظف..."
            className="pr-8 h-9 text-sm"
          />
        </div>

        <div className="max-h-[50vh] overflow-y-auto -mx-2 px-2">
          {loading && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">لا يوجد موظف مطابق.</div>
          )}
          {filtered.map((emp) => (
            <button
              key={emp.id}
              onClick={() => start(emp)}
              disabled={creatingId === emp.id}
              className="w-full text-right px-2 py-2 rounded-lg hover:bg-muted transition-colors flex items-center justify-between gap-2 disabled:opacity-60"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-foreground truncate">{emp.full_name}</span>
                {emp.job_title && (
                  <span className="block text-[11px] text-muted-foreground truncate">{emp.job_title}</span>
                )}
              </span>
              {creatingId === emp.id && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}