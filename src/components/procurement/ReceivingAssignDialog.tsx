import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";

export type ReceivingSessionSummary = {
  id: string;
  order_id: string;
  status: "assigned" | "in_progress" | "submitted" | "approved" | "cancelled";
  assigned_employee_id: string | null;
  expected_date: string | null;
  employee_name?: string | null;
};

export const receivingStatusLabel: Record<string, string> = {
  assigned: "مسندة للاستلام",
  in_progress: "قيد الاستلام",
  submitted: "بانتظار اعتماد المحاسب",
  approved: "استلام معتمد",
  cancelled: "ملغاة",
};

interface Props {
  order: { id: string; order_number: string } | null;
  current?: ReceivingSessionSummary | null;
  onClose: () => void;
  onDone: () => void;
}

export default function ReceivingAssignDialog({ order, current, onClose, onDone }: Props) {
  const { dataOwnerId } = useDataOwnerId();
  const [employees, setEmployees] = useState<{ id: string; full_name: string; is_receiver?: boolean | null }[]>([]);
  const [search, setSearch] = useState("");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [expected, setExpected] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!order || !dataOwnerId) return;
    setEmployeeId(current?.assigned_employee_id || "");
    setExpected(current?.expected_date || "");
    (async () => {
      const { data } = await supabase
        .from("employees")
        .select("id, full_name, is_receiver")
        .eq("user_id", dataOwnerId)
        .eq("is_active", true)
        .not("auth_user_id", "is", null)
        .order("is_receiver", { ascending: false })
        .order("full_name");
      setEmployees((data as any) || []);
    })();
  }, [order, dataOwnerId, current]);

  const filtered = useMemo(() => {
    const q = search.trim();
    return q ? employees.filter(e => (e.full_name || "").includes(q)) : employees;
  }, [employees, search]);

  const assign = async () => {
    if (!order || !employeeId) return;
    setBusy(true);
    const { error } = await supabase.rpc("assign_receiving_session", {
      p_order_id: order.id, p_employee_id: employeeId, p_expected_date: expected || null,
    } as any);
    setBusy(false);
    if (error) { toast({ title: "تعذر الإسناد", description: error.message, variant: "destructive" }); return; }
    toast({ title: "تم إسناد الطلبية للاستلام" });
    onDone(); onClose();
  };

  const runAction = async (fn: "cancel_receiving_session" | "reopen_receiving_session", msg: string) => {
    if (!current) return;
    setBusy(true);
    const { error } = await supabase.rpc(fn, { p_session_id: current.id } as any);
    setBusy(false);
    if (error) { toast({ title: "تعذر التنفيذ", description: error.message, variant: "destructive" }); return; }
    toast({ title: msg });
    onDone(); onClose();
  };

  const canReassign = !current || current.status === "assigned" || current.status === "in_progress";

  return (
    <Dialog open={!!order} onOpenChange={o => !o && onClose()}>
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle>إسناد للاستلام — {order?.order_number}</DialogTitle>
          <DialogDescription>
            الموظف بيشوف الطلبية على التابليت ويستلمها بالباركود. الأسعار ما بتظهر له.
          </DialogDescription>
        </DialogHeader>

        {current && (
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            الحالة الحالية: <b>{receivingStatusLabel[current.status]}</b>
            {current.employee_name ? <> — {current.employee_name}</> : null}
          </div>
        )}

        {canReassign && (
          <div className="space-y-3">
            <div>
              <Label>الموظف المستلم</Label>
              <Input placeholder="بحث بالاسم…" value={search} onChange={e => setSearch(e.target.value)} className="mt-1" />
              <div className="mt-2 max-h-56 overflow-auto rounded-md border">
                {filtered.length === 0 && <div className="p-3 text-sm text-muted-foreground">لا يوجد موظفون لديهم حساب دخول</div>}
                {filtered.map(e => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => setEmployeeId(e.id)}
                    className={`block w-full px-3 py-2 text-right text-sm hover:bg-accent ${employeeId === e.id ? "bg-primary/10 font-bold" : ""}`}
                  >
                    {e.full_name}
                    {e.is_receiver && (
                      <span className="ms-2 rounded bg-teal-100 px-1.5 py-0.5 text-[10px] text-teal-700">موظف مستودع</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>تاريخ الاستلام المتوقع (اختياري)</Label>
              <Input type="date" value={expected} onChange={e => setExpected(e.target.value)} className="mt-1" />
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          {canReassign && (
            <Button onClick={assign} disabled={!employeeId || busy}>
              {current ? "إعادة الإسناد" : "إسناد"}
            </Button>
          )}
          {current && (current.status === "assigned" || current.status === "in_progress" || current.status === "submitted") && (
            <Button variant="outline" disabled={busy} onClick={() => runAction("cancel_receiving_session", "تم إلغاء الإسناد")}>
              إلغاء الإسناد
            </Button>
          )}
          {current?.status === "submitted" && (
            <Button variant="outline" disabled={busy} onClick={() => runAction("reopen_receiving_session", "أُعيد فتح الاستلام للموظف")}>
              إعادة فتح للموظف
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
