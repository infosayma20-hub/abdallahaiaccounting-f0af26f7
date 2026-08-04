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
import { Lock } from "lucide-react";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { displayReason } from "@/lib/hrMessages";
import { getAnnualLeaveProbation } from "@/lib/hr-utils";
import { LeaveDateField } from "@/components/employee/LeaveDateField";
import { useLeaveBlackoutDates } from "@/hooks/hr/useLeaveBlackoutDates";
import { findBlackoutInRange } from "@/lib/hr/leaveBlackout";

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
  const [allowAdvance, setAllowAdvance] = useState(true);
  const [allowLeave, setAllowLeave] = useState(true);
  const [advanceClosedMsg, setAdvanceClosedMsg] = useState("");
  const [leaveClosedMsg, setLeaveClosedMsg] = useState("");
  const [hireDate, setHireDate] = useState<string | null>(null);
  const { ranges: leaveBlackouts } = useLeaveBlackoutDates();
  const { effectiveMax: advanceMax } = useAdvanceLimit(employeeId);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!employeeId) return;
      const { data } = await supabase
        .from("employees")
        .select("start_date")
        .eq("id", employeeId)
        .maybeSingle();
      if (!cancelled) setHireDate(((data as any)?.start_date as string) ?? null);
    })();
    return () => { cancelled = true; };
  }, [employeeId]);

  useEffect(() => {
    let cancelled = false;
    const fetchIntake = async () => {
      const { data: ownerData } = await supabase.rpc("get_team_owner_id");
      const ownerId = (ownerData as string) || userId;
      const { data } = await supabase
        .from("company_settings")
        .select("hr_allow_advance_requests, hr_allow_leave_requests, hr_advance_requests_closed_message, hr_leave_requests_closed_message")
        .eq("user_id", ownerId)
        .maybeSingle();
      if (cancelled || !data) return;
      setAllowAdvance((data as any).hr_allow_advance_requests !== false);
      setAllowLeave((data as any).hr_allow_leave_requests !== false);
      setAdvanceClosedMsg(((data as any).hr_advance_requests_closed_message ?? "") as string);
      setLeaveClosedMsg(((data as any).hr_leave_requests_closed_message ?? "") as string);
    };
    fetchIntake();
    const onFocus = () => fetchIntake();
    const onVis = () => { if (document.visibilityState === "visible") fetchIntake(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    // Realtime — reflect HR intake toggles immediately without waiting for
    // the employee to re-focus the app.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data: ownerData } = await supabase.rpc("get_team_owner_id");
      const ownerId = (ownerData as string) || userId;
      if (!ownerId) return;
      channel = supabase
        .channel(`emp-intake-${ownerId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "company_settings", filter: `user_id=eq.${ownerId}` },
          () => fetchIntake()
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
      if (channel) supabase.removeChannel(channel);
    };
  }, [userId]);

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
    if (activeForm === "advance" && !allowAdvance) {
      toast({ title: "طلبات السلف مغلقة", description: advanceClosedMsg || "تم إغلاق استقبال طلبات السلف حالياً.", variant: "destructive" });
      return;
    }
    if (activeForm === "advance" && advanceMax !== null && parseFloat(form.amount || "0") > advanceMax) {
      toast({
        title: "المبلغ يتجاوز السقف",
        description: `الحد الأعلى لطلب السلفة هو ${advanceMax} ₪. راجع الموارد البشرية لطلب استثناء.`,
        variant: "destructive",
      });
      return;
    }
    if (activeForm === "leave" && !allowLeave) {
      toast({ title: "طلبات الإجازات مغلقة", description: leaveClosedMsg || "تم إغلاق استقبال طلبات الإجازات حالياً.", variant: "destructive" });
      return;
    }
    if (!form.reason.trim()) {
      toast({ title: "خطأ", description: "يرجى كتابة السبب", variant: "destructive" });
      return;
    }
    if (activeForm === "leave" && form.leaveType === "annual") {
      const prob = getAnnualLeaveProbation(hireDate);
      if (!prob.eligible) {
        toast({
          title: "غير مؤهل للإجازة السنوية بعد",
          description: `الإجازة السنوية متاحة بعد إتمام 3 أشهر من المباشرة (متبقي ${prob.daysRemaining} يوم).`,
          variant: "destructive",
        });
        return;
      }
    }
    if (activeForm === "leave") {
      const hit = findBlackoutInRange(form.date, form.endDate, leaveBlackouts);
      if (hit) {
        toast({
          title: "تاريخ غير متاح للإجازة",
          description:
            `الفترة ${hit.start_date} → ${hit.end_date} ممنوع تقديم إجازة عليها` +
            (hit.reason ? ` (${hit.reason})` : "") + ".",
          variant: "destructive",
        });
        return;
      }
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
        {requestTypes.map(rt => {
          const isClosed =
            (rt.id === "advance" && !allowAdvance) ||
            (rt.id === "leave" && !allowLeave);
          const closedMsg = rt.id === "advance" ? advanceClosedMsg : leaveClosedMsg;
          return (
            <Button
              key={rt.id}
              variant="outline"
              disabled={isClosed}
              title={isClosed ? (closedMsg || "الاستقبال مغلق حالياً") : undefined}
              className="h-20 flex-col gap-1.5 rounded-2xl border-border text-xs relative disabled:opacity-60"
              onClick={() => setActiveForm(rt.id)}
            >
              <rt.icon className={`h-5 w-5 ${rt.color}`} />
              {rt.label}
              {isClosed && (
                <Lock className="h-3 w-3 absolute top-1.5 left-1.5 text-muted-foreground" />
              )}
            </Button>
          );
        })}
      </div>

      {(!allowAdvance || !allowLeave) && (
        <Card className="border-amber-500/30 bg-amber-500/10">
          <CardContent className="p-3 space-y-1 text-xs text-amber-900 dark:text-amber-200">
            {!allowAdvance && (
              <div className="flex items-start gap-2">
                <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{advanceClosedMsg || "تم إغلاق استقبال طلبات السلف حالياً."}</span>
              </div>
            )}
            {!allowLeave && (
              <div className="flex items-start gap-2">
                <Lock className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{leaveClosedMsg || "تم إغلاق استقبال طلبات الإجازات حالياً."}</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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
                  <LeaveDateField
                    value={form.date}
                    onChange={v => setForm(p => ({ ...p, date: v }))}
                    blackouts={leaveBlackouts}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ</label>
                  <LeaveDateField
                    value={form.endDate}
                    onChange={v => setForm(p => ({ ...p, endDate: v }))}
                    blackouts={leaveBlackouts}
                    min={form.date || undefined}
                  />
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
                {advanceMax !== null && (
                  <p className={`text-[10px] mt-1 ${parseFloat(form.amount || "0") > advanceMax ? "text-destructive" : "text-muted-foreground"}`}>
                    الحد الأعلى المسموح: {advanceMax} ₪
                  </p>
                )}
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
