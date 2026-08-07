import { useState, useMemo, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, Upload, FileText, X, Check, XCircle, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { calculateLeaveBalance, calculateSickBalance, getAnnualLeaveProbation } from "@/lib/hr-utils";
import { fetchConfirmedReversals, netUsedDays, emptyBucket, type ReversalBucket } from "@/lib/hr/leaveReversals";
import LeaveConflictsCard from "./LeaveConflictsCard";
import { differenceInBusinessDays, eachDayOfInterval, getDay } from "date-fns";

const LEAVE_TYPES = [
  { v: "سنوية", l: "🏖️ سنوية" },
  { v: "مرضية", l: "🤒 مرضية" },
  { v: "طارئة", l: "🚨 طارئة" },
  { v: "بدون راتب", l: "⏸️ بدون راتب" },
  { v: "أمومة", l: "🤱 أمومة (70 يوم)" },
  { v: "أبوة", l: "👨‍🍼 أبوة" },
];

interface Props {
  employeeId: string;
  userId: string;
  employee: any;
  leaves: any[];
  onRefresh: () => void;
}

export default function EmployeeLeavesTab({ employeeId, userId, employee, leaves, onRefresh }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [editing, setEditing] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ start_date: "", end_date: "", days_count: 1, notes: "" });
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // أيام الاسترجاع المؤكدة (تُطرح من المستخدم قبل احتساب الرصيد)
  const [reversed, setReversed] = useState<ReversalBucket>(emptyBucket());
  const [reloadKey, setReloadKey] = useState(0);
  // استثناء الرصيد غير الكافي
  const [exception, setException] = useState<{ shortfall: number; reason: string } | null>(null);
  // Attendance conflict: dates in the selected range where the employee actually checked in.
  const [attendanceConflicts, setAttendanceConflicts] = useState<string[]>([]);
  const [form, setForm] = useState({
    leave_type: "سنوية",
    start_date: new Date().toISOString().split("T")[0],
    end_date: new Date().toISOString().split("T")[0],
    days_count: 1,
    notes: "",
    attachment_url: "" as string,
    attachment_path: "" as string,
    auto_approve: true,
  });

  // تحميل مجموع أيام الاسترجاع المؤكدة لهذا الموظف في السنة الحالية
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const map = await fetchConfirmedReversals({ employeeIds: [employeeId] });
      if (!cancelled) setReversed(map.get(employeeId) || emptyBucket());
    })();
    return () => { cancelled = true; };
  }, [employeeId, reloadKey]);

  // Detect attendance on the selected date range (worked-days warning)
  useEffect(() => {
    if (!showForm || !form.start_date || !form.end_date) { setAttendanceConflicts([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("attendance_days")
        .select("attendance_date, first_check_in")
        .eq("employee_id", employeeId)
        .gte("attendance_date", form.start_date)
        .lte("attendance_date", form.end_date);
      if (cancelled) return;
      const dates = (data || [])
        .filter((r: any) => !!r.first_check_in)
        .map((r: any) => r.attendance_date as string);
      setAttendanceConflicts(dates);
    })();
    return () => { cancelled = true; };
  }, [showForm, form.start_date, form.end_date, employeeId]);

  // Calculate working days between dates (exclude Fridays)
  // ملاحظة: إذا كانت كل الأيام المختارة جُمَع (مثلاً إجازة يوم جمعة فقط)
  // نرجّع عدد الأيام الفعلي حتى لا يصير 0 ويُرفض الطلب.
  const calcWorkDays = (start: string, end: string) => {
    try {
      const days = eachDayOfInterval({ start: new Date(start), end: new Date(end) });
      const workDays = days.filter(d => getDay(d) !== 5).length; // Exclude Friday
      return workDays > 0 ? workDays : days.length;
    } catch { return 1; }
  };

  // Auto-calculate days when dates change
  const handleDateChange = (field: "start_date" | "end_date", value: string) => {
    const newForm = { ...form, [field]: value };
    const days = calcWorkDays(
      field === "start_date" ? value : form.start_date,
      field === "end_date" ? value : form.end_date
    );
    newForm.days_count = days;
    setForm(newForm);
  };

  // Leave balance
  const fullSickEntitlement = employee?.sick_leave_days || 14;
  const rawUsedAnnual = leaves
    .filter(l => (l.status === "approved" || l.status === "موافق عليها" || l.status === "موافقة" || l.status === "معتمدة") && l.leave_type === "سنوية" && new Date(l.start_date).getFullYear() === new Date().getFullYear())
    .reduce((s: number, l: any) => s + Number(l.days_count || 0), 0);
  const rawUsedSick = leaves
    .filter(l => (l.status === "approved" || l.status === "موافق عليها" || l.status === "موافقة" || l.status === "معتمدة") && l.leave_type === "مرضية" && new Date(l.start_date).getFullYear() === new Date().getFullYear())
    .reduce((s: number, l: any) => s + Number(l.days_count || 0), 0);
  // صافي المستخدم = المعتمد − المسترجَع المؤكد (أيام داوم فيها الموظف فعلياً)
  const usedAnnual = netUsedDays(rawUsedAnnual, reversed.annual);
  const usedSick = netUsedDays(rawUsedSick, reversed.sick);

  const leaveBalance = calculateLeaveBalance(
    employee?.start_date || "2024-01-01",
    Number(employee?.previous_year_balance || 0),
    usedAnnual
  );
  const sickBalance = calculateSickBalance(
    employee?.start_date || "2024-01-01",
    usedSick,
    fullSickEntitlement,
  );

  const handleSubmit = async (opts?: { exceptionReason?: string; shortfall?: number }) => {
    if (form.days_count <= 0) { toast.error("عدد الأيام يجب أن يكون أكبر من صفر"); return; }

    // فترة التجربة: لا إجازة سنوية قبل إتمام 3 أشهر
    if (form.leave_type === "سنوية") {
      const prob = getAnnualLeaveProbation(employee?.start_date);
      if (!prob.eligible) {
        toast.error(`لا يمكن اعتماد إجازة سنوية قبل إتمام 3 أشهر من المباشرة (متبقي ${prob.daysRemaining} يوم — الأهلية من ${prob.eligibleFrom})`);
        return;
      }
    }

    // الرصيد غير كافٍ → لا نمنع الموارد البشرية، بل نطلب استثناءً موثّقاً
    if (form.leave_type === "سنوية" && form.days_count > leaveBalance.available && !opts?.exceptionReason) {
      setException({
        shortfall: +(form.days_count - leaveBalance.available).toFixed(2),
        reason: "",
      });
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const reviewerId = authData?.user?.id || null;
    const nowIso = new Date().toISOString();
    const isException = !!opts?.exceptionReason;
    const { error } = await supabase.from("employee_leaves").insert({
      employee_id: employeeId,
      user_id: userId,
      leave_type: form.leave_type,
      start_date: form.start_date,
      end_date: form.end_date,
      days_count: form.days_count,
      notes: form.notes,
      status: form.auto_approve ? "approved" : "pending",
      reviewed_at: form.auto_approve ? nowIso : null,
      reviewed_by: form.auto_approve ? reviewerId : null,
      review_notes: form.auto_approve ? "اعتماد مباشر من الموارد البشرية" : null,
      attachment_url: form.attachment_url || null,
      attachment_path: form.attachment_path || null,
      balance_exception: isException,
      balance_exception_reason: opts?.exceptionReason || null,
      balance_exception_by: isException ? reviewerId : null,
      balance_exception_at: isException ? nowIso : null,
      balance_shortfall_days: isException ? opts?.shortfall ?? null : null,
    } as any);

    if (error) toast.error("خطأ في الحفظ");
    else {
      if (isException) {
        // إشعار إداري بالاستثناء (رصيد غير كافٍ)
        await supabase.from("admin_notifications").insert({
          event_type: "leave_balance_exception",
          user_id: userId,
          user_email: employee?.full_name || "employee",
          user_name: employee?.full_name || null,
          metadata: {
            employee_id: employeeId,
            employee_name: employee?.full_name || null,
            leave_type: form.leave_type,
            start_date: form.start_date,
            end_date: form.end_date,
            days_count: form.days_count,
            shortfall_days: opts?.shortfall ?? null,
            reason: opts?.exceptionReason,
          },
        } as any).then(() => {}, () => {});
      }
      toast.success(
        isException
          ? "تم اعتماد الإجازة كاستثناء رغم عدم كفاية الرصيد ⚠️ وتم إشعار الإدارة"
          : form.auto_approve ? "تم إضافة الإجازة واعتمادها ✅" : "تم تقديم طلب الإجازة",
      );
      setShowForm(false);
      setException(null);
      setForm({ leave_type: "سنوية", start_date: new Date().toISOString().split("T")[0], end_date: new Date().toISOString().split("T")[0], days_count: 1, notes: "", attachment_url: "", attachment_path: "", auto_approve: true });
      onRefresh();
      setReloadKey(k => k + 1);
    }
  };

  const handleApprove = async (id: string) => {
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.from("employee_leaves").update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: authData?.user?.id || null,
    }).eq("id", id);
    if (error) toast.error("تعذر الاعتماد: " + error.message);
    else { toast.success("تم الاعتماد ✅"); onRefresh(); }
  };

  const handleReject = async () => {
    if (!rejectingId) return;
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.from("employee_leaves").update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: authData?.user?.id || null,
      review_notes: rejectNote || null,
    }).eq("id", rejectingId);
    if (error) toast.error("تعذر الرفض: " + error.message);
    else {
      toast.success("تم الرفض");
      setRejectingId(null); setRejectNote("");
      onRefresh();
    }
  };

  const openEdit = (l: any) => {
    setEditing(l);
    setEditForm({
      start_date: l.start_date,
      end_date: l.end_date,
      days_count: Number(l.days_count || 1),
      notes: l.notes || "",
    });
  };

  const handleEditDateChange = (field: "start_date" | "end_date", value: string) => {
    const next = { ...editForm, [field]: value };
    next.days_count = calcWorkDays(
      field === "start_date" ? value : editForm.start_date,
      field === "end_date" ? value : editForm.end_date,
    );
    setEditForm(next);
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    if (editForm.days_count <= 0) { toast.error("عدد الأيام يجب أن يكون أكبر من صفر"); return; }
    if (new Date(editForm.end_date) < new Date(editForm.start_date)) { toast.error("تاريخ النهاية قبل البداية"); return; }
    const { error } = await supabase.from("employee_leaves").update({
      start_date: editForm.start_date,
      end_date: editForm.end_date,
      days_count: editForm.days_count,
      notes: editForm.notes || null,
    }).eq("id", editing.id);
    if (error) { toast.error("تعذر التعديل: " + error.message); return; }
    toast.success("تم تعديل الإجازة ✅");
    setEditing(null);
    onRefresh();
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const { error } = await supabase.from("employee_leaves").delete().eq("id", deletingId);
    if (error) { toast.error("تعذر الحذف: " + error.message); return; }
    toast.success("تم حذف الإجازة");
    setDeletingId(null);
    onRefresh();
  };

  const handleUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { toast.error("الحد الأقصى 10 ميجا"); return; }
    setUploading(true);
    const { data: authData } = await supabase.auth.getUser();
    const authUid = authData?.user?.id;
    if (!authUid) { setUploading(false); toast.error("جلسة غير صالحة"); return; }
    const ext = (file.name.split(".").pop() || "bin").toLowerCase();
    const rid = (typeof crypto !== "undefined" && "randomUUID" in crypto) ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    const path = `${authUid}/${Date.now()}-${rid}.${ext}`;
    const { error } = await supabase.storage.from("employee-forms").upload(path, file, { contentType: file.type, upsert: false });
    if (error) { setUploading(false); toast.error("خطأ في الرفع: " + error.message); return; }
    const { data: signed, error: signErr } = await supabase.storage.from("employee-forms").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
    setUploading(false);
    if (signErr || !signed?.signedUrl) { toast.error("تعذر إنشاء رابط الملف"); return; }
    setForm(f => ({ ...f, attachment_url: signed.signedUrl, attachment_path: path }));
    toast.success("تم رفع التقرير ✅");
  };

  const handleRemoveAttachment = async () => {
    if (form.attachment_path) {
      await supabase.storage.from("employee-forms").remove([form.attachment_path]).catch(() => {});
    }
    setForm(f => ({ ...f, attachment_url: "", attachment_path: "" }));
  };

  const statusBadge = (status: string) => {
    if (status === "موافق عليها" || status === "موافقة" || status === "معتمدة") return <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">معتمدة</Badge>;
    if (status === "معلقة" || status === "pending") return <Badge className="text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">{status}</Badge>;
    if (status === "مرفوضة" || status === "rejected") return <Badge variant="destructive" className="text-[10px]">{status}</Badge>;
    return <Badge variant="secondary" className="text-[10px]">{status}</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-medium text-foreground">الإجازات</h3>
        <Button size="sm" onClick={() => setShowForm(true)} className="gap-1"><Plus className="h-3 w-3" /> طلب إجازة</Button>
      </div>

      {/* Balance Display — السنوي والمرضي منفصلان (رصيدان مستقلان بقواعد مختلفة).
          أُزيلت بطاقة "الإجمالي" لأنها كانت تجمع نوعين مختلفين فتوحي بمضاعفة الرصيد. */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">سنوية</p>
            <p className="text-lg font-bold text-foreground">{leaveBalance.entitlement} يوم</p>
            <p className="text-[10px] text-muted-foreground">
              مستخدم {usedAnnual}
              {reversed.annual > 0 && <span className="text-emerald-600"> (مسترجَع {reversed.annual})</span>}
            </p>
            <p className={`text-xs font-bold ${leaveBalance.available < 0 ? "text-destructive" : "text-primary"}`}>
              متاح {leaveBalance.available}{leaveBalance.available < 0 ? " (سحب زائد)" : ""}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">مرضية</p>
            <p className="text-lg font-bold text-foreground">{sickBalance.entitlement} يوم</p>
            <p className="text-[10px] text-muted-foreground">
              مستخدم {usedSick}
              {reversed.sick > 0 && <span className="text-emerald-600"> (مسترجَع {reversed.sick})</span>}
            </p>
            <p className={`text-xs font-bold ${sickBalance.available < 0 ? "text-destructive" : "text-primary"}`}>
              متاح {sickBalance.available}{sickBalance.available < 0 ? " (سحب زائد)" : ""}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* تعارض إجازة مع دوام — مراجعة الموارد البشرية */}
      <LeaveConflictsCard
        employeeId={employeeId}
        onChanged={() => { setReloadKey(k => k + 1); onRefresh(); }}
      />

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-right">الحالة</TableHead>
            <TableHead className="text-right">النوع</TableHead>
            <TableHead className="text-right">من</TableHead>
            <TableHead className="text-right">إلى</TableHead>
            <TableHead className="text-right">الأيام</TableHead>
            <TableHead className="text-right">السبب</TableHead>
            <TableHead className="text-right">إجراءات</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leaves.map(l => (
            <TableRow key={l.id}>
              <TableCell>{statusBadge(l.status)}</TableCell>
              <TableCell className="text-xs">{l.leave_type}</TableCell>
              <TableCell className="text-xs">{l.start_date}</TableCell>
              <TableCell className="text-xs">{l.end_date}</TableCell>
              <TableCell className="text-xs font-medium">{l.days_count}</TableCell>
              <TableCell className="text-xs truncate max-w-[150px]">
                <div className="flex items-center gap-2">
                  <span className="truncate">{l.notes || "—"}</span>
                  {l.attachment_url && (
                    <a href={l.attachment_url} target="_blank" rel="noreferrer" className="text-primary shrink-0" title="تقرير طبي">
                      <FileText className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-xs">
                <div className="flex items-center gap-1">
                  {(l.status === "pending" || l.status === "معلقة") && (
                    <>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-600" title="اعتماد" onClick={() => handleApprove(l.id)}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="رفض" onClick={() => { setRejectingId(l.id); setRejectNote(""); }}>
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="تعديل التواريخ" onClick={() => openEdit(l)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="حذف الإجازة" onClick={() => setDeletingId(l.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {leaves.length === 0 && (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground">لا توجد إجازات</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      {/* Leave Request Form */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>طلب إجازة</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>نوع الإجازة *</Label>
              <Select value={form.leave_type} onValueChange={v => setForm({ ...form, leave_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPES.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>من تاريخ *</Label>
              <Input type="date" value={form.start_date} onChange={e => handleDateChange("start_date", e.target.value)} />
            </div>
            <div>
              <Label>إلى تاريخ *</Label>
              <Input type="date" value={form.end_date} onChange={e => handleDateChange("end_date", e.target.value)} />
            </div>
            <div>
              <Label>عدد الأيام (محسوب تلقائياً)</Label>
              <Input type="number" value={form.days_count} readOnly className="bg-muted/30" />
              <p className="text-[10px] text-muted-foreground mt-1">يستثني أيام الجمعة</p>
            </div>
            <div>
              <Label>سبب الإجازة</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>

            {form.leave_type === "مرضية" && (
              <div>
                <Label>تقرير طبي <span className="text-[10px] text-muted-foreground">(اختياري — صورة أو PDF)</span></Label>
                {form.attachment_url ? (
                  <div className="flex items-center justify-between rounded-md border p-2 mt-1">
                    <a href={form.attachment_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <FileText className="h-4 w-4" /> عرض التقرير المرفق
                    </a>
                    <Button type="button" size="sm" variant="ghost" onClick={handleRemoveAttachment}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <label className="mt-1 flex flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed p-3 cursor-pointer hover:bg-muted/40">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {uploading ? "جاري الرفع..." : "اضغط لإرفاق التقرير الطبي"}
                    </span>
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      disabled={uploading}
                      onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }}
                    />
                  </label>
                )}
              </div>
            )}

            {form.leave_type === "سنوية" && form.days_count > leaveBalance.available && (
              <p className="text-xs text-destructive">⚠️ رصيدك {leaveBalance.available} يوم فقط</p>
            )}
            {form.leave_type === "بدون راتب" && (
              <p className="text-xs text-amber-600">⚠️ سيتم خصم أيام الإجازة من الراتب تلقائياً</p>
            )}

            {attendanceConflicts.length > 0 && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2">
                <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
                  <div className="font-semibold">تنبيه: الموظف مداوم في هذه الأيام حسب البصمة</div>
                  <div className="mt-0.5">{attendanceConflicts.join("، ")}</div>
                  <div className="mt-0.5 text-amber-700 dark:text-amber-400">يمكنك المتابعة إذا كنت متأكداً — تحقق قبل الاعتماد.</div>
                </div>
              </div>
            )}

            <div className="flex items-center gap-2 rounded-md border p-2 bg-muted/30">
              <Checkbox id="auto-approve" checked={form.auto_approve} onCheckedChange={(v) => setForm({ ...form, auto_approve: !!v })} />
              <Label htmlFor="auto-approve" className="text-xs cursor-pointer">
                اعتماد فوري (بدون الحاجة للذهاب لطلبات الموظفين)
              </Label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button onClick={() => handleSubmit()}>{form.auto_approve ? "حفظ واعتماد" : "حفظ كطلب"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* استثناء الرصيد غير الكافي — موافقة الموارد البشرية مع توثيق وإشعار */}
      <Dialog open={!!exception} onOpenChange={(o) => !o && setException(null)}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-right flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-4 w-4" /> الرصيد غير كافٍ — استثناء الموارد البشرية
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs space-y-1">
              <div>الرصيد المتاح: <span className="font-bold tabular-nums">{leaveBalance.available}</span> يوم</div>
              <div>الأيام المطلوبة: <span className="font-bold tabular-nums">{form.days_count}</span> يوم</div>
              <div className="text-destructive">
                العجز: <span className="font-bold tabular-nums">{exception?.shortfall}</span> يوم (سيُسجَّل رصيداً بالسالب)
              </div>
            </div>
            <div>
              <Label className="text-xs">سبب الاستثناء (إلزامي)</Label>
              <Textarea
                rows={3}
                value={exception?.reason || ""}
                onChange={(e) => setException(x => x ? { ...x, reason: e.target.value } : x)}
                placeholder="مثال: ظرف عائلي طارئ — موافقة الإدارة على الخصم من رصيد السنة القادمة"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setException(null)}>إلغاء</Button>
            <Button
              disabled={!exception?.reason.trim()}
              onClick={() => handleSubmit({ exceptionReason: exception!.reason.trim(), shortfall: exception!.shortfall })}
            >
              اعتماد كاستثناء
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={!!rejectingId} onOpenChange={(o) => { if (!o) { setRejectingId(null); setRejectNote(""); } }}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>سبب الرفض</DialogTitle></DialogHeader>
          <Textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} placeholder="اكتب سبب الرفض (اختياري)" rows={3} />
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => { setRejectingId(null); setRejectNote(""); }}>إلغاء</Button>
            <Button variant="destructive" onClick={handleReject}>تأكيد الرفض</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) setEditing(null); }}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تعديل الإجازة ({editing?.leave_type})</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>من تاريخ *</Label>
              <Input type="date" value={editForm.start_date} onChange={e => handleEditDateChange("start_date", e.target.value)} />
            </div>
            <div>
              <Label>إلى تاريخ *</Label>
              <Input type="date" value={editForm.end_date} onChange={e => handleEditDateChange("end_date", e.target.value)} />
            </div>
            <div>
              <Label>عدد الأيام</Label>
              <Input type="number" value={editForm.days_count} onChange={e => setEditForm({ ...editForm, days_count: Number(e.target.value) || 0 })} />
              <p className="text-[10px] text-muted-foreground mt-1">محسوب تلقائياً باستثناء الجمعة — يمكن تعديله يدوياً</p>
            </div>
            <div>
              <Label>ملاحظات</Label>
              <Input value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setEditing(null)}>إلغاء</Button>
            <Button onClick={handleSaveEdit}>حفظ التعديلات</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <Dialog open={!!deletingId} onOpenChange={(o) => { if (!o) setDeletingId(null); }}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>تأكيد حذف الإجازة</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            سيتم حذف الإجازة نهائياً وإرجاع الأيام إلى الرصيد. هل تريد المتابعة؟
          </p>
          <div className="flex justify-end gap-2 mt-3">
            <Button variant="outline" onClick={() => setDeletingId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete}>حذف</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
