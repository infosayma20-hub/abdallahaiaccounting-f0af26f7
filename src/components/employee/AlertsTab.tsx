import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Send, FileText } from "lucide-react";
import { useState } from "react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { fmtDateDisplay } from "@/lib/utils";
import EmployeeHRMessagesSection from "./EmployeeHRMessagesSection";
import { displayReason } from "@/lib/hrMessages";

type AttendanceDay = {
  id: string;
  attendance_date: string;
  first_check_in: string | null;
  last_check_out: string | null;
  total_hours: number;
  status: string;
};

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
  incompleteDays: AttendanceDay[];
  corrections: CorrectionRequest[];
  employeeId: string;
  userId: string;
  onRefresh: () => void;
}

export default function AlertsTab({ incompleteDays, corrections, employeeId, userId, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ date: "", type: "missing_checkout", time: "", reason: "" });

  const submitCorrection = async () => {
    if (!form.date || !form.type || !form.time || !form.reason.trim()) {
      toast({ title: "خطأ", description: "يرجى ملء جميع الحقول", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("correction_requests").insert({
      employee_id: employeeId,
      auth_user_id: userId,
      attendance_date: form.date,
      request_type: form.type,
      reason: `[${form.time}] ${form.reason}`,
      status: "pending",
    });
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم الإرسال ✅", description: "تم إرسال طلب التعديل" });
      setShowForm(false);
      setForm({ date: "", type: "missing_checkout", time: "", reason: "" });
      onRefresh();
    }
  };

  return (
    <div className="space-y-4 px-4 pt-3" dir="rtl" style={{ paddingBottom: "calc(72px + env(safe-area-inset-bottom, 0px))" }}>
      {/* HR Messages & Disciplinary Actions */}
      <EmployeeHRMessagesSection
        corrections={corrections as any}
        onRefresh={onRefresh}
        onOpenCorrectionForm={(date) => { setForm({ date, type: "missing_checkout", time: "", reason: "" }); setShowForm(true); }}
      />

      {/* Incomplete days */}
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-warning" />
          بصمات ناقصة ({incompleteDays.length})
        </h2>
        <Button size="sm" variant="outline" className="gap-1 rounded-xl text-xs" onClick={() => setShowForm(true)}>
          <Send className="h-3 w-3" /> طلب تعديل
        </Button>
      </div>

      {incompleteDays.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">لا يوجد بصمات ناقصة 🎉</p>
          </CardContent>
        </Card>
      ) : (
        incompleteDays.map((day) => (
          <Card
            key={day.id}
            className="border-warning/20 bg-card cursor-pointer hover:bg-muted/30 active:scale-[0.99] transition-all"
            onClick={() => {
              const missingType = !day.first_check_in
                ? "missing_checkin"
                : !day.last_check_out
                ? "missing_checkout"
                : "wrong_time";
              setForm({ date: day.attendance_date, type: missingType, time: "", reason: "" });
              setShowForm(true);
            }}
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  <span className="text-sm font-medium">
                    {format(new Date(day.attendance_date), "EEEE d/M", { locale: ar })}
                  </span>
                </div>
                <span className="text-[10px] text-muted-foreground">
                  {day.first_check_in ? format(new Date(day.first_check_in), "hh:mm a") : "مفقود"}
                  {" | "}
                  {day.last_check_out ? format(new Date(day.last_check_out), "hh:mm a") : "مفقود"}
                </span>
              </div>
              <p className="text-[10px] text-primary mt-1">اضغط للتعديل ▸</p>
            </CardContent>
          </Card>
        ))
      )}

      {/* Correction requests */}
      <h2 className="font-semibold text-sm flex items-center gap-2 pt-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        طلبات التعديل
      </h2>

      {corrections.length === 0 ? (
        <Card className="border-border bg-card">
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">لا يوجد طلبات</p>
          </CardContent>
        </Card>
      ) : (
        corrections.map((req) => (
          <Card key={req.id} className="border-border bg-card">
            <CardContent className="p-3 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{fmtDateDisplay(req.attendance_date)}</span>
                <Badge variant={req.status === "approved" ? "default" : req.status === "rejected" ? "destructive" : "outline"} className="text-[10px]">
                  {req.status === "pending" ? "قيد المراجعة" : req.status === "approved" ? "مقبول" : "مرفوض"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">{displayReason(req.reason)}</p>
              {req.review_notes && (
                <p className="text-xs text-primary">ملاحظة HR: {req.review_notes}</p>
              )}
            </CardContent>
          </Card>
        ))
      )}

      {/* Correction form dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-sm bg-card border-border" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base">طلب تعديل بصمة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">التاريخ</label>
              <Input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} dir="ltr" className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">نوع التعديل</label>
              <Select value={form.type} onValueChange={(v) => setForm((p) => ({ ...p, type: v }))}>
                <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="missing_checkin">بصمة دخول مفقودة</SelectItem>
                  <SelectItem value="missing_checkout">بصمة خروج مفقودة</SelectItem>
                  <SelectItem value="wrong_time">وقت خاطئ</SelectItem>
                  <SelectItem value="other">أخرى</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">وقت البصمة *</label>
              <Input type="time" value={form.time} onChange={(e) => setForm((p) => ({ ...p, time: e.target.value }))} dir="ltr" className="rounded-xl" />
              <p className="text-[10px] text-muted-foreground mt-0.5">الوقت الفعلي للدخول/الخروج</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">السبب</label>
              <Textarea
                placeholder="اشرح سبب طلب التعديل..."
                value={form.reason}
                onChange={(e) => setForm((p) => ({ ...p, reason: e.target.value }))}
                rows={3}
                className="rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={submitCorrection} className="w-full rounded-xl">إرسال الطلب</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
