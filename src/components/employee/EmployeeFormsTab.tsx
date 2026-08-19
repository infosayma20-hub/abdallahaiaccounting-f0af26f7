import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import BuiltinFormsViewerSection from "@/components/employee/BuiltinFormsViewerSection";
import { INVENTORY_BALANCE_ITEMS } from "@/lib/hr/inventoryBalanceItems";
import {
  Palmtree, Banknote, HandCoins, UserCog, Award, FileText,
  Scale, Clock, Gavel, MessageSquare, Shield, Wrench, AlertTriangle,
  Package, Send, ChevronLeft, Upload, CheckCircle2, XCircle, Loader2, Eye,
  PenLine, Timer
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { validateEmployeeForm, diffDaysInclusive, diffHours } from "@/lib/employeeFormValidators";
import { evaluateLoanEligibility, eligibilityBadgeClass, formatCurrency } from "@/lib/employeeFinancialDisplay";
import { openEmployeeFormsStorageFile } from "@/lib/employeeStorageFiles";
import { useIsMobile } from "@/hooks/use-mobile";
import { X } from "lucide-react";
import EmployeeAssignedTemplates from "@/components/employee/EmployeeAssignedTemplates";
import { LeaveDateField } from "@/components/employee/LeaveDateField";
import { useLeaveBlackoutDates } from "@/hooks/hr/useLeaveBlackoutDates";
import { useAdvanceLimit } from "@/hooks/hr/useAdvanceLimit";
import { findBlackout, findBlackoutInRange } from "@/lib/hr/leaveBlackout";

interface Props {
  employeeId: string;
  userId: string;
  isManager: boolean;
  isHrManager: boolean;
  onRefresh: () => void;
  initialFormId?: string | null;
  onInitialFormConsumed?: () => void;
  jobTitle?: string | null;
  jobTitleName?: string | null;
}

type FormCard = {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
  type: "form" | "policy";
  managerOnly?: boolean;
};

// === Forms available to ALL employees ===
const employeeForms: FormCard[] = [
  { id: "leave_request", label: "طلب إجازة", icon: Palmtree, color: "text-emerald-500", type: "form" },
  { id: "advance_request", label: "طلب سلفة", icon: Banknote, color: "text-warning", type: "form" },
  { id: "loan_request", label: "التقدم بطلب قرض حسن", icon: HandCoins, color: "text-blue-500", type: "form" },
  { id: "correction_request", label: "تصحيح بصمة", icon: PenLine, color: "text-orange-500", type: "form" },
  { id: "hr_message", label: "رسالة لـ HR", icon: MessageSquare, color: "text-purple-400", type: "form" },
  { id: "employee_info", label: "تعبئة معلومات الموظف", icon: UserCog, color: "text-purple-500", type: "form" },
  { id: "complaints", label: "تقديم شكاوى وملاحظات واقتراحات", icon: MessageSquare, color: "text-orange-500", type: "form" },
  { id: "employee_voice", label: "صوت الموظف", icon: MessageSquare, color: "text-teal-500", type: "form" },
  { id: "facility_quality", label: "جودة المرافق والمعدات", icon: Wrench, color: "text-cyan-500", type: "form" },
];

// === Policy documents for ALL employees ===
const policyCards: FormCard[] = [
  { id: "incentive_policy", label: "نظام التحفيز", icon: Award, color: "text-amber-500", type: "policy" },
  { id: "loan_policy", label: "سياسة القرض الحسن", icon: Scale, color: "text-blue-400", type: "policy" },
  { id: "late_policy", label: "سياسة التأخر عن الدوام", icon: Clock, color: "text-red-400", type: "policy" },
  { id: "disciplinary_policy", label: "لائحة الجزاءات التأديبية", icon: Gavel, color: "text-gray-500", type: "policy" },
  { id: "admin_decisions", label: "قرارات إدارية وتشجيعية لتحسين بيئة العمل", icon: Shield, color: "text-teal-500", type: "policy" },
];

// === Manager-only forms ===
const managerForms: FormCard[] = [
  { id: "overtime_request", label: "طلب أوفرتايم", icon: Timer, color: "text-blue-400", type: "form", managerOnly: true },
  { id: "disciplinary_action", label: "طلب إجراء عقابي", icon: Gavel, color: "text-red-500", type: "form", managerOnly: true },
  { id: "equipment_fault", label: "نموذج الإبلاغ عن أعطال المعدات والمرافق", icon: AlertTriangle, color: "text-orange-600", type: "form", managerOnly: true },
  { id: "inventory_balance", label: "رصيد الأصناف", icon: Package, color: "text-indigo-500", type: "form", managerOnly: true },
];

const statusLabel = (s: string) => {
  switch (s) {
    case "pending": return { text: "قيد المراجعة", emoji: "🟡", variant: "outline" as const };
    case "approved": return { text: "تمت الموافقة", emoji: "✅", variant: "default" as const };
    case "rejected": return { text: "مرفوض", emoji: "❌", variant: "destructive" as const };
    default: return { text: s, emoji: "⏳", variant: "outline" as const };
  }
};

export default function EmployeeFormsTab({
  employeeId, userId, isManager, isHrManager, onRefresh,
  initialFormId, onInitialFormConsumed, jobTitle, jobTitleName,
}: Props) {
  const isMobile = useIsMobile();
  const [activeForm, setActiveForm] = useState<string | null>(null);
  const [activePolicy, setActivePolicy] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [policies, setPolicies] = useState<any[]>([]);
  const [showPolicies, setShowPolicies] = useState(true);
  const [showLoanForm, setShowLoanForm] = useState(true);
  const [allowAdvance, setAllowAdvance] = useState(true);
  const [allowLeave, setAllowLeave] = useState(true);
  const [advanceClosedMsg, setAdvanceClosedMsg] = useState<string>("");
  const [leaveClosedMsg, setLeaveClosedMsg] = useState<string>("");
  // الأيام/الفترات التي حظرتها الموارد البشرية لطلبات الإجازة.
  const { ranges: leaveBlackouts } = useLeaveBlackoutDates();
  const { effectiveMax: advanceMax } = useAdvanceLimit(employeeId);
  // Tenant overrides for built-in forms (label / order / enabled / closed message).
  // Fails soft: empty map ⇒ behavior identical to before.
  const [builtinOverrides, setBuiltinOverrides] = useState<
    Map<string, { label_override: string | null; is_enabled: boolean; closed_message: string | null; sort_order: number }>
  >(new Map());
  const [employeeProfile, setEmployeeProfile] = useState<any | null>(null);
  // نماذج مدمجة (مخصصة للمدراء) مُسندة يدوياً لهذا الموظف من شاشة إسناد النماذج.
  const [grantedBuiltins, setGrantedBuiltins] = useState<Set<string>>(new Set());
  // نماذج مدمجة مُسندة لهذا الموظف «للاطلاع فقط» على تعبئة الآخرين.
  const [viewBuiltins, setViewBuiltins] = useState<string[]>([]);
  const [branchOptions, setBranchOptions] = useState<{ id: string; name: string }[]>([]);
  const [deptOptions, setDeptOptions] = useState<{ id: string; name: string }[]>([]);

  // Form state
  const [formData, setFormData] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchSubmissions();
    fetchPolicies();
    fetchOwnerSettings();
    fetchEmployeeProfile();
    fetchBranchesAndDepartments();
    fetchBuiltinAssignments();
  }, [employeeId]);

  // Keep intake toggles (hr_allow_advance_requests / hr_allow_leave_requests / closed messages)
  // in sync with what HR set — without requiring the employee to refresh.
  // 1) Realtime subscription on the owner's company_settings row.
  // 2) Refetch when the tab/window regains focus (mobile PWA safety net).
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      const { data: ownerData } = await supabase.rpc("get_team_owner_id");
      const ownerId = (ownerData as string) || userId;
      if (cancelled || !ownerId) return;
      channel = supabase
        .channel(`emp-forms-settings-${ownerId}`)
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "company_settings", filter: `user_id=eq.${ownerId}` },
          () => { fetchOwnerSettings(); }
        )
        .subscribe();
    })();
    const onFocus = () => { fetchOwnerSettings(); };
    const onVisibility = () => { if (document.visibilityState === "visible") fetchOwnerSettings(); };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [employeeId, userId]);

  // Auto-open requested form (e.g. when user taps "تحديث معلوماتي" from profile)
  useEffect(() => {
    if (initialFormId) {
      setActiveForm(initialFormId);
      onInitialFormConsumed?.();
    }
  }, [initialFormId]);

  const fetchOwnerSettings = async () => {
    // Get team owner id for this employee
    const { data: ownerData } = await supabase.rpc("get_team_owner_id");
    const ownerId = ownerData || userId;
    const { data } = await supabase
      .from("company_settings")
      .select("hr_show_policies, hr_show_loan_form, hr_allow_advance_requests, hr_allow_leave_requests, hr_advance_requests_closed_message, hr_leave_requests_closed_message")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (data) {
      setShowPolicies(data.hr_show_policies !== false);
      setShowLoanForm(data.hr_show_loan_form !== false);
      setAllowAdvance((data as any).hr_allow_advance_requests !== false);
      setAllowLeave((data as any).hr_allow_leave_requests !== false);
      setAdvanceClosedMsg(((data as any).hr_advance_requests_closed_message ?? "") as string);
      setLeaveClosedMsg(((data as any).hr_leave_requests_closed_message ?? "") as string);
    }
    try {
      const { data: bfs } = await (supabase as any)
        .from("builtin_form_settings")
        .select("form_key, label_override, is_enabled, closed_message, sort_order")
        .eq("user_id", ownerId);
      const m = new Map<string, any>();
      (bfs || []).forEach((r: any) => m.set(r.form_key, r));
      setBuiltinOverrides(m);
    } catch {
      /* keep defaults */
    }
  };

  const fetchSubmissions = async () => {
    const { data } = await supabase
      .from("employee_forms")
      .select("*")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false })
      .limit(50);
    setSubmissions(data || []);
  };

  /**
   * النماذج المدمجة المخصّصة للمدراء يمكن إسنادها فردياً لأي موظف
   * من شاشة «إسناد النماذج» (جدول builtin_form_assignments).
   */
  const fetchBuiltinAssignments = async () => {
    const { data } = await (supabase as any)
      .from("builtin_form_assignments")
      .select("form_key, access_level")
      .eq("employee_id", employeeId)
      .eq("is_active", true);
    const rows = (data || []) as any[];
    setGrantedBuiltins(new Set(rows.filter((r) => (r.access_level ?? "fill") === "fill").map((r) => r.form_key)));
    setViewBuiltins(rows.filter((r) => r.access_level === "view").map((r) => r.form_key));
  };

  const fetchPolicies = async () => {
    const { data } = await supabase
      .from("employee_policy_documents")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false });
    setPolicies(data || []);
  };

  const fetchEmployeeProfile = async () => {
    const { data } = await supabase
      .from("employees")
      .select("id, full_name, branch_id, department_id, base_salary, start_date")
      .eq("id", employeeId)
      .maybeSingle();
    if (!data) return;
    let branchName = "";
    if (data.branch_id) {
      const { data: br } = await supabase
        .from("branches_safe")
        .select("name")
        .eq("id", data.branch_id)
        .maybeSingle();
      branchName = br?.name || "";
    }
    setEmployeeProfile({ ...data, branch_name: branchName });
  };

  const fetchBranchesAndDepartments = async () => {
    try {
      const { data: ownerData } = await supabase.rpc("get_team_owner_id");
      const ownerId = ownerData || userId;
      const [{ data: br }, { data: dp }] = await Promise.all([
        supabase.from("branches_safe").select("id, name").eq("user_id", ownerId).eq("is_active", true).order("name"),
        supabase.from("departments").select("id, name_ar, name").eq("user_id", ownerId).eq("is_active", true).eq("is_deleted", false).order("name_ar"),
      ]);
      setBranchOptions(
        (br || [])
          .filter((b: any) => (b.name || "").trim() !== "فرع افتراضي")
          .map((b: any) => ({ id: b.id, name: b.name }))
      );
      setDeptOptions((dp || []).map((d: any) => ({ id: d.id, name: d.name_ar || d.name })));
    } catch (e) {
      // silent — selects fall back to empty
    }
  };

  const openPolicyFile = (fileUrl?: string | null) => {
    openEmployeeFormsStorageFile(fileUrl, (message) => {
      toast({ title: "تعذر فتح الملف", description: message, variant: "destructive" });
    });
  };

  // Auto-prefill loan form when opened
  useEffect(() => {
    if (activeForm !== "loan_request" || !employeeProfile) return;
    setFormData((prev) => ({
      full_name: prev.full_name || employeeProfile.full_name || "",
      branch: prev.branch || employeeProfile.branch_name || "",
      branch_id: prev.branch_id || employeeProfile.branch_id || "",
      work_start_date: prev.work_start_date || employeeProfile.start_date || "",
      salary: prev.salary || (employeeProfile.base_salary ? String(employeeProfile.base_salary) : ""),
      ...prev,
    }));
  }, [activeForm, employeeProfile]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // ── Security validation: type, extension, and size ────────────────
    const ALLOWED_MIME = new Set([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/webp",
      "application/pdf",
    ]);
    const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "pdf"]);
    const MAX_BYTES = 5 * 1024 * 1024; // 5MB

    const rawExt = (file.name.split(".").pop() || "").toLowerCase();
    const mime = (file.type || "").toLowerCase();

    if (!mime || !ALLOWED_MIME.has(mime) || !ALLOWED_EXT.has(rawExt)) {
      // Reset input so the same bad file can be retried after fix
      e.target.value = "";
      toast({
        title: "نوع الملف غير مسموح",
        description: "الرجاء رفع صورة JPG/PNG/WEBP أو PDF فقط.",
        variant: "destructive",
      });
      return;
    }
    if (file.size > MAX_BYTES) {
      e.target.value = "";
      toast({
        title: "حجم الملف كبير",
        description: "الحد الأقصى 5MB.",
        variant: "destructive",
      });
      return;
    }

    setUploadingFile(true);
    // Normalize extension (jpeg → jpg only when mime is image/jpeg? keep as-is, but safe-lower)
    const ext = rawExt;
    // Storage RLS requires the first folder to equal auth.uid().
    // The `userId` prop is the tenant owner's id (employee.user_id), which is
    // NOT the same as the currently authenticated portal user. Use the live
    // session user id instead to satisfy the bucket policy.
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const authUid = authData?.user?.id;
    if (authErr || !authUid) {
      setUploadingFile(false);
      toast({ title: "تعذر التحقق من جلسة المستخدم", description: authErr?.message || "يرجى تسجيل الدخول من جديد", variant: "destructive" });
      return;
    }
    // Safe, non-user-controlled filename
    const randomId = (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
    const path = `${authUid}/${Date.now()}-${randomId}.${ext}`;
    const { data, error } = await supabase.storage
      .from("employee-forms")
      .upload(path, file, { contentType: mime, upsert: false });
    setUploadingFile(false);
    if (error) {
      toast({ title: "خطأ في رفع الملف", description: error.message, variant: "destructive" });
      return;
    }
    // Bucket is private — create a long-lived signed URL so HR can view the file later
    const { data: signed, error: signErr } = await supabase.storage
      .from("employee-forms")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 5); // 5 years
    if (signErr || !signed?.signedUrl) {
      toast({ title: "تم الرفع لكن تعذر إنشاء رابط العرض", description: signErr?.message || "", variant: "destructive" });
      return;
    }
    setFormData(prev => ({ ...prev, attachment_url: signed.signedUrl, attachment_path: path }));
    toast({ title: "تم رفع الملف ✅" });
  };

  const handleRemoveAttachment = async () => {
    const path = (formData as any).attachment_path as string | undefined;
    if (path) {
      await supabase.storage.from("employee-forms").remove([path]).catch(() => {});
    }
    setFormData(prev => {
      const { attachment_url, attachment_path, ...rest } = prev as any;
      return rest;
    });
  };

  const advanceBranchMissing =
    activeForm === "advance_request" && !formData.receive_branch_id && !formData.receive_branch_name;

  const submitForm = async () => {
    if (!activeForm) return;

    // HR-gated intake windows — block submission when closed by HR.
    if (activeForm === "advance_request" && !allowAdvance) {
      toast({
        title: "تم إغلاق استقبال طلبات السلف",
        description: advanceClosedMsg?.trim() || "دائرة الموارد البشرية أوقفت مؤقتاً استقبال طلبات السلف.",
        variant: "destructive",
      });
      return;
    }
    if (activeForm === "leave_request" && !allowLeave) {
      // (سقف السلفة يُفحص أدناه)
      toast({
        title: "تم إغلاق استقبال طلبات الإجازات",
        description: leaveClosedMsg?.trim() || "دائرة الموارد البشرية أوقفت مؤقتاً استقبال طلبات الإجازات.",
        variant: "destructive",
      });
      return;
    }

    // أيام محظورة حددتها الموارد البشرية — تُمنع كامل الفترة المطلوبة.
    // سقف مبلغ السلفة الذي حددته الموارد البشرية (مع استثناءات الموظفين).
    if (activeForm === "advance_request" && advanceMax !== null) {
      const amt = parseFloat(String(formData.amount || "0"));
      if (amt > advanceMax) {
        toast({
          title: "المبلغ يتجاوز السقف",
          description: `الحد الأعلى لطلب السلفة هو ${advanceMax} ₪. راجع الموارد البشرية لطلب استثناء.`,
          variant: "destructive",
        });
        return;
      }
    }

    if (activeForm === "leave_request") {
      const hit = findBlackoutInRange(formData.from_date, formData.to_date, leaveBlackouts);
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

    // Build the data we'll submit (allow auto-computation for some forms)
    const submitData: Record<string, any> = { ...formData };

    // Leave days are entered by the employee (never auto-filled)
    if (activeForm === "leave_request") {
      if (!submitData.leave_type) submitData.leave_type = "annual";
      const days = Number(submitData.days_count);
      if (!submitData.days_count || !Number.isFinite(days) || days <= 0) {
        toast({
          title: "عدد أيام الإجازة مطلوب",
          description: "الرجاء تحديد عدد أيام الإجازة الفعلية التي تحتاجها.",
          variant: "destructive",
        });
        return;
      }
      submitData.days_count = String(days);
    }

    // Auto-compute overtime hours if not entered
    if (activeForm === "overtime_request") {
      if (!submitData.hours && submitData.from_time && submitData.to_time) {
        submitData.hours = String(diffHours(submitData.from_time, submitData.to_time));
      }
    }

    // Attach loan eligibility snapshot
    if (activeForm === "loan_request") {
      const elig = evaluateLoanEligibility({
        loanAmount: submitData.loan_amount,
        installments: submitData.installments,
        workStartDate: submitData.work_start_date || employeeProfile?.start_date,
        baseSalary: submitData.salary || employeeProfile?.base_salary,
      });
      submitData.eligibility_status = elig.eligibility_status;
      submitData.eligibility_reason = elig.eligibility_reason;
      if (elig.calculated_loan_limit != null) submitData.calculated_loan_limit = String(elig.calculated_loan_limit);
      if (elig.months_of_service != null) submitData.months_of_service = String(elig.months_of_service);
      if (elig.years_of_service != null) submitData.years_of_service = String(elig.years_of_service);
    }

    // Validate before submission
    const v = validateEmployeeForm(activeForm, submitData);
    if (v.ok === false) {
      toast({ title: "تعذّر الإرسال", description: v.error, variant: "destructive" });
      return;
    }

    setSubmitting(true);

    const { error } = await supabase.from("employee_forms").insert({
      employee_id: employeeId,
      user_id: userId,
      form_type: activeForm,
      form_data: submitData,
      attachment_url: submitData.attachment_url || null,
      status: "pending",
      // توجيه الشكوى: الإدارة العليا أو الموارد البشرية (عمود مستقل تعتمد عليه سياسات الوصول)
      complaint_target: activeForm === "complaints" ? (submitData.complaint_target || "executive") : null,
    } as any);

    setSubmitting(false);
    if (error) {
      toast({ title: "خطأ", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "تم الإرسال بنجاح ✅", description: "سيتم مراجعة طلبك قريباً" });
      setActiveForm(null);
      setFormData({});
      fetchSubmissions();
      onRefresh();
    }
  };

  // نماذج المدراء تظهر إذا كان الموظف مديراً، أو تم إسناد النموذج له فردياً من HR.
  const visibleManagerForms = managerForms.filter(f => isManager || grantedBuiltins.has(f.id));
  const baseForms = [...employeeForms.filter(f => showLoanForm || f.id !== "loan_request"), ...visibleManagerForms];
  // Apply tenant overrides: custom label + custom ordering (defaults preserved).
  const allForms = baseForms
    .map((f, idx) => {
      const ov = builtinOverrides.get(f.id);
      return {
        ...f,
        label: ov?.label_override?.trim() || f.label,
        __order: typeof ov?.sort_order === "number" ? ov.sort_order : idx,
        __idx: idx,
      };
    })
    .sort((a, b) => (a.__order - b.__order) || (a.__idx - b.__idx));
  const allCards = [...allForms, ...policyCards];

  const formLabel = (type: string) => {
    const card = [...employeeForms, ...managerForms].find(f => f.id === type);
    return card?.label || type;
  };

  const renderFormFields = () => {
    switch (activeForm) {
      case "leave_request": {
        const leaveOptions = [
          { value: "annual", label: "سنوية" },
          { value: "regular", label: "عادية" },
          { value: "sick", label: "مرضية" },
        ];
        const selectedLeave = formData.leave_type || "annual";
        const autoDays = diffDaysInclusive(formData.from_date, formData.to_date);
        const blackoutHit = findBlackoutInRange(formData.from_date, formData.to_date, leaveBlackouts);
        return (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">من تاريخ *</label>
              <LeaveDateField
                value={formData.from_date || ""}
                onChange={v => setFormData(p => ({ ...p, from_date: v }))}
                blackouts={leaveBlackouts}
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ *</label>
              <LeaveDateField
                value={formData.to_date || ""}
                onChange={v => setFormData(p => ({ ...p, to_date: v }))}
                blackouts={leaveBlackouts}
                min={formData.from_date || undefined}
              />
              {formData.from_date && formData.to_date && formData.to_date < formData.from_date && (
                <p className="text-[10px] text-destructive mt-1">⚠️ تاريخ النهاية قبل تاريخ البداية</p>
              )}
              {blackoutHit && (
                <p className="text-[10px] text-destructive mt-1">
                  ⚠️ الفترة تشمل أيام ممنوع تقديم إجازة عليها ({blackoutHit.start_date} → {blackoutHit.end_date})
                  {blackoutHit.reason ? ` — ${blackoutHit.reason}` : ""}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">عدد أيام الإجازة *</label>
              <Input
                type="number"
                min={0.5}
                step={0.5}
                value={formData.days_count || ""}
                onChange={e => setFormData(p => ({ ...p, days_count: e.target.value }))}
                dir="ltr"
                className="rounded-xl"
                placeholder={autoDays > 0 ? String(autoDays) : "1"}
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">
                حدّد عدد الأيام الفعلية التي تحتاجها{autoDays > 0 ? ` (المدة بين التاريخين: ${autoDays} يوم)` : ""}
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">نوع الإجازة *</label>
              <div className="grid grid-cols-3 gap-2">
                {leaveOptions.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setFormData(p => ({ ...p, leave_type: opt.value }))}
                    className={`p-3 rounded-xl border text-sm font-medium transition-all ${
                      selectedLeave === opt.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:bg-muted/50"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
                <label className="text-xs text-muted-foreground mb-1 block">
                  {selectedLeave === "sick" ? "تقرير طبي" : "مرفق"} <span className="text-[10px] font-normal">(اختياري — جدول امتحانات، تقرير طبي، أو أي مستند داعم)</span>
                </label>
                {formData.attachment_url ? (
                  (() => {
                    const path = (formData as any).attachment_path as string | undefined;
                    const isPdf = !!path && /\.pdf$/i.test(path);
                    return (
                      <div className="relative border-2 border-emerald-500/40 bg-emerald-500/5 rounded-xl p-3 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleRemoveAttachment}
                          aria-label="إزالة الملف"
                          className="absolute -top-2 -left-2 h-7 w-7 rounded-full bg-destructive text-destructive-foreground shadow-md flex items-center justify-center hover:scale-105 transition"
                        >
                          <X className="h-4 w-4" />
                        </button>
                        <div className="h-14 w-14 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-border">
                          {isPdf ? (
                            <FileText className="h-6 w-6 text-primary" />
                          ) : (
                            <img src={formData.attachment_url} alt="معاينة" className="h-full w-full object-cover" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            تم رفع المرفق
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5 truncate" dir="ltr">
                            {isPdf ? "ملف PDF" : "صورة"}
                          </p>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <label className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center gap-1.5 cursor-pointer hover:bg-muted/50 transition-colors">
                    {uploadingFile ? (
                      <>
                        <Loader2 className="h-5 w-5 text-primary animate-spin" />
                        <span className="text-xs text-muted-foreground">جاري الرفع…</span>
                      </>
                    ) : (
                      <>
                        <Upload className="h-5 w-5 text-muted-foreground" />
                        <span className="text-xs text-primary font-medium">اضغط لإرفاق ملف</span>
                        <span className="text-[10px] text-muted-foreground">صورة أو PDF</span>
                      </>
                    )}
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                      accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
                      disabled={uploadingFile}
                    />
                  </label>
                )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">السبب</label>
              <Textarea value={formData.reason || ""} onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))} rows={3} className="rounded-xl" placeholder="اشرح سبب الإجازة..." />
            </div>
          </>
        );
      }

      case "advance_request":
        return (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">المبلغ المطلوب (₪) *</label>
              <Input type="number" value={formData.amount || ""} onChange={e => setFormData(p => ({ ...p, amount: e.target.value }))} dir="ltr" className="rounded-xl" placeholder="500" />
              {advanceMax !== null && (
                <p className={`text-[10px] mt-1 ${parseFloat(String(formData.amount || "0")) > advanceMax ? "text-destructive" : "text-muted-foreground"}`}>
                  الحد الأعلى المسموح: {advanceMax} ₪
                </p>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الفرع المراد الاستلام منه *</label>
              {branchOptions.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">لا توجد فروع متاحة</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {branchOptions.map(b => {
                    const active = formData.receive_branch_id === b.id;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setFormData(p => ({
                          ...p,
                          receive_branch_id: b.id,
                          receive_branch_name: b.name,
                        }))}
                        className={`py-3 px-2 rounded-xl border text-sm font-medium transition-all text-center ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/50"}`}
                      >
                        {b.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">السبب *</label>
              <Textarea value={formData.reason || ""} onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))} rows={3} className="rounded-xl" placeholder="سبب طلب السلفة..." />
            </div>
          </>
        );

      case "loan_request":
        {
          const elig = evaluateLoanEligibility({
            loanAmount: formData.loan_amount,
            installments: formData.installments,
            workStartDate: formData.work_start_date || employeeProfile?.start_date,
            baseSalary: formData.salary || employeeProfile?.base_salary,
          });
          return (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed bg-primary/5 rounded-xl p-3">
              انطلاقاً من حرص الشركة على دعم موظفيها ومساندتهم في مواجهة الظروف المالية الطارئة، تم اعتماد <strong>سياسة القرض الحسن</strong> كإحدى المزايا الاجتماعية المقدّمة للموظفين.
              يُمنح القرض الحسن دون فوائد أو رسوم، ويُسترد على أقساط شهرية تُخصم من راتب الموظف.
            </p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الاسم الرباعي *</label>
              <Input value={formData.full_name || ""} onChange={e => setFormData(p => ({ ...p, full_name: e.target.value }))} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الفرع *</label>
              <Input value={formData.branch || ""} onChange={e => setFormData(p => ({ ...p, branch: e.target.value }))} className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">تاريخ بدء العمل</label>
                <Input type="date" value={formData.work_start_date || ""} onChange={e => setFormData(p => ({ ...p, work_start_date: e.target.value }))} dir="ltr" className="rounded-xl" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الراتب (₪)</label>
                <Input type="number" value={formData.salary || ""} onChange={e => setFormData(p => ({ ...p, salary: e.target.value }))} dir="ltr" className="rounded-xl" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">قيمة القرض *</label>
              <Input type="number" value={formData.loan_amount || ""} onChange={e => setFormData(p => ({ ...p, loan_amount: e.target.value }))} dir="ltr" className="rounded-xl" />
              <p className="text-[10px] text-destructive mt-1">يتم اعتماد قيمة القرض النهائية حسب سقف القرض المعتمد ووفق سياسة القرض الحسن</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">عدد الدفعات الشهرية *</label>
              <Input type="number" min={1} value={formData.installments || ""} onChange={e => setFormData(p => ({ ...p, installments: e.target.value }))} dir="ltr" className="rounded-xl" placeholder="6" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">سبب طلب القرض *</label>
              <Textarea value={formData.reason || ""} onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))} rows={3} className="rounded-xl" />
            </div>
            {/* تقييم الأهلية المبدئي مخفي من واجهة الموظف — يبقى قرار HR. الحساب أعلاه محفوظ للاستخدام الداخلي. */}
          </>
          );
        }

      case "employee_info":
        return (
          <div dir="rtl" className="space-y-3">
            <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-4 space-y-1">
              <div className="flex items-center gap-2">
                <UserCog className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-bold">تحديث بياناتك الشخصية</h3>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                عبّي جميع الحقول، الحقول المعلّمة بـ <span className="text-destructive font-bold">*</span> إلزامية.
                سيراجعها قسم الموارد البشرية ويحدّث ملفك مباشرة.
              </p>
            </div>

            {/* Section 1: Identity */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-primary">
                <span className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">1</span>
                <h4 className="text-sm font-semibold">معلوماتك الأساسية</h4>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">الاسم الكامل (رباعي) <span className="text-destructive">*</span></label>
                <Input value={formData.name || ""} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="rounded-xl h-11" placeholder="مثال: محمد أحمد علي حسن" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">رقم الهوية الشخصية <span className="text-destructive">*</span></label>
                <Input inputMode="numeric" value={formData.id_number || ""} onChange={e => setFormData(p => ({ ...p, id_number: e.target.value.replace(/\D/g, "").slice(0, 9) }))} dir="ltr" className="rounded-xl h-11" placeholder="9 أرقام" />
                <p className="text-[10px] text-warning mt-1">رقم هويتك الشخصية وليس رقم البصمة في الجهاز</p>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">تاريخ الميلاد <span className="text-destructive">*</span></label>
                <Input type="date" value={formData.date_of_birth || ""} onChange={e => setFormData(p => ({ ...p, date_of_birth: e.target.value }))} dir="ltr" className="rounded-xl h-11" />
              </div>
            </div>

            {/* Section 2: Contact */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 text-primary">
                <span className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">2</span>
                <h4 className="text-sm font-semibold">رقم الواتساب</h4>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">الرقم اللي بتستقبل عليه واتساب <span className="text-destructive">*</span></label>
                <div className="flex gap-2" dir="ltr">
                  <div className="flex rounded-xl border border-border overflow-hidden h-11 shrink-0" role="group">
                    {["+972", "+970"].map(code => {
                      const active = (formData.whatsapp_prefix || "+972") === code;
                      return (
                        <button
                          key={code}
                          type="button"
                          onClick={() => setFormData(p => ({ ...p, whatsapp_prefix: code, whatsapp: `${code}${(p.whatsapp_local || "").replace(/^0/, "")}` }))}
                          className={`px-3 text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:bg-muted/50"}`}
                        >
                          {code}
                        </button>
                      );
                    })}
                  </div>
                  <Input
                    inputMode="numeric"
                    value={formData.whatsapp_local || ""}
                    onChange={e => {
                      const digits = e.target.value.replace(/\D/g, "").slice(0, 10);
                      setFormData(p => ({
                        ...p,
                        whatsapp_local: digits,
                        whatsapp: `${p.whatsapp_prefix || "+972"}${digits.replace(/^0/, "")}`,
                      }));
                    }}
                    className="rounded-xl flex-1 h-11"
                    placeholder="591234567"
                  />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">بدون الصفر في البداية</p>
              </div>
            </div>

            {/* Section 3: Work */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 text-primary">
                <span className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">3</span>
                <h4 className="text-sm font-semibold">معلومات العمل</h4>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">تاريخ بدايتك بالعمل في الملكي <span className="text-destructive">*</span></label>
                <Input type="date" value={formData.malaky_start_date || ""} onChange={e => setFormData(p => ({ ...p, malaky_start_date: e.target.value }))} dir="ltr" className="rounded-xl h-11" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">الفرع <span className="text-destructive">*</span></label>
                {branchOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">لا توجد فروع</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {branchOptions.map(b => {
                      const active = formData.branch_id === b.id;
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setFormData(p => ({ ...p, branch_id: b.id, branch: b.name }))}
                          className={`py-3 px-2 rounded-xl border text-sm font-medium transition-all text-center ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/50"}`}
                        >
                          {b.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">القسم <span className="text-destructive">*</span></label>
                {deptOptions.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">لا توجد أقسام</p>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    {deptOptions.map(d => {
                      const active = formData.department_id === d.id;
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setFormData(p => ({ ...p, department_id: d.id, department: d.name }))}
                          className={`py-3 px-2 rounded-xl border text-sm font-medium transition-all text-center ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/50"}`}
                        >
                          {d.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">المستوى التعليمي <span className="text-destructive">*</span></label>
                <div className="grid grid-cols-3 gap-2">
                  {["ابتدائي","إعدادي","ثانوي","توجيهي","دبلوم","بكالوريوس","ماجستير","دكتوراه","أخرى"].map(v => {
                    const active = formData.education === v;
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFormData(p => ({ ...p, education: v }))}
                        className={`py-2.5 rounded-xl border text-xs font-medium transition-all ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/50"}`}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Section 4: Family */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 text-primary">
                <span className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">4</span>
                <h4 className="text-sm font-semibold">الحالة الاجتماعية <span className="text-destructive">*</span></h4>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {["أعزب", "متزوج", "مطلق", "أرمل"].map(v => (
                  <button key={v} type="button" onClick={() => setFormData(p => ({ ...p, marital_status: v }))}
                    className={`py-3 rounded-xl border text-sm font-medium transition-all ${formData.marital_status === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/50"}`}>
                    {v}
                  </button>
                ))}
              </div>
              {(formData.marital_status === "متزوج" || formData.marital_status === "مطلق" || formData.marital_status === "أرمل") && (
                <div>
                  <label className="text-xs font-medium mb-1.5 block">عدد الأبناء <span className="text-destructive">*</span></label>
                  <Input type="number" min={0} value={formData.children_count || ""} onChange={e => setFormData(p => ({ ...p, children_count: e.target.value }))} dir="ltr" className="rounded-xl h-11" placeholder="0" />
                </div>
              )}
            </div>

            {/* Section 5: Attachment */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 text-primary">
                <span className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">5</span>
                <h4 className="text-sm font-semibold">صورة الهوية <span className="text-destructive">*</span></h4>
              </div>
              <p className="text-[10px] text-muted-foreground -mt-1">
                إلزامية — ترفق كوثيقة رسمية في ملفك ولا تُستخدم كصورة شخصية.
              </p>
              {formData.attachment_url ? (
                (() => {
                  const path = (formData as any).attachment_path as string | undefined;
                  const isPdf = !!path && /\.pdf$/i.test(path);
                  return (
                    <div className="relative border-2 border-emerald-500/40 bg-emerald-500/5 rounded-xl p-3 flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleRemoveAttachment}
                        aria-label="إزالة الملف"
                        className="absolute -top-2 -left-2 h-7 w-7 rounded-full bg-destructive text-destructive-foreground shadow-md flex items-center justify-center hover:scale-105 transition"
                      >
                        <X className="h-4 w-4" />
                      </button>
                      <div className="h-16 w-16 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0 border border-border">
                        {isPdf ? (
                          <FileText className="h-7 w-7 text-primary" />
                        ) : (
                          <img src={formData.attachment_url} alt="معاينة" className="h-full w-full object-cover" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          تم رفع الملف بنجاح
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 truncate" dir="ltr">
                          {isPdf ? "ملف PDF" : "صورة"}
                        </p>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <label className="border-2 border-dashed border-border rounded-xl p-5 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors">
                  {uploadingFile ? (
                    <>
                      <Loader2 className="h-6 w-6 text-primary animate-spin" />
                      <span className="text-xs text-muted-foreground">جاري الرفع…</span>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 text-muted-foreground" />
                      <span className="text-xs text-primary font-medium">اضغط لاختيار صورة من جهازك</span>
                      <span className="text-[10px] text-muted-foreground">صورة أو PDF</span>
                    </>
                  )}
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
                    disabled={uploadingFile}
                  />
                </label>
              )}
            </div>

            {/* Notes */}
            <div className="pt-2">
              <label className="text-xs font-medium mb-1.5 block">ملاحظات إضافية <span className="text-[10px] text-muted-foreground font-normal">(اختياري)</span></label>
              <Textarea value={formData.notes || ""} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={2} className="rounded-xl" placeholder="أي معلومة بدك توصلها للموارد البشرية..." />
            </div>
          </div>
        );

      case "complaints":
        return (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed bg-primary/5 rounded-xl p-3">
              هذا النموذج مخصص لتقديم الشكاوى والملاحظات المتعلقة بكافة نواحي العمل. نرحب بملاحظاتكم القيّمة التي تساهم في تحسين بيئة العمل.
              اختر جهة الاستلام أولاً: الشكوى الموجّهة للإدارة العليا سرّية ولا يراها أحد في الموارد البشرية.
            </p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">جهة الاستلام *</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: "executive", label: "الإدارة العليا" },
                  { v: "hr", label: "الموارد البشرية" },
                ].map(opt => (
                  <button key={opt.v} type="button" onClick={() => setFormData(p => ({ ...p, complaint_target: opt.v }))}
                    className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${formData.complaint_target === opt.v ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/50"}`}>
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {formData.complaint_target === "hr"
                  ? "ستصل شكواك إلى مدير الموارد البشرية والإدارة العليا."
                  : "شكوى الإدارة العليا سرّية — تصل للإدارة العليا فقط ولا يراها أي موظف في الموارد البشرية."}
              </p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الاسم *</label>
              <Input value={formData.name || ""} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="rounded-xl" />
            </div>
             <div>
               <label className="text-xs text-muted-foreground mb-1 block">شكوى / ملاحظة / اقتراح/مشاركة *</label>
               <div className="grid grid-cols-2 gap-2">
                 {["شكوى", "ملاحظة", "اقتراح", "مشاركة"].map(v => (
                   <button key={v} type="button" onClick={() => setFormData(p => ({ ...p, complaint_type: v }))}
                     className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${formData.complaint_type === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/50"}`}>
                     {v}
                   </button>
                 ))}
               </div>
             </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">اكتب شكواك / ملاحظتك / اقتراحك/مشاركتك *</label>
              <Textarea value={formData.content || ""} onChange={e => setFormData(p => ({ ...p, content: e.target.value }))} rows={4} className="rounded-xl" maxLength={2000} />
              <p className="text-[10px] text-muted-foreground text-left mt-0.5">{(formData.content || "").length}/2000</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">إضافة ملف أو صورة</label>
              <label className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-xs text-primary">اختر ملف أو اسحبه هنا</span>
                <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.doc,.docx" />
              </label>
              {formData.attachment_url && <p className="text-xs text-emerald-500 mt-1">✅ تم رفع الملف</p>}
            </div>
          </>
        );

      case "employee_voice":
        return (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed bg-primary/5 rounded-xl p-3">
              مساحتك لمشاركة اقتراحاتك وأفكارك وآرائك وملاحظات التحسين. صوتك يهمّنا — تصل مشاركتك إلى دائرة الموارد البشرية.
            </p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">نوع المشاركة *</label>
              <div className="grid grid-cols-2 gap-2">
                {["اقتراح", "فكرة", "رأي", "ملاحظة تحسين"].map(v => (
                  <button key={v} type="button" onClick={() => setFormData(p => ({ ...p, voice_type: v }))}
                    className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${formData.voice_type === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/50"}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">اكتب مشاركتك *</label>
              <Textarea value={formData.content || ""} onChange={e => setFormData(p => ({ ...p, content: e.target.value }))} rows={4} className="rounded-xl" maxLength={2000} />
              <p className="text-[10px] text-muted-foreground text-left mt-0.5">{(formData.content || "").length}/2000</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">إضافة ملف أو صورة (اختياري)</label>
              <label className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-xs text-primary">اختر ملف أو اسحبه هنا</span>
                <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf,.doc,.docx" />
              </label>
              {formData.attachment_url && <p className="text-xs text-emerald-500 mt-1">✅ تم رفع الملف</p>}
            </div>
          </>
        );

      case "correction_request":
        return (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">التاريخ *</label>
              <Input type="date" value={formData.correction_date || ""} onChange={e => setFormData(p => ({ ...p, correction_date: e.target.value }))} dir="ltr" className="rounded-xl" />
            </div>
             <div>
               <label className="text-xs text-muted-foreground mb-1 block">نوع التصحيح *</label>
               <div className="grid grid-cols-1 gap-2">
                 {[{ value: "missing_checkout", label: "نسيت تسجيل خروج" }, { value: "missing_checkin", label: "نسيت تسجيل دخول" }, { value: "wrong_time", label: "وقت خاطئ" }].map(opt => (
                   <button key={opt.value} type="button" onClick={() => setFormData(p => ({ ...p, correction_type: opt.value }))}
                     className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${(formData.correction_type || "missing_checkout") === opt.value ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/50"}`}>
                     {opt.label}
                   </button>
                 ))}
               </div>
             </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">وقت البصمة *</label>
              <Input type="time" value={formData.correction_time || ""} onChange={e => setFormData(p => ({ ...p, correction_time: e.target.value }))} dir="ltr" className="rounded-xl" />
              <p className="text-[10px] text-muted-foreground mt-0.5">الوقت الفعلي للدخول/الخروج</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">السبب *</label>
              <Textarea value={formData.reason || ""} onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))} rows={3} className="rounded-xl" placeholder="اشرح سبب التصحيح..." />
            </div>
          </>
        );

      case "overtime_request":
        {
          const autoH = diffHours(formData.from_time, formData.to_time);
        return (
          <>
            <p className="text-[11px] text-muted-foreground bg-primary/5 rounded-xl p-2.5 leading-relaxed">
              نموذج للمدراء فقط — لإبلاغ HR بأن الموظف بقي بعد دوامه أو تم تمديد دوامه.
            </p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">اسم الموظف *</label>
              <Input value={formData.employee_name || ""} onChange={e => setFormData(p => ({ ...p, employee_name: e.target.value }))} className="rounded-xl" placeholder="الموظف الذي عمل أوفرتايم" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">التاريخ *</label>
              <Input type="date" value={formData.overtime_date || ""} onChange={e => setFormData(p => ({ ...p, overtime_date: e.target.value }))} dir="ltr" className="rounded-xl" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">من ساعة *</label>
                <Input type="time" value={formData.from_time || ""} onChange={e => setFormData(p => ({ ...p, from_time: e.target.value }))} dir="ltr" className="rounded-xl" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">إلى ساعة *</label>
                <Input type="time" value={formData.to_time || ""} onChange={e => setFormData(p => ({ ...p, to_time: e.target.value }))} dir="ltr" className="rounded-xl" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">عدد الساعات *</label>
              <Input
                type="number"
                step="0.25"
                value={formData.hours || (autoH > 0 ? String(autoH) : "")}
                onChange={e => setFormData(p => ({ ...p, hours: e.target.value }))}
                dir="ltr"
                className="rounded-xl"
                placeholder={autoH > 0 ? String(autoH) : "2"}
              />
              {autoH > 0 && <p className="text-[10px] text-muted-foreground mt-0.5">محسوب تلقائياً: {autoH} ساعة</p>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الفرع</label>
                <Input value={formData.branch || ""} onChange={e => setFormData(p => ({ ...p, branch: e.target.value }))} className="rounded-xl" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">القسم</label>
                <Input value={formData.department || ""} onChange={e => setFormData(p => ({ ...p, department: e.target.value }))} className="rounded-xl" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">الشفت</label>
                <Input value={formData.shift || ""} onChange={e => setFormData(p => ({ ...p, shift: e.target.value }))} className="rounded-xl" />
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">السبب *</label>
              <Textarea value={formData.reason || ""} onChange={e => setFormData(p => ({ ...p, reason: e.target.value }))} rows={3} className="rounded-xl" placeholder="سبب الأوفرتايم..." />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">مرفق (اختياري)</label>
              <label className="border-2 border-dashed border-border rounded-xl p-4 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors">
                <Upload className="h-5 w-5 text-muted-foreground" />
                <span className="text-xs text-primary">اختر ملف</span>
                <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf" />
              </label>
              {formData.attachment_url && <p className="text-xs text-emerald-500 mt-1">✅ تم رفع الملف</p>}
            </div>
          </>
        );
        }

      case "hr_message":
        return (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الموضوع *</label>
              <Input value={formData.subject || ""} onChange={e => setFormData(p => ({ ...p, subject: e.target.value }))} className="rounded-xl" placeholder="موضوع الرسالة..." />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الرسالة *</label>
              <Textarea value={formData.message || ""} onChange={e => setFormData(p => ({ ...p, message: e.target.value }))} rows={4} className="rounded-xl" placeholder="اكتب رسالتك هنا..." />
            </div>
          </>
        );

      // === Manager-only forms ===
      case "disciplinary_action":
        return (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">اسم المدير *</label>
              <Input value={formData.manager_name || ""} onChange={e => setFormData(p => ({ ...p, manager_name: e.target.value }))} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">إسم الموظف *</label>
              <Input value={formData.employee_name || ""} onChange={e => setFormData(p => ({ ...p, employee_name: e.target.value }))} className="rounded-xl" />
              <p className="text-[10px] text-muted-foreground mt-0.5">الموظف المطلوب بحقه إجراء عقابي</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الفرع *</label>
              <Input value={formData.branch || ""} onChange={e => setFormData(p => ({ ...p, branch: e.target.value }))} className="rounded-xl" />
            </div>
             <div>
               <label className="text-xs text-muted-foreground mb-1 block">الشفت *</label>
               <div className="grid grid-cols-3 gap-2">
                 {["صباحي", "مسائي", "ليلي"].map(v => (
                   <button key={v} type="button" onClick={() => setFormData(p => ({ ...p, shift: v }))}
                     className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${formData.shift === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/50"}`}>
                     {v}
                   </button>
                 ))}
               </div>
             </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">وصف المخالفة والتوصية *</label>
              <Textarea value={formData.description || ""} onChange={e => setFormData(p => ({ ...p, description: e.target.value }))} rows={4} className="rounded-xl" placeholder="مثلاً: التسكع أثناء أوقات العمل الرسمية" maxLength={2000} />
              <p className="text-[10px] text-muted-foreground text-left mt-0.5">{(formData.description || "").length}/2000</p>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">مرفق صوري</label>
              <p className="text-[10px] text-muted-foreground mb-1">مرفق صوري/فيديو للمخالفة إن وجد</p>
              <label className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-xs text-primary">اختر ملف أو اسحبه هنا</span>
                <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,video/*,.pdf" />
              </label>
              {formData.attachment_url && <p className="text-xs text-emerald-500 mt-1">✅ تم رفع الملف</p>}
            </div>
          </>
        );

      case "facility_quality":
        return (
          <>
            <p className="text-xs text-destructive text-center mb-2">يتم تعبئة هذا النموذج عند نهاية كل شفت للمطبخ والصالة</p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">اسم الموظف *</label>
              <Input value={formData.employee_name || ""} onChange={e => setFormData(p => ({ ...p, employee_name: e.target.value }))} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الفرع *</label>
              <Input value={formData.branch || ""} onChange={e => setFormData(p => ({ ...p, branch: e.target.value }))} className="rounded-xl" />
            </div>
             <div>
               <label className="text-xs text-muted-foreground mb-1 block">الشفت *</label>
               <div className="grid grid-cols-2 gap-2">
                 {["صباحي", "مسائي"].map(v => (
                   <button key={v} type="button" onClick={() => setFormData(p => ({ ...p, shift: v }))}
                     className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${formData.shift === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/50"}`}>
                     {v}
                   </button>
                 ))}
               </div>
             </div>
            {[
              "نظافة مكتب الادارة والكول سنتر",
              "نظافة الزيت والفلاتر",
              "نظافة الماكينات",
              "نظافة المجلى والأطباق",
              "نظافة الأرضية والجدران",
              "نظافة الثلاجة وترتيب البضائع",
              "نظافة الممر",
              "تفريغ سلة المهملات",
              "نظافة حمام الموظفين",
              "نظافة الطاولات",
              "نظافة الحمامات",
              "نظافة المغسلة",
              "تعبئة ونظافة الثلاجة",
              "تعبئة محارم الحمام",
              "تعبئة محارم اليدين",
              "نظافة الزجاج والدرابزين",
              "نظافة الورمر",
              "نظافة الكاونتر الداخلية",
              "نظافة أرضية الكاونتر",
              "تعبئة السلطات",
            ].map(item => (
              <label key={item} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/30 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData[item] === "true"}
                  onChange={e => setFormData(p => ({ ...p, [item]: e.target.checked ? "true" : "false" }))}
                  className="h-4 w-4 rounded accent-primary"
                />
                <span className="text-sm">{item}</span>
              </label>
            ))}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">مرفق صور</label>
              <label className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-xs text-primary">اختر ملف أو اسحبه هنا</span>
                <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,video/*,.pdf" />
              </label>
              {formData.attachment_url && <p className="text-xs text-emerald-500 mt-1">✅ تم رفع الملف</p>}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ملاحظات إضافية</label>
              <Textarea value={formData.notes || ""} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={2} className="rounded-xl" />
            </div>
          </>
        );

      case "equipment_fault":
        return (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed bg-primary/5 rounded-xl p-3">
              يتم إستخدام هذا النموذج لتبليغ عن أعطال المعدات والمرافق وعند إستلام الشفت في حال إستلام مكان العمل أو المعدات أو المستهلكات بطريقة تخالف سياسات العمل.
            </p>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">اسم الموظف *</label>
              <Input value={formData.employee_name || ""} onChange={e => setFormData(p => ({ ...p, employee_name: e.target.value }))} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الفرع *</label>
              <Input value={formData.branch || ""} onChange={e => setFormData(p => ({ ...p, branch: e.target.value }))} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">القسم *</label>
              <Input value={formData.department || ""} onChange={e => setFormData(p => ({ ...p, department: e.target.value }))} className="rounded-xl" />
            </div>
             <div>
               <label className="text-xs text-muted-foreground mb-1 block">الشفت *</label>
               <p className="text-[10px] text-muted-foreground mb-1">شفت الموظف الذي قام بتعبئة النموذج</p>
               <div className="grid grid-cols-2 gap-2">
                 {["صباحي", "مسائي"].map(v => (
                   <button key={v} type="button" onClick={() => setFormData(p => ({ ...p, shift: v }))}
                     className={`py-2.5 rounded-xl border text-sm font-medium transition-all ${formData.shift === v ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted/50"}`}>
                     {v}
                   </button>
                 ))}
               </div>
             </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">مرفق صوري *</label>
              <label className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-xs text-primary">اختر ملف أو اسحبه هنا</span>
                <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,video/*,.pdf" />
              </label>
              {formData.attachment_url && <p className="text-xs text-emerald-500 mt-1">✅ تم رفع الملف</p>}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">ملاحظات</label>
              <Textarea value={formData.notes || ""} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={2} className="rounded-xl" />
            </div>
          </>
        );

      case "inventory_balance": {
        const items = INVENTORY_BALANCE_ITEMS;
        return (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">اسم الموظف *</label>
              <Input value={formData.employee_name || ""} onChange={e => setFormData(p => ({ ...p, employee_name: e.target.value }))} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الفرع *</label>
              <Input value={formData.branch || ""} onChange={e => setFormData(p => ({ ...p, branch: e.target.value }))} className="rounded-xl" />
            </div>
            {items.map(item => (
              <div key={item.key}>
                <label className="text-xs text-muted-foreground mb-1 block">{item.label}{item.required ? " *" : ""}</label>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={formData[item.key] || ""}
                  onChange={e => setFormData(p => ({ ...p, [item.key]: e.target.value }))}
                  className="rounded-xl"
                  placeholder="0"
                />
              </div>
            ))}
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">صورة</label>
              <Input type="file" accept="image/*" onChange={handleFileUpload} className="rounded-xl" />
            </div>
          </>
        );
      }

      default:
        return null;
    }
  };

  const getFormTitle = () => {
    const card = [...employeeForms, ...managerForms].find(f => f.id === activeForm);
    return card?.label || "";
  };

  const bottomPad = "calc(72px + env(safe-area-inset-bottom, 0px))";

  return (
    <div className="space-y-4 px-4 pt-3" dir="rtl" style={{ paddingBottom: bottomPad }}>
      <h2 className="text-lg font-bold pt-2">📋 نماذج العمل</h2>

      {/* Dynamic templates assigned to this employee (job title or individual) */}
      <EmployeeAssignedTemplates
        employeeId={employeeId}
        jobTitle={jobTitle}
        jobTitleName={jobTitleName}
      />

      {/* Forms Section */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">النماذج والطلبات</h3>
        <div className="space-y-2">
          {allForms.map(card => (
            (() => {
              const ov = builtinOverrides.get(card.id);
              const isClosed =
                (card.id === "advance_request" && !allowAdvance) ||
                (card.id === "leave_request" && !allowLeave) ||
                ov?.is_enabled === false;
              const closedMsg =
                (card.id === "advance_request" ? advanceClosedMsg : card.id === "leave_request" ? leaveClosedMsg : "") ||
                (ov?.closed_message ?? "");
              return (
            <button
              key={card.id}
              onClick={() => {
                if (isClosed) {
                  toast({
                    title:
                      card.id === "advance_request"
                        ? "تم إغلاق استقبال طلبات السلف"
                        : card.id === "leave_request"
                          ? "تم إغلاق استقبال طلبات الإجازات"
                          : "هذا النموذج موقوف مؤقتاً",
                    description:
                      closedMsg?.trim() ||
                      "دائرة الموارد البشرية أوقفت مؤقتاً استقبال هذا النوع من الطلبات.",
                  });
                  return;
                }
                setActiveForm(card.id);
                setFormData({});
              }}
              className={`w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-border transition-all text-right ${isClosed ? "opacity-60 cursor-not-allowed" : "hover:bg-muted/50 active:scale-[0.99]"}`}
            >
              <div className={`h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <span className="text-sm font-medium flex-1">
                {card.label}
                {isClosed && (
                  <span className="mr-2 text-[10px] text-destructive font-normal">
                    (مغلق مؤقتاً)
                  </span>
                )}
              </span>
              {card.managerOnly && <Badge variant="outline" className="text-[9px]">مدير</Badge>}
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
              );
            })()
          ))}
        </div>
      </div>

      {/* نماذج مُسندة لهذا الموظف للاطلاع على تعبئة الآخرين (مثل مدراء الفروع) */}
      <BuiltinFormsViewerSection viewKeys={viewBuiltins} selfEmployeeId={employeeId} />

      {/* Policies Section */}
      {showPolicies && <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">السياسات واللوائح</h3>
        <div className="space-y-2">
          {policyCards.map(card => {
            const policyDoc = policies.find(p => p.category === card.id);
            return (
              <button
                key={card.id}
                onClick={() => {
                  if (policyDoc?.file_url) {
                    openPolicyFile(policyDoc.file_url);
                  } else {
                    toast({ title: "قريباً", description: "سيتم إضافة هذه السياسة قريباً" });
                  }
                }}
                className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-border hover:bg-muted/50 active:scale-[0.99] transition-all text-right"
              >
                <div className={`h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0`}>
                  <card.icon className={`h-5 w-5 ${card.color}`} />
                </div>
                <span className="text-sm font-medium flex-1">{card.label}</span>
                {policyDoc ? (
                  <Eye className="h-4 w-4 text-primary" />
                ) : (
                  <span className="text-[10px] text-muted-foreground">قريباً</span>
                )}
              </button>
            );
          })}
        </div>
      </div>}


      {/* Mobile: full-screen page. Desktop: Dialog. */}
      {isMobile && activeForm && (
        <div
          className="fixed inset-0 z-[100] bg-background flex flex-col"
          dir="rtl"
          style={{ height: "100dvh", paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          <header className="relative z-[130] flex items-center justify-between px-3 h-14 border-b bg-card shrink-0 sticky top-0 pointer-events-auto">
            <button
              type="button"
              onClick={() => { setActiveForm(null); setFormData({}); }}
              className="h-11 w-11 -m-1 rounded-full flex items-center justify-center hover:bg-muted/60 active:scale-95 transition touch-manipulation"
              aria-label="إغلاق"
            >
              <X className="h-6 w-6" />
            </button>
            <h1 className="text-base font-bold truncate px-2">{getFormTitle()}</h1>
            <div className="w-11 shrink-0" />
          </header>
          <div
            className="flex-1 overflow-y-auto overscroll-contain px-4 pt-4"
            style={{
              WebkitOverflowScrolling: "touch",
              paddingBottom: "calc(96px + env(safe-area-inset-bottom, 0px))",
            }}
          >
            <div className="space-y-3">
              {renderFormFields()}
            </div>
          </div>
          <div
            className="fixed bottom-0 left-0 right-0 z-[110] px-4 py-3 border-t bg-card shrink-0"
            style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom, 0px))" }}
          >
            {advanceBranchMissing && (
              <p className="text-[11px] text-destructive mb-2 text-center">لازم تختار الفرع المراد استلام السلفة منه</p>
            )}
            <Button onClick={submitForm} disabled={submitting || uploadingFile || advanceBranchMissing} className="w-full rounded-xl gap-2 h-12">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? "جاري الإرسال..." : "إرسال الطلب"}
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!isMobile && !!activeForm} onOpenChange={o => { if (!o) { setActiveForm(null); setFormData({}); } }}>
        <DialogContent
          className="max-w-sm bg-card border-border max-h-[90vh] flex flex-col p-0 gap-0"
          dir="rtl"
        >
          <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
            <DialogTitle className="text-base">{getFormTitle()}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground sr-only">تعبئة النموذج</DialogDescription>
          </DialogHeader>
          {/* Use native scroll instead of Radix ScrollArea: ScrollArea breaks pointer events
              for Radix Select inside Dialogs on mobile (selection doesn't register / UI freezes). */}
          <div
            className="flex-1 overflow-y-auto overscroll-contain px-6 pb-4"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <div className="space-y-3 pb-2">
              {renderFormFields()}
            </div>
          </div>
          <DialogFooter className="px-6 py-4 border-t bg-card shrink-0">
            <div className="w-full">
              {advanceBranchMissing && (
                <p className="text-[11px] text-destructive mb-2 text-center">لازم تختار الفرع المراد استلام السلفة منه</p>
              )}
            <Button onClick={submitForm} disabled={submitting || uploadingFile || advanceBranchMissing} className="w-full rounded-xl gap-2">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? "جاري الإرسال..." : "إرسال الطلب"}
            </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
