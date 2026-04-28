import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Palmtree, Banknote, Clock, Send, FileText, MessageSquare, PenLine
} from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { displayReason } from "@/lib/hrMessages";

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
  employeeId: string;
  userId: string;
  onRefresh: () => void;
}

type RequestType = "leave" | "advance" | "correction" | "overtime" | "message";

const requestTypes: { id: RequestType; label: string; icon: React.ElementType; color: string }[] = [
  { id: "leave", label: "إجازة", icon: Palmtree, color: "text-emerald-500" },
  { id: "advance", label: "سلفة", icon: Banknote, color: "text-warning" },
  { id: "correction", label: "تصحيح بصمة", icon: PenLine, color: "text-orange-500" },
  { id: "overtime", label: "أوفرتايم", icon: Clock, color: "text-blue-400" },
  { id: "message", label: "رسالة لـ HR", icon: MessageSquare, color: "text-purple-400" },
];

const statusLabel = (s: string) => {
  switch (s) {
    case "pending": return { text: "🟡 قيد المراجعة", variant: "outline" as const };
    case "approved": return { text: "✅ معتمد", variant: "default" as const };
    case "rejected": return { text: "❌ مرفوض", variant: "destructive" as const };
    default: return { text: s, variant: "outline" as const };
  }
};

export default function EmployeeRequestsTab({ corrections, employeeId, userId, onRefresh }: Props) {
  const [activeForm, setActiveForm] = useState<RequestType | null>(null);
  const [form, setForm] = useState({
    date: "",
    endDate: "",
    type: "missing_checkout",
    leaveType: "annual",
    reason: "",
    amount: "",
  });
  const [submitting, setSubmitting] = useState(false);

  const submitRequest = async () => {
    if (!form.reason.trim()) {
      toast({ title: "خطأ", description: "يرجى كتابة السبب", variant: "destructive" });
      return;
    }

    setSubmitting(true);

    // For now, all requests go through correction_requests table with request_type
    const requestType = activeForm === "leave" ? "leave_request"
      : activeForm === "advance" ? "advance_request"
      : activeForm === "overtime" ? "overtime_request"
      : activeForm === "message" ? "hr_message"
      : form.type;

    const insertData: Record<string, any> = {
      employee_id: employeeId,
      auth_user_id: userId,
      attendance_date: form.date || new Date().toISOString().split("T")[0],
      request_type: requestType,
      reason: form.reason,
      status: "pending",
    };

    // Handle advance amount separately - don't put it in requested_time (timestamp field)
    if (activeForm === "advance" && form.amount) {
      insertData.amount = parseFloat(form.amount);
      insertData.requested_time = null;
    } else if (activeForm === "leave") {
      insertData.requested_time = null; // Don't put date range in timestamp field
    } else {
      insertData.requested_time = null;
    }

    const { error } = await supabase.from("correction_requests").insert(insertData as any);

    setSubmitting(false);

    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم الإرسال ✅", description: "تم إرسال طلبك بنجاح" });
      setActiveForm(null);
      setForm({ date: "", endDate: "", type: "missing_checkout", leaveType: "annual", reason: "", amount: "" });
      onRefresh();
    }
  };

  return (
    <div className="space-y-4 px-4 pt-3" dir="rtl" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}>
      <h2 className="text-lg font-bold pt-2">📨 الطلبات والتواصل</h2>

      {/* Quick request buttons */}
      <div className="grid grid-cols-3 gap-2">
        {requestTypes.map(rt => (
          <Button
            key={rt.id}
            variant="outline"
            className="h-20 flex-col gap-1.5 rounded-2xl border-border text-xs"
            onClick={() => setActiveForm(rt.id)}
          >
            <rt.icon className={`h-5 w-5 ${rt.color}`} />
            {rt.label}
          </Button>
        ))}
      </div>

      {/* Previous requests */}
      <h3 className="text-sm font-semibold flex items-center gap-2 pt-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        طلباتي السابقة
      </h3>

      {corrections.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">لا يوجد طلبات سابقة</p>
          </CardContent>
        </Card>
      ) : (
        corrections.map(req => {
          const st = statusLabel(req.status);
          const typeLabel = req.request_type === "leave_request" ? "🏖️ طلب إجازة"
            : req.request_type === "advance_request" ? "💰 طلب سلفة"
            : req.request_type === "overtime_request" ? "⏰ أوفرتايم"
            : req.request_type === "hr_message" ? "💬 رسالة HR"
            : "✏️ تصحيح بصمة";

          return (
            <Card key={req.id} className="border-border bg-card">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold">{typeLabel}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(req.created_at), "dd/MM/yyyy")}
                    </span>
                    <Badge variant={st.variant} className="text-[10px]">{st.text}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground whitespace-pre-wrap">{displayReason(req.reason)}</p>
                {req.review_notes && (
                  <p className="text-xs text-primary bg-primary/5 rounded-lg p-2">
                    💬 ملاحظة HR: {req.review_notes}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })
      )}

      {/* Request form dialog */}
      <Dialog open={!!activeForm} onOpenChange={(o) => !o && setActiveForm(null)}>
        <DialogContent className="max-w-sm bg-card border-border" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base">
              {activeForm === "leave" && "🏖️ طلب إجازة"}
              {activeForm === "advance" && "💰 طلب سلفة"}
              {activeForm === "correction" && "✏️ طلب تصحيح بصمة"}
              {activeForm === "overtime" && "⏰ طلب أوفرتايم"}
              {activeForm === "message" && "💬 رسالة لـ HR"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {activeForm === "leave" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">من تاريخ</label>
                  <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} dir="ltr" className="rounded-xl" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</label>
                  <Input type="date" value={form.endDate} onChange={e => setForm(p => ({ ...p, endDate: e.target.value }))} dir="ltr" className="rounded-xl" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">نوع الإجازة</label>
                  <Select value={form.leaveType} onValueChange={v => setForm(p => ({ ...p, leaveType: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="annual">سنوية</SelectItem>
                      <SelectItem value="sick">مرضية</SelectItem>
                      <SelectItem value="personal">شخصية</SelectItem>
                      <SelectItem value="unpaid">بدون راتب</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {activeForm === "advance" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">المبلغ المطلوب (₪)</label>
                <Input type="number" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} dir="ltr" className="rounded-xl" placeholder="500" />
              </div>
            )}

            {activeForm === "correction" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">التاريخ</label>
                  <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} dir="ltr" className="rounded-xl" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">نوع التصحيح</label>
                  <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
                    <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="missing_checkin">بصمة دخول مفقودة</SelectItem>
                      <SelectItem value="missing_checkout">بصمة خروج مفقودة</SelectItem>
                      <SelectItem value="wrong_time">وقت خاطئ</SelectItem>
                      <SelectItem value="other">أخرى</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {activeForm === "overtime" && (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">التاريخ</label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} dir="ltr" className="rounded-xl" />
              </div>
            )}

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                {activeForm === "message" ? "الرسالة" : "السبب / التفاصيل"}
              </label>
              <Textarea
                placeholder={activeForm === "message" ? "اكتب رسالتك هنا..." : "اشرح السبب..."}
                value={form.reason}
                onChange={e => setForm(p => ({ ...p, reason: e.target.value }))}
                rows={3}
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submitRequest} disabled={submitting} className="w-full rounded-xl gap-2">
              <Send className="h-4 w-4" />
              {submitting ? "جاري الإرسال..." : "إرسال الطلب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
