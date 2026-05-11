import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Shield, Check, Reply, AlertTriangle, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  decodeHRMessage, typeLabel, typeColor, penaltyLabel, STATUS_LABELS, updateHRMessage,
} from "@/lib/hrMessages";
import { format } from "date-fns";

type CorrectionRequest = {
  id: string;
  attendance_date: string;
  request_type: string;
  reason: string;
  status: string;
  review_notes: string | null;
  created_at: string;
};

interface Props {
  corrections: CorrectionRequest[];
  onRefresh: () => void;
  onOpenCorrectionForm?: (date: string) => void;
}

export default function EmployeeHRMessagesSection({ corrections, onRefresh, onOpenCorrectionForm }: Props) {
  const messages = corrections.filter(c =>
    c.request_type === "hr_message" || c.request_type === "penalty"
  );
  const [replyOpen, setReplyOpen] = useState<CorrectionRequest | null>(null);
  const [replyText, setReplyText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const markRead = async (row: CorrectionRequest) => {
    if (row.status !== "pending") return;
    const meta = decodeHRMessage(row.reason) || ({} as any);
    const newReason = updateHRMessage(row.reason, {
      employee_acknowledged_at: new Date().toISOString(),
    });
    await supabase.from("correction_requests").update({
      status: "read",
      reason: newReason,
    }).eq("id", row.id);
    onRefresh();
  };

  const submitReply = async () => {
    if (!replyOpen) return;
    if (!replyText.trim()) { toast({ title: "اكتب الرد أولاً", variant: "destructive" }); return; }
    setSubmitting(true);
    const newReason = updateHRMessage(replyOpen.reason, {
      employee_response: replyText.trim(),
      employee_response_at: new Date().toISOString(),
      employee_acknowledged_at: new Date().toISOString(),
    });
    const { error } = await supabase.from("correction_requests").update({
      status: "responded",
      reason: newReason,
    }).eq("id", replyOpen.id);
    setSubmitting(false);
    if (error) { toast({ title: "خطأ", description: error.message, variant: "destructive" }); return; }
    toast({ title: "تم إرسال الرد" });
    setReplyOpen(null); setReplyText("");
    onRefresh();
  };

  if (messages.length === 0) return null;

  const unreadCount = messages.filter(m => m.status === "pending").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          رسائل HR والإجراءات ({messages.length})
        </h2>
        {unreadCount > 0 && (
          <Badge className="bg-red-600 text-white">{unreadCount} جديد</Badge>
        )}
      </div>

      <div className="space-y-2">
        {messages.map(row => {
          const meta = decodeHRMessage(row.reason);
          const t = meta?.type || (row.request_type === "penalty" ? "penalty" : "info");
          const isPenalty = t === "penalty" || t === "warning";
          const isUnread = row.status === "pending";
          const requiresResponse = !!meta?.requires_response;
          const hasResponded = !!meta?.employee_response;
          return (
            <Card
              key={row.id}
              className={[
                isPenalty ? "border-red-300 bg-red-50/30" : "",
                isUnread ? "ring-2 ring-primary/40" : "",
              ].join(" ")}
              onClick={() => isUnread && markRead(row)}
            >
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {isPenalty && <Shield className="h-4 w-4 text-red-600" />}
                  <Badge className={typeColor(t)}>{typeLabel(t)}</Badge>
                  {meta?.penalty_kind && (
                    <Badge variant="outline" className="border-red-300 text-red-700 text-[10px]">{penaltyLabel(meta.penalty_kind)}</Badge>
                  )}
                  <Badge variant="secondary" className="text-[10px]">{STATUS_LABELS[row.status] || row.status}</Badge>
                  {meta?.affects_payroll_flag && (
                    <Badge variant="outline" className="border-amber-400 text-amber-700 text-[10px]">يؤثر مالياً</Badge>
                  )}
                </div>
                <div className="font-semibold text-sm">{meta?.subject || "—"}</div>
                <div className="text-sm text-foreground/80 whitespace-pre-wrap">{meta?.body || row.reason}</div>
                {(meta?.violation_date || meta?.effective_date || meta?.due_date) && (
                  <div className="text-[11px] text-muted-foreground flex flex-wrap gap-3">
                    {meta?.violation_date && <span>المخالفة: {meta.violation_date}</span>}
                    {meta?.effective_date && <span>التنفيذ: {meta.effective_date}</span>}
                    {meta?.due_date && <span className="text-amber-700">رد قبل: {meta.due_date}</span>}
                  </div>
                )}
                {hasResponded && (
                  <div className="rounded-md bg-blue-50 border border-blue-200 p-2 text-xs">
                    <div className="font-medium text-blue-700 mb-1">ردك:</div>
                    <div className="text-blue-900 whitespace-pre-wrap">{meta!.employee_response}</div>
                  </div>
                )}
                {row.review_notes && (
                  <div className={[
                    "rounded-md border p-2 text-xs",
                    row.status === "rejected"
                      ? "bg-red-50 border-red-200"
                      : "bg-emerald-50 border-emerald-200",
                  ].join(" ")}>
                    <div className={[
                      "font-medium mb-1 flex items-center gap-1",
                      row.status === "rejected" ? "text-red-700" : "text-emerald-700",
                    ].join(" ")}>
                      <Reply className="h-3 w-3" />
                      رد إدارة HR{row.status === "approved" ? " (مقبول)" : row.status === "rejected" ? " (مرفوض)" : ""}:
                    </div>
                    <div className={row.status === "rejected" ? "text-red-900 whitespace-pre-wrap" : "text-emerald-900 whitespace-pre-wrap"}>
                      {row.review_notes}
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  {requiresResponse && !hasResponded && (
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
                      onClick={(e) => { e.stopPropagation(); setReplyOpen(row); setReplyText(""); }}
                    >
                      <Reply className="h-3 w-3" /> الرد
                    </Button>
                  )}
                  {!requiresResponse && isUnread && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={(e) => { e.stopPropagation(); markRead(row); }}
                    >
                      <Check className="h-3 w-3" /> تم الاطلاع
                    </Button>
                  )}
                  {meta?.related_attendance_date && onOpenCorrectionForm && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs gap-1"
                      onClick={(e) => { e.stopPropagation(); onOpenCorrectionForm(meta.related_attendance_date!); }}
                    >
                      <FileText className="h-3 w-3" /> طلب تصحيح بصمة
                    </Button>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground border-t pt-1">
                  {format(new Date(row.created_at), "yyyy-MM-dd HH:mm")}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={!!replyOpen} onOpenChange={(o) => { if (!o) setReplyOpen(null); }}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Reply className="h-5 w-5 text-primary" /> الرد على HR
            </DialogTitle>
          </DialogHeader>
          {replyOpen && (
            <div className="space-y-3">
              <div className="rounded-md bg-muted/50 p-2 text-xs">
                <div className="font-medium mb-1">الموضوع:</div>
                <div>{decodeHRMessage(replyOpen.reason)?.subject}</div>
              </div>
              <Textarea
                rows={5}
                value={replyText}
                onChange={e => setReplyText(e.target.value)}
                placeholder="اكتب ردك هنا..."
                maxLength={1000}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyOpen(null)} disabled={submitting}>إلغاء</Button>
            <Button onClick={submitReply} disabled={submitting || !replyText.trim()}>إرسال الرد</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}