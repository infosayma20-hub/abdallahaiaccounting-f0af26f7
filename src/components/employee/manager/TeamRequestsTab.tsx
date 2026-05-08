import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Check, X, Inbox } from "lucide-react";
import ManagerHeader from "./ManagerHeader";
import { useAuth } from "@/hooks/useAuth";
import { useManagedBranchEmployees } from "@/hooks/useBranchRoster";

type Req = {
  id: string;
  employee_id: string;
  attendance_date: string;
  request_type: string;
  reason: string | null;
  status: string;
  created_at: string;
  employee_name?: string;
};

const TYPE_LABEL: Record<string, string> = {
  leave: "إجازة",
  permission: "استئذان",
  attendance_correction: "تصحيح حضور",
  shift_swap: "تبديل وردية",
};

export default function TeamRequestsTab({ branchId, branchName, onBack }: { branchId: string | null; branchName: string; onBack: () => void }) {
  const { user } = useAuth();
  const [requests, setRequests] = useState<Req[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [notesById, setNotesById] = useState<Record<string, string>>({});
  const { data: employees = [], isLoading: employeesLoading } = useManagedBranchEmployees(branchId);

  const load = useCallback(async () => {
    if (!branchId || employeesLoading) return;
    setLoading(true);
    const ids = employees.map((e) => e.id);
    const nameMap = new Map(employees.map((e) => [e.id, e.full_name]));
    if (!ids.length) { setRequests([]); setLoading(false); return; }
    let q = supabase.from("correction_requests").select("*").in("employee_id", ids).order("created_at", { ascending: false }).limit(100);
    if (filter === "pending") q = q.eq("status", "pending");
    const { data } = await q;
    setRequests(((data as any[]) || []).map(r => ({ ...r, employee_name: nameMap.get(r.employee_id) })));
    setLoading(false);
  }, [branchId, filter, employees, employeesLoading]);

  useEffect(() => { load(); }, [load]);

  const decide = async (r: Req, status: "approved" | "rejected") => {
    try {
      const { error } = await supabase
        .from("correction_requests")
        .update({ status, review_notes: notesById[r.id] || null, reviewed_by: user?.id, reviewed_at: new Date().toISOString() })
        .eq("id", r.id);
      if (error) throw error;
      toast.success(status === "approved" ? "تم الاعتماد" : "تم الرفض");
      load();
    } catch (e: any) {
      toast.error(e.message || "فشل التحديث");
    }
  };

  return (
    <div dir="rtl" className="pb-24">
      <ManagerHeader title="طلبات الفريق" subtitle={branchName} onBack={onBack} />
      <div className="px-3 pt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          {(["pending", "all"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`h-10 rounded-xl text-sm font-semibold border ${filter === f ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
            >
              {f === "pending" ? "قيد الانتظار" : "الكل"}
            </button>
          ))}
        </div>
        {loading || employeesLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">جار التحميل…</div>
        ) : !requests.length ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            <Inbox className="h-8 w-8 mx-auto mb-2 opacity-50" />
            لا توجد طلبات
          </div>
        ) : requests.map(r => (
          <div key={r.id} className="bg-card border border-border rounded-2xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="font-semibold text-sm">{r.employee_name || r.employee_id.slice(0, 6)}</div>
                <div className="text-[11px] text-muted-foreground">
                  {TYPE_LABEL[r.request_type] || r.request_type} • {r.attendance_date}
                </div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-md ${
                r.status === "approved" ? "bg-emerald-500/10 text-emerald-500"
                : r.status === "rejected" ? "bg-destructive/10 text-destructive"
                : "bg-warning/10 text-warning"
              }`}>
                {r.status === "approved" ? "معتمد" : r.status === "rejected" ? "مرفوض" : "قيد الانتظار"}
              </span>
            </div>
            {r.reason && <div className="text-xs text-foreground bg-secondary/40 rounded-lg p-2">{r.reason}</div>}
            {r.status === "pending" && (
              <>
                <textarea
                  placeholder="ملاحظات (اختياري)"
                  value={notesById[r.id] || ""}
                  onChange={e => setNotesById({ ...notesById, [r.id]: e.target.value })}
                  rows={2}
                  className="w-full text-xs rounded-lg border border-border bg-background p-2"
                />
                <div className="flex gap-2">
                  <button onClick={() => decide(r, "approved")} className="flex-1 h-10 rounded-xl bg-emerald-600 text-white text-sm font-semibold flex items-center justify-center gap-1 active:scale-[0.98]">
                    <Check className="h-4 w-4" /> اعتماد
                  </button>
                  <button onClick={() => decide(r, "rejected")} className="flex-1 h-10 rounded-xl bg-destructive text-destructive-foreground text-sm font-semibold flex items-center justify-center gap-1 active:scale-[0.98]">
                    <X className="h-4 w-4" /> رفض
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}