import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Send, Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import {
  HRMessageMeta, HRMessageType, PenaltyKind, encodeHRMessage,
  toRequestType, typeLabel, penaltyLabel,
} from "@/lib/hrMessages";

export interface SendTarget {
  employee_id: string;
  employee_name?: string;
  attendance_date?: string;
  default_subject?: string;
  default_body?: string;
  /** كتاب المدير المصدر (employee_forms.id) — لربط الإجراء بسجل المخالفة */
  source_form_id?: string | null;
  source_form_type?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authUserId: string;
  targets: SendTarget[];
  defaultType?: HRMessageType;
  // RBAC
  canIssuePenalty: boolean;
  onSent?: (count: number) => void;
}

const TYPE_OPTIONS: HRMessageType[] = [
  "info", "inquiry", "approval", "document_request", "warning", "penalty",
];

const PENALTY_OPTIONS: PenaltyKind[] = [
  "verbal_notice", "written_notice",
  "verbal_warning", "written_warning", "salary_deduction",
  "day_deduction", "suspension", "other",
];

export default function SendHRMessageDialog({
  open, onOpenChange, authUserId, targets, defaultType = "info",
  canIssuePenalty, onSent,
}: Props) {
  const [type, setType] = useState<HRMessageType>(defaultType);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [requiresResponse, setRequiresResponse] = useState(false);
  const [dueDate, setDueDate] = useState("");
  // Penalty fields
  const [penaltyKind, setPenaltyKind] = useState<PenaltyKind>("written_warning");
  const [violationDate, setViolationDate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [affectsPayroll, setAffectsPayroll] = useState(false);
  // Confirmation
  const [sending, setSending] = useState(false);
  const [confirmStep, setConfirmStep] = useState(false);
  // Issuer identity (branch manager / HR / admin) — stored inside the message meta
  const [issuer, setIssuer] = useState<{ name: string | null; role: string | null }>({ name: null, role: null });

  useEffect(() => {
    if (!open || !authUserId) return;
    let cancelled = false;
    (async () => {
      const [{ data: emp }, { data: roles }, { data: mgr }] = await Promise.all([
        supabase.from("employees").select("full_name").eq("auth_user_id", authUserId).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", authUserId),
        supabase.from("branch_manager_assignments").select("id").eq("user_id", authUserId).limit(1),
      ]);
      if (cancelled) return;
      const roleList = (roles || []).map((r: any) => r.role);
      const role = (mgr || []).length > 0
        ? "مدير فرع"
        : roleList.includes("admin") || roleList.includes("super_admin")
          ? "الإدارة"
          : roleList.includes("hr_manager")
            ? "الموارد البشرية"
            : null;
      setIssuer({ name: (emp as any)?.full_name || null, role });
    })();
    return () => { cancelled = true; };
  }, [open, authUserId]);

  useEffect(() => {
    if (!open) return;
    setType(defaultType);
    setSubject(targets[0]?.default_subject || "");
    setBody(targets[0]?.default_body || "");
    setRequiresResponse(false);
    setDueDate("");
    setPenaltyKind("written_warning");
    setViolationDate(targets[0]?.attendance_date || "");
    setEffectiveDate(new Date().toISOString().slice(0, 10));
    setAffectsPayroll(false);
    setConfirmStep(false);
  }, [open, defaultType, targets]);

  const isPenalty = type === "penalty" || type === "warning";

  const submit = async () => {
    if (!subject.trim()) { toast({ title: "الموضوع مطلوب", variant: "destructive" }); return; }
    if (!body.trim()) { toast({ title: "نص الرسالة مطلوب", variant: "destructive" }); return; }
    if (isPenalty) {
      if (!canIssuePenalty) {
        toast({ title: "غير مسموح", description: "صلاحية الإجراء العقابي لـ admin / hr_manager فقط", variant: "destructive" });
        return;
      }
      if (!violationDate) { toast({ title: "تاريخ المخالفة مطلوب", variant: "destructive" }); return; }
      if (!effectiveDate) { toast({ title: "تاريخ التنفيذ مطلوب", variant: "destructive" }); return; }
      if (!confirmStep) { setConfirmStep(true); return; }
    }
    if (targets.length === 0) return;
    setSending(true);
    let ok = 0, fail = 0, dup = 0;
    let lastError: string | null = null;

    // Resolve each employee's owner user_id so the record is visible to the
    // employee's portal (RLS filters on auth_user_id = auth.uid()).
    const empIds = Array.from(new Set(targets.map(t => t.employee_id)));
    const { data: empRows, error: empErr } = await supabase
      .from("employees")
      .select("id, auth_user_id")
      .in("id", empIds);
    if (empErr) {
      console.error("[SendHRMessageDialog] employees fetch error:", empErr);
      lastError = empErr.message;
    }
    const empOwnerMap = new Map<string, string>();
    // Use employees.auth_user_id (the employee's own auth uid) — NOT user_id
    // which is the workspace/data owner. RLS on correction_requests filters
    // employees by their own auth.uid(), so the wrong id makes messages
    // invisible to the employee in their portal.
    (empRows || []).forEach((e: any) => { if (e.auth_user_id) empOwnerMap.set(e.id, e.auth_user_id); });

    for (const t of targets) {
      const employeeOwnerUid = empOwnerMap.get(t.employee_id);
      if (!employeeOwnerUid) {
        fail++;
        lastError = lastError || `الموظف ${t.employee_name || t.employee_id.slice(0, 6)} لا يملك حساب دخول (auth_user_id) — لن يتمكن من رؤية الرسالة`;
        continue;
      }
      const meta: HRMessageMeta = {
        type,
        subject: subject.trim(),
        body: body.trim(),
        requires_response: requiresResponse,
        due_date: requiresResponse ? (dueDate || null) : null,
        related_attendance_date: t.attendance_date || null,
        issued_by_id: authUserId || null,
        issued_by_name: issuer.name,
        issued_by_role: issuer.role,
        source_form_id: t.source_form_id || null,
        source_form_type: t.source_form_type || null,
        ...(isPenalty ? {
          penalty_kind: penaltyKind,
          violation_date: violationDate || null,
          effective_date: effectiveDate || null,
          affects_payroll_flag: affectsPayroll,
        } : {}),
      };
      // Dedup: same employee + attendance_date + subject pending
      if (t.attendance_date) {
        const { data: existing } = await supabase
          .from("correction_requests")
          .select("id, reason")
          .eq("employee_id", t.employee_id)
          .eq("attendance_date", t.attendance_date)
          .eq("status", "pending")
          .eq("request_type", toRequestType(type));
        const isDup = (existing || []).some((x: any) => (x.reason || "").includes(`[${typeLabel(type)}] ${subject.trim()}`));
        if (isDup) { dup++; continue; }
      }
      const { error } = await supabase.from("correction_requests").insert({
        employee_id: t.employee_id,
        auth_user_id: employeeOwnerUid,
        attendance_date: t.attendance_date || new Date().toISOString().slice(0, 10),
        request_type: toRequestType(type),
        reason: encodeHRMessage(meta),
        status: "pending",
      });
      if (error) {
        console.error("[SendHRMessageDialog] insert error:", error);
        lastError = error.message || (error as any).details || (error as any).hint || "خطأ غير معروف";
        fail++;
      } else {
        ok++;
      }
    }
    setSending(false);
    const parts = [`تم إرسال ${ok}`];
    if (dup > 0) parts.push(`${dup} مكرر`);
    if (fail > 0) parts.push(`${fail} فشل`);
    toast({
      title: parts.join(" • "),
      description: fail > 0 && lastError ? `السبب: ${lastError}` : undefined,
      variant: fail > 0 && ok === 0 ? "destructive" : "default",
    });
    if (ok > 0) onSent?.(ok);
    if (fail === 0) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!sending) onOpenChange(o); }}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isPenalty ? <Shield className="h-5 w-5 text-red-600" /> : <Send className="h-5 w-5 text-primary" />}
            {isPenalty ? "إصدار إجراء عقابي" : "إرسال رسالة HR"}
            <Badge variant="outline" className="ml-2">{targets.length} موظف</Badge>
          </DialogTitle>
        </DialogHeader>

        {targets.length > 0 && (
          <div className="text-xs text-muted-foreground">
            المستلمون: {targets.slice(0, 5).map(t => t.employee_name || t.employee_id.slice(0, 6)).join("، ")}
            {targets.length > 5 && ` +${targets.length - 5}`}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <Label>نوع الرسالة</Label>
            <Select value={type} onValueChange={(v) => setType(v as HRMessageType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map(t => (
                  <SelectItem
                    key={t}
                    value={t}
                    disabled={(t === "penalty" || t === "warning") && !canIssuePenalty}
                  >
                    {typeLabel(t)}
                    {(t === "penalty" || t === "warning") && !canIssuePenalty && " (admin/hr_manager فقط)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>الموضوع *</Label>
            <Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="مثال: تأخير متكرر" maxLength={200} />
          </div>

          <div>
            <Label>نص الرسالة *</Label>
            <Textarea rows={4} value={body} onChange={e => setBody(e.target.value)} placeholder="اكتب التفاصيل الكاملة..." maxLength={2000} />
          </div>

          {isPenalty && (
            <div className="rounded-lg border-2 border-red-200 bg-red-50/50 p-4 space-y-3">
              <div className="flex items-center gap-2 text-red-700 font-medium text-sm">
                <AlertTriangle className="h-4 w-4" />
                تفاصيل الإجراء العقابي
              </div>
              <div>
                <Label>نوع الإجراء *</Label>
                <Select value={penaltyKind} onValueChange={(v) => setPenaltyKind(v as PenaltyKind)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PENALTY_OPTIONS.map(p => <SelectItem key={p} value={p}>{penaltyLabel(p)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>تاريخ المخالفة *</Label>
                  <Input type="date" value={violationDate} onChange={e => setViolationDate(e.target.value)} />
                </div>
                <div>
                  <Label>تاريخ التنفيذ *</Label>
                  <Input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs">يؤثر مالياً (flag فقط، بدون خصم تلقائي)</Label>
                  <p className="text-xs text-muted-foreground">للمراجعة اليدوية في الراتب</p>
                </div>
                <Switch checked={affectsPayroll} onCheckedChange={setAffectsPayroll} />
              </div>
            </div>
          )}

          <div className="flex items-center justify-between rounded-md border p-3">
            <Label className="text-sm">يحتاج رد من الموظف</Label>
            <Switch checked={requiresResponse} onCheckedChange={setRequiresResponse} />
          </div>
          {requiresResponse && (
            <div>
              <Label>تاريخ انتهاء الرد (اختياري)</Label>
              <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
            </div>
          )}

          {confirmStep && isPenalty && (
            <div className="rounded-lg bg-red-100 border border-red-300 p-3 text-sm text-red-800">
              ⚠ هل أنت متأكد من إصدار هذا الإجراء العقابي على {targets.length} موظف؟
              لا يمكن تعديله أو حذفه إلا من admin مع تسجيل audit.
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>إلغاء</Button>
          <Button
            onClick={submit}
            disabled={sending}
            className={isPenalty ? "bg-red-600 hover:bg-red-700" : ""}
          >
            {sending ? "جاري الإرسال..." : confirmStep ? "تأكيد الإصدار" : isPenalty ? "متابعة الإصدار" : "إرسال"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}