import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, X, Repeat, Plus } from "lucide-react";
import ManagerHeader from "./ManagerHeader";
import { useAuth } from "@/hooks/useAuth";

type Swap = {
  id: string;
  employee_id: string;
  attendance_date: string;
  reason: string | null;
  status: string;
  employee_name?: string;
};

export default function ShiftSwapsTab({ branchId, branchName, onBack }: { branchId: string | null; branchName: string; onBack: () => void }) {
  const { user } = useAuth();
  const [list, setList] = useState<Swap[]>([]);
  const [loading, setLoading] = useState(true);
  const [emps, setEmps] = useState<{ id: string; full_name: string }[]>([]);
  const [showNew, setShowNew] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    const { data: e } = await supabase.from("employees").select("id, full_name").eq("branch_id", branchId).eq("is_active", true).order("full_name");
    const list = (e || []) as any[];
    setEmps(list);
    const ids = list.map(x => x.id);
    if (!ids.length) { setList([]); setLoading(false); return; }
    const nameMap = new Map(list.map(x => [x.id, x.full_name]));
    const { data } = await supabase
      .from("correction_requests")
      .select("*")
      .in("employee_id", ids)
      .eq("request_type", "shift_swap")
      .order("created_at", { ascending: false })
      .limit(50);
    setList(((data as any[]) || []).map(r => ({ ...r, employee_name: nameMap.get(r.employee_id) })));
    setLoading(false);
  }, [branchId]);

  useEffect(() => { load(); }, [load]);

  const decide = async (s: Swap, status: "approved" | "rejected") => {
    try {
      const { error } = await supabase
        .from("correction_requests")
        .update({ status, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
        .eq("id", s.id);
      if (error) throw error;
      toast.success(status === "approved" ? "تم الاعتماد" : "تم الرفض");
      load();
    } catch (e: any) { toast.error(e.message || "فشل"); }
  };

  const create = async () => {
    if (!from || !to || !date) { toast.error("اختر الموظفين والتاريخ"); return; }
    try {
      const fromEmp = emps.find(e => e.id === from)?.full_name;
      const toEmp = emps.find(e => e.id === to)?.full_name;
      const { error } = await supabase.from("correction_requests").insert({
        employee_id: from,
        auth_user_id: user?.id,
        attendance_date: date,
        request_type: "shift_swap",
        reason: `تبديل وردية: ${fromEmp} ↔ ${toEmp}${reason ? ` — ${reason}` : ""}`,
        status: "pending",
      });
      if (error) throw error;
      toast.success("تم إنشاء طلب التبديل");
      setShowNew(false); setFrom(""); setTo(""); setReason("");
      load();
    } catch (e: any) { toast.error(e.message || "فشل الإنشاء"); }
  };

  return (
    <div dir="rtl" className="pb-24">
      <ManagerHeader title="تبديل الورديات" subtitle={branchName} onBack={onBack} />
      <div className="px-3 pt-3 space-y-3">
        <button
          onClick={() => setShowNew(v => !v)}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 active:scale-[0.98]"
        >
          <Plus className="h-4 w-4" /> {showNew ? "إغلاق" : "طلب تبديل جديد"}
        </button>
        {showNew && (
          <div className="bg-card border border-border rounded-2xl p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <select value={from} onChange={e => setFrom(e.target.value)} className="h-10 rounded-xl border border-border bg-background px-2 text-sm">
                <option value="">من موظف…</option>
                {emps.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
              <select value={to} onChange={e => setTo(e.target.value)} className="h-10 rounded-xl border border-border bg-background px-2 text-sm">
                <option value="">إلى موظف…</option>
                {emps.map(e => <option key={e.id} value={e.id}>{e.full_name}</option>)}
              </select>
            </div>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm" />
            <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="سبب التبديل (اختياري)" rows={2} className="w-full text-xs rounded-lg border border-border bg-background p-2" />
            <button onClick={create} className="w-full h-10 rounded-xl bg-emerald-600 text-white font-semibold text-sm">حفظ الطلب</button>
          </div>
        )}
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">جار التحميل…</div>
        ) : !list.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <Repeat className="h-8 w-8 mx-auto mb-2 opacity-50" />
            لا توجد طلبات تبديل
          </div>
        ) : list.map(s => (
          <div key={s.id} className="bg-card border border-border rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm">{s.employee_name}</div>
              <span className="text-[11px] text-muted-foreground">{s.attendance_date}</span>
            </div>
            {s.reason && <div className="text-xs bg-secondary/40 rounded-lg p-2">{s.reason}</div>}
            <div className="flex items-center justify-between">
              <span className={`text-[10px] px-2 py-0.5 rounded-md ${
                s.status === "approved" ? "bg-emerald-500/10 text-emerald-500"
                : s.status === "rejected" ? "bg-destructive/10 text-destructive"
                : "bg-warning/10 text-warning"
              }`}>
                {s.status === "approved" ? "معتمد" : s.status === "rejected" ? "مرفوض" : "قيد الانتظار"}
              </span>
              {s.status === "pending" && (
                <div className="flex gap-2">
                  <button onClick={() => decide(s, "approved")} className="h-9 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold flex items-center gap-1">
                    <Check className="h-3 w-3" /> قبول
                  </button>
                  <button onClick={() => decide(s, "rejected")} className="h-9 px-3 rounded-lg bg-destructive text-destructive-foreground text-xs font-semibold flex items-center gap-1">
                    <X className="h-3 w-3" /> رفض
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}