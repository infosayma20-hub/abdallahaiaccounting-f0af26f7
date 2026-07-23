import { useState, useMemo } from "react";
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
import { Plus, Upload, FileText, X, Check, XCircle } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { calculateLeaveBalance, calculateSickBalance } from "@/lib/hr-utils";
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

  // Calculate working days between dates (exclude Fridays)
  const calcWorkDays = (start: string, end: string) => {
    try {
      const days = eachDayOfInterval({ start: new Date(start), end: new Date(end) });
      return days.filter(d => getDay(d) !== 5).length; // Exclude Friday
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
  const usedAnnual = leaves
    .filter(l => (l.status === "approved" || l.status === "موافق عليها" || l.status === "موافقة" || l.status === "معتمدة") && l.leave_type === "سنوية" && new Date(l.start_date).getFullYear() === new Date().getFullYear())
    .reduce((s: number, l: any) => s + Number(l.days_count || 0), 0);
  const usedSick = leaves
    .filter(l => (l.status === "approved" || l.status === "موافق عليها" || l.status === "موافقة" || l.status === "معتمدة") && l.leave_type === "مرضية" && new Date(l.start_date).getFullYear() === new Date().getFullYear())
    .reduce((s: number, l: any) => s + Number(l.days_count || 0), 0);

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

  const handleSubmit = async () => {
    if (form.days_count <= 0) { toast.error("عدد الأيام يجب أن يكون أكبر من صفر"); return; }

    // Validation for annual leave
    if (form.leave_type === "سنوية" && form.days_count > leaveBalance.available) {
      toast.error(`رصيدك ${leaveBalance.available} يوم فقط. هل تريد تقديم إجازة بدون راتب؟`);
      return;
    }

    const { data: authData } = await supabase.auth.getUser();
    const reviewerId = authData?.user?.id || null;
    const nowIso = new Date().toISOString();
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
    } as any);

    if (error) toast.error("خطأ في الحفظ");
    else {
      toast.success(form.auto_approve ? "تم إضافة الإجازة واعتمادها ✅" : "تم تقديم طلب الإجازة");
      setShowForm(false);
      setForm({ leave_type: "سنوية", start_date: new Date().toISOString().split("T")[0], end_date: new Date().toISOString().split("T")[0], days_count: 1, notes: "", attachment_url: "", attachment_path: "", auto_approve: true });
      onRefresh();
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
            <p className="text-[10px] text-muted-foreground">مستخدم {usedAnnual}</p>
            <p className="text-xs font-bold text-primary">متاح {leaveBalance.available}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-[10px] text-muted-foreground">مرضية</p>
            <p className="text-lg font-bold text-foreground">{sickBalance.entitlement} يوم</p>
            <p className="text-[10px] text-muted-foreground">مستخدم {usedSick}</p>
            <p className="text-xs font-bold text-primary">متاح {sickBalance.available}</p>
          </CardContent>
        </Card>
      </div>

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
                {(l.status === "pending" || l.status === "معلقة") ? (
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-600" title="اعتماد" onClick={() => handleApprove(l.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" title="رفض" onClick={() => { setRejectingId(l.id); setRejectNote(""); }}>
                      <XCircle className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
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

            <div className="flex items-center gap-2 rounded-md border p-2 bg-muted/30">
              <Checkbox id="auto-approve" checked={form.auto_approve} onCheckedChange={(v) => setForm({ ...form, auto_approve: !!v })} />
              <Label htmlFor="auto-approve" className="text-xs cursor-pointer">
                اعتماد فوري (بدون الحاجة للذهاب لطلبات الموظفين)
              </Label>
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button onClick={handleSubmit}>{form.auto_approve ? "حفظ واعتماد" : "حفظ كطلب"}</Button>
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
    </div>
  );
}
