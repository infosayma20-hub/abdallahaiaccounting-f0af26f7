import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Send, Shield, MessageSquare, Lock, Edit3, History } from "lucide-react";
import SendHRMessageDialog, { SendTarget } from "@/components/hr/SendHRMessageDialog";
import { decodeHRMessage, typeLabel, typeColor, penaltyLabel, STATUS_LABELS, updateHRMessage } from "@/lib/hrMessages";
import { format } from "date-fns";
import { toast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface Props {
  data: any;
}

type Row = {
  id: string;
  employee_id: string;
  attendance_date: string;
  request_type: string;
  reason: string;
  status: string;
  review_notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

export function MessagesTab({ data }: Props) {
  const employee = data?.employee;
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [openSend, setOpenSend] = useState(false);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const isAdmin = userRoles.includes("admin");
  const canIssuePenalty = isAdmin || userRoles.includes("hr_manager");

  // Edit dialog (admin only)
  const [editRow, setEditRow] = useState<Row | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editReason, setEditReason] = useState("");

  const fetchRows = async () => {
    if (!employee?.id) return;
    setLoading(true);
    const { data: r } = await supabase
      .from("correction_requests")
      .select("*")
      .eq("employee_id", employee.id)
      .in("request_type", ["hr_message", "penalty"])
      .order("created_at", { ascending: false });
    setRows((r || []) as Row[]);
    setLoading(false);
  };

  useEffect(() => { fetchRows(); }, [employee?.id]);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      setUserRoles((data || []).map((x: any) => x.role));
    });
  }, [user]);

  const targets: SendTarget[] = employee ? [{
    employee_id: employee.id,
    employee_name: employee.full_name,
  }] : [];

  const openEdit = (row: Row) => {
    if (!isAdmin) {
      toast({ title: "غير مسموح", description: "تعديل الإجراءات/الرسائل لـ admin فقط", variant: "destructive" });
      return;
    }
    const meta = decodeHRMessage(row.reason);
    setEditRow(row);
    setEditSubject(meta?.subject || "");
    setEditBody(meta?.body || "");
    setEditReason("");
  };

  const saveEdit = async () => {
    if (!editRow || !editReason.trim()) {
      toast({ title: "سبب التعديل مطلوب (audit)", variant: "destructive" });
      return;
    }
    const oldMeta = decodeHRMessage(editRow.reason) || ({} as any);
    const newReason = updateHRMessage(editRow.reason, {
      subject: editSubject.trim() || oldMeta.subject,
      body: editBody.trim() || oldMeta.body,
      edited_by: user?.id,
      edited_at: new Date().toISOString(),
      edit_history: [
        ...(oldMeta.edit_history || []),
        { at: new Date().toISOString(), by: user?.id || "", from: { subject: oldMeta.subject, body: oldMeta.body } },
      ],
    });
    const auditNote = `[تعديل admin ${new Date().toISOString().slice(0,16).replace("T"," ")}] ${editReason.trim()}\n${editRow.review_notes || ""}`.trim();
    const { error } = await supabase.from("correction_requests").update({
      reason: newReason,
      review_notes: auditNote,
    }).eq("id", editRow.id);
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
    else { toast({ title: "تم التعديل وتسجيل audit" }); setEditRow(null); fetchRows(); }
  };

  const closeMessage = async (row: Row) => {
    const { error } = await supabase.from("correction_requests").update({
      status: "closed",
      reviewed_by: user?.id,
      reviewed_at: new Date().toISOString(),
    }).eq("id", row.id);
    if (error) toast({ title: "خطأ", description: error.message, variant: "destructive" });
    else { toast({ title: "تم الإغلاق" }); fetchRows(); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">رسائل HR والإجراءات</h3>
          <p className="text-xs text-muted-foreground">السجل الكامل للرسائل والإنذارات والإجراءات العقابية</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpenSend(true)} className="gap-1">
            <MessageSquare className="h-4 w-4" /> إرسال رسالة
          </Button>
          {canIssuePenalty && (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => { setOpenSend(true); }}
              className="gap-1"
            >
              <Shield className="h-4 w-4" /> إجراء عقابي
            </Button>
          )}
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">جاري التحميل...</CardContent></Card>
      ) : rows.length === 0 ? (
        <Card><CardContent className="p-6 text-center text-muted-foreground">لا يوجد رسائل أو إجراءات</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {rows.map(row => {
            const meta = decodeHRMessage(row.reason);
            const t = meta?.type || (row.request_type === "penalty" ? "penalty" : "info");
            const isPenalty = t === "penalty" || t === "warning";
            return (
              <Card key={row.id} className={isPenalty ? "border-red-200" : ""}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={typeColor(t)}>{typeLabel(t)}</Badge>
                      {meta?.penalty_kind && (
                        <Badge variant="outline" className="border-red-300 text-red-700">{penaltyLabel(meta.penalty_kind)}</Badge>
                      )}
                      <Badge variant="secondary">{STATUS_LABELS[row.status] || row.status}</Badge>
                      {meta?.requires_response && (
                        <Badge variant="outline">يحتاج رد{meta.due_date ? ` قبل ${meta.due_date}` : ""}</Badge>
                      )}
                      {meta?.affects_payroll_flag && (
                        <Badge variant="outline" className="border-amber-400 text-amber-700">يؤثر مالياً (للمراجعة)</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {row.status !== "closed" && (
                        <Button size="sm" variant="outline" onClick={() => closeMessage(row)} className="gap-1 h-7">
                          <Lock className="h-3 w-3" /> إغلاق
                        </Button>
                      )}
                      {isAdmin && (
                        <Button size="sm" variant="ghost" onClick={() => openEdit(row)} className="gap-1 h-7">
                          <Edit3 className="h-3 w-3" /> تعديل
                        </Button>
                      )}
                    </div>
                  </div>
                  <div className="font-medium">{meta?.subject || "—"}</div>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">{meta?.body || row.reason}</div>
                  {(meta?.violation_date || meta?.effective_date) && (
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-3">
                      {meta?.violation_date && <span>المخالفة: {meta.violation_date}</span>}
                      {meta?.effective_date && <span>التنفيذ: {meta.effective_date}</span>}
                      {meta?.related_attendance_date && <span>حضور: {meta.related_attendance_date}</span>}
                    </div>
                  )}
                  {meta?.employee_response && (
                    <div className="rounded-md bg-blue-50 border border-blue-200 p-2 text-sm">
                      <div className="text-xs font-medium text-blue-700 mb-1">رد الموظف:</div>
                      <div className="text-blue-900 whitespace-pre-wrap">{meta.employee_response}</div>
                    </div>
                  )}
                  {meta?.employee_acknowledged_at && !meta.employee_response && (
                    <div className="text-xs text-emerald-700">✓ تم اطلاع الموظف في {format(new Date(meta.employee_acknowledged_at), "yyyy-MM-dd HH:mm")}</div>
                  )}
                  {row.review_notes && (
                    <div className="rounded-md bg-muted/40 p-2 text-xs whitespace-pre-wrap flex items-start gap-1">
                      <History className="h-3 w-3 mt-0.5" /> {row.review_notes}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground border-t pt-1">
                    أُنشئت: {format(new Date(row.created_at), "yyyy-MM-dd HH:mm")}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <SendHRMessageDialog
        open={openSend}
        onOpenChange={setOpenSend}
        authUserId={user?.id || ""}
        targets={targets}
        canIssuePenalty={canIssuePenalty}
        onSent={fetchRows}
      />

      {/* Admin Edit Dialog */}
      <Dialog open={!!editRow} onOpenChange={(o) => !o && setEditRow(null)}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Edit3 className="h-5 w-5" /> تعديل (admin) — يُسجل audit</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs">الموضوع</label>
              <Input value={editSubject} onChange={e => setEditSubject(e.target.value)} />
            </div>
            <div>
              <label className="text-xs">النص</label>
              <Textarea rows={4} value={editBody} onChange={e => setEditBody(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-red-600">سبب التعديل (إلزامي للـ audit) *</label>
              <Textarea rows={2} value={editReason} onChange={e => setEditReason(e.target.value)} placeholder="مثال: تصحيح خطأ إملائي" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditRow(null)}>إلغاء</Button>
            <Button onClick={saveEdit} disabled={!editReason.trim()}>حفظ + audit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}