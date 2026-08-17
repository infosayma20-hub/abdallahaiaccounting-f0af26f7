import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Send, Trash2, UserCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Emp { id: string; full_name: string; job_title?: string | null }

interface Referral {
  id: string;
  assignee_employee_id: string;
  note: string | null;
  status: string;
  response_notes: string | null;
  created_at: string;
  assigned_by_name: string | null;
}

const STATUS: Record<string, { text: string; cls: string }> = {
  pending: { text: "جديد", cls: "bg-amber-100 text-amber-700 border-amber-300" },
  in_progress: { text: "قيد التنفيذ", cls: "bg-sky-100 text-sky-700 border-sky-300" },
  done: { text: "منجز", cls: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  cancelled: { text: "ملغي", cls: "bg-muted text-muted-foreground" },
};

/**
 * HR / management action: forward a submitted form (typically a complaint)
 * to another employee (quality, admin, ...) so it appears on their own screen.
 */
export default function ForwardFormDialog({
  open,
  onOpenChange,
  form,
  dataOwnerId,
  submitterName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  form: any | null;
  dataOwnerId?: string | null;
  submitterName?: string;
}) {
  const [employees, setEmployees] = useState<Emp[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Emp | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!open || !form?.id) return;
    setSelected(null);
    setNote("");
    setSearch("");
    (async () => {
      setLoading(true);
      try {
        let empQ = supabase
          .from("employees")
          .select("id, full_name, job_title")
          .eq("is_active", true)
          .order("full_name");
        if (dataOwnerId) empQ = empQ.eq("user_id", dataOwnerId);
        const [empRes, refRes] = await Promise.all([
          empQ,
          supabase
            .from("employee_form_referrals" as any)
            .select("id, assignee_employee_id, note, status, response_notes, created_at, assigned_by_name")
            .eq("form_id", form.id)
            .order("created_at", { ascending: false }),
        ]);
        setEmployees(((empRes.data as unknown) as Emp[]) || []);
        setReferrals(((refRes.data as unknown) as Referral[]) || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, form?.id, dataOwnerId]);

  const empById = useMemo(() => Object.fromEntries(employees.map((e) => [e.id, e])), [employees]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? employees.filter((e) =>
          e.full_name?.toLowerCase().includes(q) || (e.job_title || "").toLowerCase().includes(q))
      : employees;
    return list.slice(0, 30);
  }, [employees, search]);

  const submit = async () => {
    if (!form?.id || !selected) return;
    setBusy(true);
    try {
      const { data: ures } = await supabase.auth.getUser();
      const actor = ures.user;
      const actorName =
        (actor?.user_metadata as any)?.full_name || actor?.email || "الموارد البشرية";
      const { data, error } = await supabase
        .from("employee_form_referrals" as any)
        .insert({
          form_id: form.id,
          assignee_employee_id: selected.id,
          note: note.trim() || null,
          assigned_by_name: actorName,
          form_title: form.title || null,
          form_type: form.form_type || null,
          submitter_name: submitterName || null,
          form_snapshot: form.form_data || {},
        })
        .select("id, assignee_employee_id, note, status, response_notes, created_at, assigned_by_name")
        .single();
      if (error) throw error;
      setReferrals((prev) => [data as any, ...prev]);
      setSelected(null);
      setNote("");
      toast({ title: "تم التحويل", description: `تم تحويل الطلب إلى ${selected.full_name}` });
    } catch (e: any) {
      toast({ title: "فشل التحويل", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (r: Referral) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("employee_form_referrals" as any).delete().eq("id", r.id);
      if (error) throw error;
      setReferrals((prev) => prev.filter((x) => x.id !== r.id));
      toast({ title: "تم إلغاء التحويل" });
    } catch (e: any) {
      toast({ title: "فشل الإلغاء", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-right">تحويل الطلب إلى موظف</DialogTitle>
          <DialogDescription className="text-right text-xs">
            يظهر الطلب المحوَّل على شاشة الموظف ضمن «محوَّل إليّ» ويقدر يحدّث حالته ويكتب ردّه.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-3">
            {referrals.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-muted-foreground">تحويلات سابقة</p>
                {referrals.map((r) => {
                  const st = STATUS[r.status] || STATUS.pending;
                  return (
                    <div key={r.id} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5">
                      <UserCheck className="h-3.5 w-3.5 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold truncate">
                            {empById[r.assignee_employee_id]?.full_name || "موظف"}
                          </span>
                          <Badge variant="outline" className={`text-[10px] ${st.cls}`}>{st.text}</Badge>
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {format(new Date(r.created_at), "dd/MM/yyyy HH:mm")}
                          {r.note ? ` • ${r.note}` : ""}
                          {r.response_notes ? ` • ردّ: ${r.response_notes}` : ""}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" disabled={busy} onClick={() => remove(r)} title="إلغاء التحويل">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="ابحث عن موظف…"
                className="w-full h-9 text-xs rounded-md border bg-background pr-7 pl-2"
              />
            </div>

            <div className="max-h-56 overflow-y-auto space-y-1">
              {filtered.length === 0 && (
                <p className="text-[11px] text-muted-foreground text-center py-3">لا نتائج</p>
              )}
              {filtered.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setSelected(e)}
                  className={`w-full text-right text-xs px-2 py-2 rounded-md border transition ${selected?.id === e.id ? "border-primary bg-primary/10 text-primary" : "bg-muted/30 hover:bg-muted"}`}
                >
                  <span className="font-semibold">{e.full_name}</span>
                  {e.job_title && <span className="text-muted-foreground"> · {e.job_title}</span>}
                </button>
              ))}
            </div>

            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ملاحظة للموظف (اختياري) — مثال: يرجى متابعة الشكوى من ناحية الجودة"
              className="text-xs min-h-[70px]"
            />
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>إغلاق</Button>
          <Button size="sm" className="gap-1" disabled={!selected || busy} onClick={submit}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            تحويل
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
