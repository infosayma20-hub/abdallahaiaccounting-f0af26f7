import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
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

interface Props {
  employeeId: string;
  userId: string;
  isManager: boolean;
  isHrManager: boolean;
  onRefresh: () => void;
  initialFormId?: string | null;
  onInitialFormConsumed?: () => void;
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
  { id: "facility_quality", label: "جودة المرافق والمعدات", icon: Wrench, color: "text-cyan-500", type: "form", managerOnly: true },
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

export default function EmployeeFormsTab({ employeeId, userId, isManager, isHrManager, onRefresh, initialFormId, onInitialFormConsumed }: Props) {
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
  const [employeeProfile, setEmployeeProfile] = useState<any | null>(null);

  // Form state
  const [formData, setFormData] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchSubmissions();
    fetchPolicies();
    fetchOwnerSettings();
    fetchEmployeeProfile();
  }, [employeeId]);

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
      .select("hr_show_policies, hr_show_loan_form")
      .eq("user_id", ownerId)
      .maybeSingle();
    if (data) {
      setShowPolicies(data.hr_show_policies !== false);
      setShowLoanForm(data.hr_show_loan_form !== false);
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
    setUploadingFile(true);
    const ext = file.name.split(".").pop();
    const path = `${userId}/${Date.now()}.${ext}`;
    const { data, error } = await supabase.storage.from("employee-forms").upload(path, file);
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

  const submitForm = async () => {
    if (!activeForm) return;

    // Build the data we'll submit (allow auto-computation for some forms)
    const submitData: Record<string, any> = { ...formData };

    // Auto-compute leave days if not entered
    if (activeForm === "leave_request") {
      if (!submitData.leave_type) submitData.leave_type = "annual";
      if (!submitData.days_count && submitData.from_date && submitData.to_date) {
        submitData.days_count = String(diffDaysInclusive(submitData.from_date, submitData.to_date));
      }
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

  const allForms = [...employeeForms.filter(f => showLoanForm || f.id !== "loan_request"), ...(isManager ? managerForms : [])];
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
        ];
        const selectedLeave = formData.leave_type || "annual";
        const autoDays = diffDaysInclusive(formData.from_date, formData.to_date);
        return (
          <>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">من تاريخ *</label>
              <Input type="date" value={formData.from_date || ""} onChange={e => setFormData(p => ({ ...p, from_date: e.target.value }))} dir="ltr" className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">إلى تاريخ *</label>
              <Input type="date" value={formData.to_date || ""} onChange={e => setFormData(p => ({ ...p, to_date: e.target.value }))} dir="ltr" className="rounded-xl" />
              {formData.from_date && formData.to_date && formData.to_date < formData.from_date && (
                <p className="text-[10px] text-destructive mt-1">⚠️ تاريخ النهاية قبل تاريخ البداية</p>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">عدد أيام الإجازة *</label>
              <Input
                type="number"
                min={1}
                value={formData.days_count || (autoDays > 0 ? String(autoDays) : "")}
                onChange={e => setFormData(p => ({ ...p, days_count: e.target.value }))}
                dir="ltr"
                className="rounded-xl"
                placeholder={autoDays > 0 ? String(autoDays) : "1"}
              />
              {autoDays > 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">محسوب تلقائياً: {autoDays} يوم</p>
              )}
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">نوع الإجازة *</label>
              <div className="grid grid-cols-2 gap-2">
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
            <div className={`rounded-xl p-3 border text-xs space-y-1 ${eligibilityBadgeClass(elig.badge.tone)}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold">تقييم الأهلية المبدئي</span>
                <span className="text-[10px] font-bold">{elig.badge.text}</span>
              </div>
              <p className="text-[11px] opacity-90 leading-relaxed">{elig.eligibility_reason}</p>
              {elig.calculated_loan_limit != null && (
                <p className="text-[10px] opacity-80">السقف التقديري: {formatCurrency(elig.calculated_loan_limit)}</p>
              )}
              {elig.months_of_service != null && (
                <p className="text-[10px] opacity-80">مدة الخدمة: {elig.months_of_service} شهر</p>
              )}
              <p className="text-[10px] opacity-70">* ليس اعتماداً نهائياً — تبقى الموافقة لـ HR.</p>
            </div>
          </>
          );
        }

      case "employee_info":
        return (
          <>
            <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-4 space-y-1">
              <div className="flex items-center gap-2">
                <UserCog className="h-5 w-5 text-primary" />
                <h3 className="text-sm font-bold">تحديث بياناتك الشخصية</h3>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                عبّي البيانات الناقصة فقط، خذ وقتك. كل حقل عليه ⭐ ضروري، والباقي اختياري.
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
                <label className="text-xs font-medium mb-1.5 block">الاسم الكامل (رباعي) <span className="text-destructive">⭐</span></label>
                <Input value={formData.name || ""} onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} className="rounded-xl h-11" placeholder="مثال: محمد أحمد علي حسن" />
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">رقم الهوية الشخصية <span className="text-destructive">⭐</span></label>
                <Input inputMode="numeric" value={formData.id_number || ""} onChange={e => setFormData(p => ({ ...p, id_number: e.target.value.replace(/\D/g, "").slice(0, 9) }))} dir="ltr" className="rounded-xl h-11" placeholder="9 أرقام" />
                <p className="text-[10px] text-warning mt-1">💡 رقم هويتك الشخصية وليس رقم البصمة في الجهاز</p>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">تاريخ الميلاد <span className="text-destructive">⭐</span></label>
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
                <label className="text-xs font-medium mb-1.5 block">الرقم اللي بتستقبل عليه واتساب <span className="text-destructive">⭐</span></label>
                <div className="flex gap-2" dir="ltr">
                  <Select
                    value={formData.whatsapp_prefix || "+972"}
                    onValueChange={(v) => setFormData(p => ({ ...p, whatsapp_prefix: v, whatsapp: `${v}${(p.whatsapp_local || "").replace(/^0/, "")}` }))}
                  >
                    <SelectTrigger className="w-[110px] rounded-xl h-11"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="+972">🇮🇱 +972</SelectItem>
                      <SelectItem value="+970">🇵🇸 +970</SelectItem>
                    </SelectContent>
                  </Select>
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
                <p className="text-[10px] text-muted-foreground mt-1">💡 بدون الصفر في البداية</p>
              </div>
            </div>

            {/* Section 3: Work */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 text-primary">
                <span className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">3</span>
                <h4 className="text-sm font-semibold">معلومات العمل</h4>
              </div>
              <div>
                <label className="text-xs font-medium mb-1.5 block">تاريخ بدايتك بالعمل في الملكي <span className="text-destructive">⭐</span></label>
                <Input type="date" value={formData.malaky_start_date || ""} onChange={e => setFormData(p => ({ ...p, malaky_start_date: e.target.value }))} dir="ltr" className="rounded-xl h-11" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium mb-1.5 block">الفرع</label>
                  <Input value={formData.branch || ""} onChange={e => setFormData(p => ({ ...p, branch: e.target.value }))} className="rounded-xl h-11" placeholder="—" />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1.5 block">القسم</label>
                  <Input value={formData.department || ""} onChange={e => setFormData(p => ({ ...p, department: e.target.value }))} className="rounded-xl h-11" placeholder="—" />
                </div>
              </div>
            </div>

            {/* Section 4: Family */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 text-primary">
                <span className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">4</span>
                <h4 className="text-sm font-semibold">الحالة الاجتماعية</h4>
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
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs font-medium mb-1.5 block">اسم الزوج/الزوجة</label>
                    <Input value={formData.spouse_name || ""} onChange={e => setFormData(p => ({ ...p, spouse_name: e.target.value }))} className="rounded-xl h-11" />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1.5 block">عدد الأبناء</label>
                    <Input type="number" min={0} value={formData.children_count || ""} onChange={e => setFormData(p => ({ ...p, children_count: e.target.value }))} dir="ltr" className="rounded-xl h-11" placeholder="0" />
                  </div>
                </div>
              )}
            </div>

            {/* Section 5: Attachment */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-2 text-primary">
                <span className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold">5</span>
                <h4 className="text-sm font-semibold">صورة الهوية <span className="text-[10px] text-muted-foreground font-normal">(اختياري)</span></h4>
              </div>
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
                <input type="file" className="hidden" onChange={handleFileUpload} accept="image/*,.pdf" disabled={uploadingFile} />
              </label>
              {formData.attachment_url && <p className="text-xs text-emerald-500 flex items-center gap-1">✅ تم رفع الملف بنجاح</p>}
            </div>

            {/* Notes */}
            <div className="pt-2">
              <label className="text-xs font-medium mb-1.5 block">ملاحظات إضافية <span className="text-[10px] text-muted-foreground font-normal">(اختياري)</span></label>
              <Textarea value={formData.notes || ""} onChange={e => setFormData(p => ({ ...p, notes: e.target.value }))} rows={2} className="rounded-xl" placeholder="أي معلومة بدك توصلها للموارد البشرية..." />
            </div>
          </>
        );

      case "complaints":
        return (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed bg-primary/5 rounded-xl p-3">
              هذا النموذج مخصص لتقديم الشكاوى والاقتراحات المتعلقة بكافة نواحي العمل. نرحب بملاحظاتكم القيّمة التي تساهم في تحسين بيئة العمل.
              يرجى ملاحظة أن الشكوى أو الاقتراح الذي يتم تقديمه من خلال هذا النموذج سيصل مباشرة وفقط إلى المدير العام.
            </p>
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
            {["نظافة مكتب الادارة والكول سنتر", "نظافة الزيت والفلاتر", "نظافة الماكينات", "نظافة المجلى والأطباق", "نظافة الأرضية والجدران", "نظافة الثلاجة وترتيب البضائع", "نظافة الممر"].map(item => (
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
        const items = [
          { key: "chicken", label: "دجاج", required: true },
          { key: "mshab", label: "مسحب", required: true },
          { key: "wings", label: "اجنحة", required: true },
          { key: "burger_fresh", label: "لحصة برغر فريش", required: false },
          { key: "mutawama", label: "متومة", required: true },
          { key: "cabbage", label: "ملفوف", required: true },
          { key: "phino_sandwich", label: "فينو سندويش", required: true },
          { key: "phino_burger", label: "فينو برجر", required: true },
          { key: "mini_burger", label: "ميني برجر", required: true },
          { key: "fries", label: "بطاطا", required: true },
        ];
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

      {/* Forms Section */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground mb-2">النماذج والطلبات</h3>
        <div className="space-y-2">
          {allForms.map(card => (
            <button
              key={card.id}
              onClick={() => { setActiveForm(card.id); setFormData({}); }}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-card border border-border hover:bg-muted/50 active:scale-[0.99] transition-all text-right"
            >
              <div className={`h-10 w-10 rounded-xl bg-muted/50 flex items-center justify-center shrink-0`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <span className="text-sm font-medium flex-1">{card.label}</span>
              {card.managerOnly && <Badge variant="outline" className="text-[9px]">مدير</Badge>}
              <ChevronLeft className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </div>
      </div>

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
                    window.open(policyDoc.file_url, "_blank");
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


      {/* Form Dialog */}
      <Dialog open={!!activeForm} onOpenChange={o => { if (!o) { setActiveForm(null); setFormData({}); } }}>
        <DialogContent className="max-w-sm bg-card border-border max-h-[85vh]" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-base">{getFormTitle()}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground sr-only">تعبئة النموذج</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pe-2">
            <div className="space-y-3 pb-2">
              {renderFormFields()}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button onClick={submitForm} disabled={submitting || uploadingFile} className="w-full rounded-xl gap-2">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {submitting ? "جاري الإرسال..." : "إرسال الطلب"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
