import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import BackButton from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Search, CheckCircle2, XCircle, Eye, Upload, FileText,
  Download, ChevronLeft, ChevronRight, Loader2, Trash2, Printer, MoreHorizontal, Pencil,
  Settings2, ChevronDown, ChevronLeft as ChevronBreadcrumb, RefreshCw, Archive, ArchiveRestore,
  ThumbsUp, ThumbsDown
} from "lucide-react";
import EmployeeFormPrintView from "@/components/employee/EmployeeFormPrintView";
import DynamicTemplateView, { type TemplateSchema } from "@/components/employee/DynamicTemplateView";
import MonthlyInventoryView from "@/components/forms/MonthlyInventoryView";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { format } from "date-fns";
import { multiWordMatchAny } from "@/lib/utils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { displayReason, decodeHRMessage } from "@/lib/hrMessages";
import { getRequestSummary, getDetailGroups } from "@/lib/employeeRequestDisplay";
import { useHRManagerPermissions } from "@/hooks/useHRManagerPermissions";
import { getDefaultDateRangeThisYear } from "@/lib/hrDate";
import { HRDateRangeFilter } from "@/components/hr/HRDateRangeFilter";
import { useNavigate } from "react-router-dom";
import { PasswordResetRequestsPanel } from "@/pages/hr/components/PasswordResetRequestsPanel";
import { openEmployeeFormsStorageFile } from "@/lib/employeeStorageFiles";
import usePageSessionState, { usePageScrollRestoration } from "@/hooks/usePageSessionState";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScheduleModeEditor } from "@/components/hr/ScheduleModeEditor";
import { LeaveBlackoutDatesEditor } from "@/components/hr/LeaveBlackoutDatesEditor";
import AdvanceLimitEditor from "@/components/hr/AdvanceLimitEditor";
import AdvanceRequestModal from "@/components/hr/AdvanceRequestModal";
import { Plus } from "lucide-react";
import { ChevronsRight, ChevronsLeft, LayoutGrid, Plane, Wallet, Landmark, Clock, MessageSquare, FileSpreadsheet, UserRound, Cake, Scale, Building2, Wrench, Package, HelpCircle, AlertTriangle, Gavel, BadgeCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

const formTypeLabels: Record<string, string> = {
  leave_request: "طلب إجازة",
  advance_request: "طلب سلفة",
  loan_request: "طلب قرض حسن",
  correction_request: "تصحيح بصمة",
  overtime_request: "طلب أوفرتايم",
  hr_message: "رسالة لـ HR",
  employee_info: "تعبئة معلومات",
  birthday_whatsapp: "تاريخ الميلاد والواتساب",
  complaints: "شكاوى وملاحظات",
  disciplinary_action: "طلب إجراء عقابي",
  facility_quality: "جودة المرافق",
  equipment_fault: "إبلاغ أعطال",
  inventory_balance: "رصيد الأصناف",
  dynamic_template: "نموذج مخصص",
  // Virtual types from correction_requests:
  _attendance_correction: "تصحيح بصمة",
  _hr_message: "رسالة HR",
  _hr_inquiry: "طلب توضيح",
  _hr_warning: "إنذار",
  _hr_penalty: "إجراء عقابي",
};

// Monochrome D365-style icons for each form type
const formTypeIcons: Record<string, LucideIcon> = {
  leave_request: Plane,
  advance_request: Wallet,
  loan_request: Landmark,
  correction_request: Pencil,
  overtime_request: Clock,
  hr_message: MessageSquare,
  employee_info: UserRound,
  birthday_whatsapp: Cake,
  complaints: MessageSquare,
  disciplinary_action: Scale,
  facility_quality: Building2,
  equipment_fault: Wrench,
  inventory_balance: Package,
  dynamic_template: FileText,
  _attendance_correction: Pencil,
  _hr_message: MessageSquare,
  _hr_inquiry: HelpCircle,
  _hr_warning: AlertTriangle,
  _hr_penalty: Gavel,
};

const statusConfig: Record<string, { label: string; variant: "default" | "destructive" | "outline" | "secondary"; color: string }> = {
  pending: { label: "قيد المراجعة", variant: "outline", color: "text-warning" },
  approved: { label: "تمت الموافقة", variant: "default", color: "text-emerald-600" },
  rejected: { label: "مرفوض", variant: "destructive", color: "text-destructive" },
};

const financialTypes = ["advance_request", "loan_request"];

// Quick-filter category chips. Each maps to a set of form_type values.
type CategoryKey = "all" | "leaves" | "advances" | "loans" | "attendance" | "messages" | "custom" | "info";
const CATEGORY_CHIPS: { key: CategoryKey; label: string; icon: LucideIcon; types: string[] }[] = [
  { key: "all",        label: "الكل",                  icon: LayoutGrid,        types: [] },
  { key: "leaves",     label: "الإجازات",              icon: Plane,             types: ["leave_request"] },
  { key: "advances",   label: "السلف",                 icon: Wallet,            types: ["advance_request"] },
  { key: "loans",      label: "القروض",                icon: Landmark,          types: ["loan_request"] },
  { key: "attendance", label: "الحضور والاستئذان",     icon: Clock,             types: ["correction_request", "overtime_request", "_attendance_correction"] },
  { key: "messages",   label: "الرسائل والشكاوى",      icon: MessageSquare,     types: ["hr_message", "complaints", "disciplinary_action", "_hr_message", "_hr_inquiry", "_hr_warning", "_hr_penalty"] },
  { key: "custom",     label: "النماذج المخصصة",       icon: FileSpreadsheet,   types: ["dynamic_template", "facility_quality", "equipment_fault", "inventory_balance"] },
  { key: "info",       label: "المعلومات الشخصية",     icon: UserRound,         types: ["employee_info", "birthday_whatsapp"] },
];

export default function EmployeeFormsManagementPage() {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const { settings: companySettings, updateSettings: updateCompanySettings, saveSettings: saveCompanySettings, saving: savingCompanySettings } = useCompanySettings();
  const { can, isAdmin } = useHRManagerPermissions();
  const navigate = useNavigate();
  // استرجاع موضع السكرول بعد التحديث أو التنقل والرجوع.
  usePageScrollRestoration();
  const canDelete = isAdmin || can("can_manage_forms");
  const [forms, setForms] = useState<any[]>([]);
  const [corrections, setCorrections] = useState<any[]>([]);
  const [printForm, setPrintForm] = useState<any | null>(null);
  const [employeeMap, setEmployeeMap] = useState<Record<string, { name: string; branch: string }>>({});
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchParams] = useSearchParams();
  const [filterType, setFilterType] = useState(searchParams.get("type") || "all");
  // فلاتر محفوظة بالجلسة — تبقى كما هي بعد تحديث الصفحة أو التنقل والرجوع.
  const [filterCategory, setFilterCategory] = usePageSessionState<CategoryKey>("filterCategory", "all");
  const [filterStatus, setFilterStatus] = usePageSessionState<string>("filterStatus", "all");
  const [dateFrom, setDateFrom] = useState(() => getDefaultDateRangeThisYear().fromISO);
  const [dateTo, setDateTo] = useState(() => getDefaultDateRangeThisYear().toISO);
  const [filterBranch, setFilterBranch] = usePageSessionState<string>("filterBranch", "all");
  const [filterArchive, setFilterArchive] = usePageSessionState<"active" | "archived" | "all">("filterArchive", "active");
  // Bulk selection (approve/reject multiple pending forms at once)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkProcessing, setBulkProcessing] = useState(false);
  // Per-column text filters (in addition to top filter bar)
  const [colFilters, setColFilters] = useState<{ employee: string; branch: string; form_type: string; details: string; status: string; notes: string }>({
    employee: "", branch: "", form_type: "", details: "", status: "", notes: "",
  });
  // Filter by the branch the advance will be collected from
  const [filterReceiveBranch, setFilterReceiveBranch] = useState<string>("all");
  const [selectedForm, setSelectedForm] = useState<any | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editedData, setEditedData] = useState<Record<string, any>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editBranches, setEditBranches] = useState<{ id: string; name: string }[]>([]);
  const [editDepts, setEditDepts] = useState<{ id: string; name: string }[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  type SortKey = "date" | "name" | "amount" | "branch" | "form_type" | "receive_branch";
  const [sortStack, setSortStack] = useState<Array<{ key: SortKey; dir: "asc" | "desc" }>>([
    { key: "date", dir: "desc" },
  ]);
  // Direct advance creation from management page
  const [addAdvOpen, setAddAdvOpen] = useState(false);
  const [advPickerQuery, setAdvPickerQuery] = useState("");
  const [advChosenEmp, setAdvChosenEmp] = useState<{ id: string; name: string } | null>(null);
  const perPage = 20;

  const [policies, setPolicies] = useState<any[]>([]);
  const [showPoliciesDialog, setShowPoliciesDialog] = useState(false);
  const [templateSchemas, setTemplateSchemas] = useState<Record<string, { name: string; schema: TemplateSchema }>>({});
  const [showUploadPolicy, setShowUploadPolicy] = useState(false);
  const [policyForm, setPolicyForm] = useState({ title: "", description: "", category: "" });
  const [uploadingPolicy, setUploadingPolicy] = useState(false);
  const [editPolicyId, setEditPolicyId] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);

  // Unified intake panel — collapsed by default (dedicated place for pausing all incoming requests)
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [pendingPwdResetCount, setPendingPwdResetCount] = useState(0);
  const [intakeSaving, setIntakeSaving] = useState(false);
  // Local buffers for the closed-messages Textareas so we only persist on blur.
  const [advMsgDraft, setAdvMsgDraft] = useState<string>("");
  const [leaveMsgDraft, setLeaveMsgDraft] = useState<string>("");
  useEffect(() => {
    setAdvMsgDraft(companySettings.hr_advance_requests_closed_message ?? "");
  }, [companySettings.hr_advance_requests_closed_message]);
  useEffect(() => {
    setLeaveMsgDraft(companySettings.hr_leave_requests_closed_message ?? "");
  }, [companySettings.hr_leave_requests_closed_message]);

  /**
   * Persist intake-related company_settings fields directly (without relying on
   * a separate "Save" button). Employees load this row on mount, so writing
   * immediately + broadcasting a realtime UPDATE makes the pause take effect
   * without any refresh on the employee side.
   */
  const persistIntake = async (
    patch: Partial<{
      hr_allow_advance_requests: boolean;
      hr_allow_leave_requests: boolean;
      hr_advance_requests_closed_message: string;
      hr_leave_requests_closed_message: string;
      hr_intake_auto_managed: boolean;
      hr_advance_intake_schedule_enabled: boolean;
      hr_advance_intake_open_day: number | null;
      hr_advance_intake_close_day: number | null;
      hr_advance_intake_schedule_mode: "monthly" | "weekly";
      hr_advance_intake_weekdays: number[];
      hr_leave_intake_schedule_enabled: boolean;
      hr_leave_intake_open_day: number | null;
      hr_leave_intake_close_day: number | null;
      hr_leave_intake_schedule_mode: "monthly" | "weekly";
      hr_leave_intake_weekdays: number[];
      hr_payroll_freeze_enabled: boolean;
      hr_payroll_freeze_days_before: number;
      hr_advance_max_amount: number | null;
      hr_advance_limit_exempt_employees: string[];
    }>
  ) => {
    // Optimistic UI update
    updateCompanySettings(patch as any);
    const ownerId = dataOwnerId || user?.id;
    if (!ownerId) {
      toast.error("تعذر تحديد صاحب البيانات");
      return;
    }
    setIntakeSaving(true);
    try {
      // Try UPDATE first (company_settings has no unique constraint on
      // user_id, so upsert with onConflict fails). Fall back to INSERT only
      // if no row exists yet for this owner.
      const updatePayload: any = { updated_by: user?.id || null, ...patch };
      const { data: updated, error: updErr } = await supabase
        .from("company_settings" as any)
        .update(updatePayload)
        .eq("user_id", ownerId)
        .select("id");
      if (updErr) throw updErr;
      if (!updated || updated.length === 0) {
        const insertPayload: any = { user_id: ownerId, updated_by: user?.id || null, ...patch };
        const { error: insErr } = await supabase
          .from("company_settings" as any)
          .insert(insertPayload);
        if (insErr) throw insErr;
      }
      toast.success("تم الحفظ", { duration: 1200 });
    } catch (e: any) {
      toast.error("فشل حفظ الإعداد", { description: e?.message });
    } finally {
      setIntakeSaving(false);
    }
  };

  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null;
    const load = async () => {
      const { count } = await supabase
        .from("password_reset_requests")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending");
      setPendingPwdResetCount(count || 0);
    };
    load();
    ch = supabase
      .channel("hr-pwd-reset-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "password_reset_requests" }, load)
      .subscribe();
    return () => { if (ch) supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (user && dataOwnerId) {
      fetchForms();
      fetchCorrections();
      fetchEmployees();
      fetchPolicies();
      fetchTemplates();
    }
  }, [user, dataOwnerId]);

  const fetchForms = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("employee_forms")
      .select("*")
      .order("created_at", { ascending: false });
    setForms(data || []);
    setLoading(false);
  };

  const fetchCorrections = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("correction_requests")
      .select("*")
      .order("created_at", { ascending: false });
    setCorrections(data || []);
  };

  // Normalize correction_requests rows into the same shape as employee_forms rows.
  const normalizedCorrections = (() => {
    const dateLabel = (d?: string | null) => {
      if (!d) return "";
      try { return format(new Date(d), "dd/MM/yyyy"); } catch { return String(d); }
    };
    const timeLabel = (t?: string | null) => {
      if (!t) return "";
      try { return format(new Date(t), "HH:mm"); } catch { return String(t); }
    };
    const punchTypeAr: Record<string, string> = {
      check_in: "بصمة دخول",
      check_out: "بصمة خروج",
      missing: "بصمة مفقودة",
    };
    return corrections.map((c: any) => {
      const meta = decodeHRMessage(c.reason);
      let virtualType: string;
      let details: string;
      if (meta) {
        // HR message stored in correction_requests
        if (meta.type === "inquiry") virtualType = "_hr_inquiry";
        else if (meta.type === "warning") virtualType = "_hr_warning";
        else if (meta.type === "penalty") virtualType = "_hr_penalty";
        else virtualType = "_hr_message";
        details = [meta.subject, meta.body].filter(Boolean).join(" — ");
      } else {
        // Real attendance-correction request
        virtualType = "_attendance_correction";
        const parts = [
          dateLabel(c.attendance_date),
          punchTypeAr[c.request_type] || c.request_type,
          c.requested_time ? `الوقت ${timeLabel(c.requested_time)}` : "",
          c.reason ? `— ${displayReason(c.reason)}` : "",
        ].filter(Boolean);
        details = parts.join(" · ");
      }
      return {
        id: c.id,
        _source: "correction_requests" as const,
        employee_id: c.employee_id,
        form_type: virtualType,
        form_data: null,
        reason: c.reason,
        status: c.status,
        review_notes: c.review_notes,
        reviewed_at: c.reviewed_at,
        created_at: c.created_at,
        _details: details,
        _hrMeta: meta,
        _raw: c,
      };
    });
  })();

  // Tag employee_forms rows with _source="employee_forms" for unified handling
  const normalizedForms = forms.map((f: any) => ({ ...f, _source: "employee_forms" as const }));
  const allItems = [...normalizedForms, ...normalizedCorrections]
    .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  // Deep-link: /employee-forms-management?formId=... opens that request directly.
  const deepLinkId = searchParams.get("formId");
  const openedDeepLink = useRef<string | null>(null);
  useEffect(() => {
    if (!deepLinkId || loading) return;
    if (openedDeepLink.current === deepLinkId) return;
    const target = allItems.find((f: any) => f.id === deepLinkId);
    if (!target) return;
    openedDeepLink.current = deepLinkId;
    setSelectedForm(target);
    setReviewNotes(target.review_notes || "");
    setEditMode(false);
    setEditedData({ ...(target.form_data || {}) });
  }, [deepLinkId, loading, allItems]);

  const fetchEmployees = async () => {
    if (!user || !dataOwnerId) return;
    const { data } = await supabase
      .from("employees")
      .select("id, full_name, branch_id, branches(name)")
      .eq("user_id", dataOwnerId);
    const map: Record<string, { name: string; branch: string }> = {};
    const branchSet = new Set<string>();
    (data || []).forEach((e: any) => {
      const branchName = e.branches?.name || "";
      map[e.id] = { name: e.full_name, branch: branchName };
      if (branchName) branchSet.add(branchName);
    });
    setEmployeeMap(map);
    setBranches(Array.from(branchSet).sort());
  };

  /**
   * Total advances actually disbursed per employee, per salary month.
   * Mirrors the employee wallet ("محفظتي") logic: category = advance,
   * debit movements, rejected rows excluded, bucketed by salary_month/year
   * with a fallback to movement_date for legacy untagged rows.
   * Key: `${employee_id}|${YYYY}-${MM}`
   */
  const [advanceTotals, setAdvanceTotals] = useState<Record<string, number>>({});
  const monthKey = (empId: string, dateStr: string) => {
    const d = new Date(dateStr);
    return `${empId}|${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  useEffect(() => {
    if (filterCategory !== "advances") return;
    let cancelled = false;
    (async () => {
      // Widen the window a bit so movements tagged to an adjacent salary month
      // are still bucketed correctly.
      const from = new Date(dateFrom); from.setDate(from.getDate() - 45);
      const to = new Date(dateTo); to.setDate(to.getDate() + 45);
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("employee_financial_movements")
        .select("employee_id, amount, movement_date, salary_month, salary_year, status")
        .eq("category", "advance")
        .eq("movement_type", "debit")
        .gte("movement_date", iso(from))
        .lte("movement_date", iso(to))
        .limit(5000);
      if (cancelled || error) return;
      const totals: Record<string, number> = {};
      (data || []).forEach((m: any) => {
        if (m.status === "rejected") return;
        const y = m.salary_year || new Date(m.movement_date).getFullYear();
        const mo = m.salary_month || new Date(m.movement_date).getMonth() + 1;
        const key = `${m.employee_id}|${y}-${String(mo).padStart(2, "0")}`;
        totals[key] = (totals[key] || 0) + Number(m.amount || 0);
      });
      setAdvanceTotals(totals);
    })();
    return () => { cancelled = true; };
  }, [filterCategory, dateFrom, dateTo]);

  const fetchPolicies = async () => {
    const { data } = await supabase
      .from("employee_policy_documents")
      .select("*")
      .order("created_at", { ascending: false });
    setPolicies(data || []);
  };

  const fetchTemplates = async () => {
    const { data } = await supabase
      .from("form_templates")
      .select("id, name, schema");
    const map: Record<string, { name: string; schema: TemplateSchema }> = {};
    (data || []).forEach((t: any) => {
      map[t.id] = { name: t.name, schema: (t.schema as TemplateSchema) || { sections: [] } };
    });
    setTemplateSchemas(map);
  };

  const handleAction = async (action: "approved" | "rejected", form: any, notesOverride?: string | null) => {
    if (!user) return;
    // If rejecting from the row (not the details drawer), prompt for a reason
    // so it can be shown as a visible column and sent to the employee.
    let inlineNotes: string | null = null;
    if (notesOverride !== undefined) {
      inlineNotes = notesOverride;
    } else if (action === "rejected" && form.id !== selectedForm?.id) {
      const entered = typeof window !== "undefined"
        ? window.prompt("سبب الرفض / ملاحظة (اختياري):", form.review_notes || "")
        : null;
      if (entered === null) return; // user cancelled
      inlineNotes = entered.trim() || null;
    }
    setProcessing(form.id + action);
    const notes = notesOverride !== undefined
      ? notesOverride
      : (form.id === selectedForm?.id ? reviewNotes : inlineNotes);
    const { error } = await supabase
      .from("employee_forms")
      .update({
        status: action,
        reviewed_by: user.id,
        review_notes: notes,
        reviewed_at: new Date().toISOString(),
      } as any)
      .eq("id", form.id);
    setProcessing(null);
    if (error) {
      toast.error("خطأ: " + error.message);
    } else {
      // Sync employee_info → employees row on approval (does NOT touch fingerprint_id).
      if (action === "approved" && form.form_type === "employee_info" && form.employee_id) {
        try {
          const d = (form.form_data || {}) as Record<string, any>;
          const maritalMap: Record<string, string> = {
            "أعزب": "single", "متزوج": "married", "مطلق": "divorced", "أرمل": "widowed",
          };
          const phone = d.whatsapp || (d.whatsapp_prefix && d.whatsapp_local
            ? `${d.whatsapp_prefix}${String(d.whatsapp_local).replace(/\D/g, "").replace(/^0/, "")}`
            : null);
          const patch: Record<string, any> = {};
          if (phone) patch.phone = phone;
          if (d.date_of_birth) patch.date_of_birth = d.date_of_birth;
          if (d.id_number) patch.id_number = String(d.id_number).replace(/\D/g, "");
          if (d.malaky_start_date) patch.start_date = d.malaky_start_date;
          if (d.marital_status) patch.marital_status = maritalMap[d.marital_status] || d.marital_status;
          if (d.children_count !== undefined && d.children_count !== "") patch.children_count = Number(d.children_count) || 0;
          if (d.address) patch.address = d.address;
          if (d.branch_id) patch.branch_id = d.branch_id;
          if (d.department_id) patch.department_id = d.department_id;
          if (d.department) patch.department = d.department;
          if (d.education) patch.education = d.education;
          if (d.name) patch.full_name = d.name;
          if (Object.keys(patch).length > 0) {
            const { error: upErr } = await supabase.from("employees").update(patch as any).eq("id", form.employee_id);
            if (upErr) toast.error("تم اعتماد الطلب لكن فشل تحديث ملف الموظف: " + upErr.message);
          }
        } catch (e: any) {
          toast.error("تعذّر مزامنة البيانات: " + (e?.message || ""));
        }
      }
      // Sync leave_request → employee_leaves on approval so the balance decreases.
      if (action === "approved" && form.form_type === "leave_request" && form.employee_id) {
        try {
          const d = (form.form_data || {}) as Record<string, any>;
          // ⚠️ مهم: كل نوع يجب أن يبقى مستقلاً — لا تدمج "عادية" مع "سنوية"
          // وإلا خُصمت الإجازات العادية من الرصيد السنوي بالخطأ.
          const typeMap: Record<string, string> = {
            annual: "سنوية",
            regular: "عادية",
            sick: "مرضية",
            unpaid: "بدون راتب",
            personal: "شخصية",
            emergency: "طارئة",
          };
          const rawType = String(d.leave_type || "annual");
          const mappedType = typeMap[rawType] || rawType;
          const start = d.from_date || d.start_date;
          const end = d.to_date || d.end_date || start;
          const days = Number(d.days_count) || 0;
          if (start && end && days > 0) {
            // Avoid duplicate insert if this form was already approved before.
            const { data: existing } = await supabase
              .from("employee_leaves")
              .select("id")
              .eq("employee_id", form.employee_id)
              .eq("start_date", start)
              .eq("end_date", end)
              .eq("leave_type", mappedType)
              .limit(1);
            if (!existing || existing.length === 0) {
              const { error: lvErr } = await supabase.from("employee_leaves").insert({
                user_id: form.user_id,
                employee_id: form.employee_id,
                leave_type: mappedType,
                start_date: start,
                end_date: end,
                days_count: days,
                status: "approved",
                notes: d.reason || null,
                reviewed_by: user.id,
                reviewed_at: new Date().toISOString(),
              } as any);
              if (lvErr) toast.error("تم اعتماد الطلب لكن فشل تسجيل الإجازة برصيد الموظف: " + lvErr.message);
            }
          }
        } catch (e: any) {
          toast.error("تعذّر تسجيل الإجازة: " + (e?.message || ""));
        }
      }
      // Notify employee about advance/loan decision (best-effort)
      if (financialTypes.includes(form.form_type) && form.user_id) {
        try {
          const amt = Number(form.form_data?.amount || form.form_data?.loan_amount || 0);
          const typeLabel = form.form_type === "advance_request" ? "السلفة" : "القرض";
          const title = action === "approved"
            ? `✅ تمت الموافقة على ${typeLabel}`
            : `❌ تم رفض طلب ${typeLabel}`;
          const body = action === "approved"
            ? `اعتُمدت ${typeLabel} بمبلغ ${amt.toLocaleString()} ₪${notes ? ` — ${notes}` : ""}`
            : `تم رفض طلبك${notes ? ` — ${notes}` : ""}`;
          await supabase.from("notification_queue").insert({
            owner_id: dataOwnerId,
            recipient_user_id: form.user_id,
            event_type: `${form.form_type}_${action}`,
            sensitivity: "high",
            title,
            body,
            data: { form_id: form.id, form_type: form.form_type, amount: amt, status: action },
            path: "/employee-portal/requests",
            priority: 3,
            dedup_key: `advance-decision-${form.id}-${action}`,
          } as any);
        } catch (e) {
          console.warn("notify employee failed", e);
        }
      }
      toast.success(action === "approved" ? "تمت الموافقة ✅" : "تم الرفض ❌");
      if (selectedForm?.id === form.id) { setSelectedForm(null); setReviewNotes(""); }
      fetchForms();
    }
  };

  const handleDelete = async (form: any) => {
    if (!confirm("هل أنت متأكد من حذف هذا الطلب؟")) return;
    setProcessing(form.id + "delete");
    const { error } = await supabase.from("employee_forms").delete().eq("id", form.id);
    setProcessing(null);
    if (error) { toast.error("خطأ: " + error.message); }
    else { toast.success("تم حذف الطلب 🗑️"); fetchForms(); }
  };

  /**
   * Two-stage approval for disciplinary actions:
   * stage 1 (here) HR records a non-binding recommendation + opinion,
   * stage 2 the owner/management issues the final decision from the portal.
   * The form stays `pending` until management decides.
   */
  const handleHrRecommendation = async (rec: "approve" | "reject", form: any) => {
    if (!user) return;
    const entered = typeof window !== "undefined"
      ? window.prompt(
          rec === "approve"
            ? "رأي الموارد البشرية (توصية بالاعتماد):"
            : "رأي الموارد البشرية (توصية بالرفض):",
          form.hr_recommendation_notes || "",
        )
      : null;
    if (entered === null) return;
    setProcessing(form.id + "hr_" + rec);
    const { error } = await supabase
      .from("employee_forms")
      .update({
        hr_recommendation: rec,
        hr_recommendation_notes: entered.trim() || null,
        hr_reviewed_by: user.id,
        hr_reviewed_at: new Date().toISOString(),
      } as any)
      .eq("id", form.id);
    setProcessing(null);
    if (error) { toast.error("تعذّر حفظ التوصية: " + error.message); return; }
    toast.success("تم إرسال توصية الموارد البشرية للإدارة ✅");
    fetchForms();
  };

  const handleArchiveToggle = async (form: any) => {
    if (form._source !== "employee_forms") {
      toast.error("الأرشفة متاحة لطلبات النماذج فقط");
      return;
    }
    const currentlyArchived = !!form.archived_at;
    setProcessing(form.id + "archive");
    const { error } = await supabase
      .from("employee_forms")
      .update({ archived_at: currentlyArchived ? null : new Date().toISOString() } as any)
      .eq("id", form.id);
    setProcessing(null);
    if (error) { toast.error("تعذر تحديث الأرشيف: " + error.message); return; }
    toast.success(currentlyArchived ? "تم إلغاء الأرشفة" : "تمت الأرشفة");
    fetchForms();
  };

  // "تمت الرؤية من الإدارة" — step قبل القبول/الرفض.
  const handleMarkSeen = async (form: any) => {
    if (!user) return;
    if (form._source !== "employee_forms") { toast.error("متاح لطلبات النماذج فقط"); return; }
    if (form.management_seen_at) return;
    setProcessing(form.id + "seen");
    const { error } = await supabase
      .from("employee_forms")
      .update({ management_seen_at: new Date().toISOString(), management_seen_by: user.id } as any)
      .eq("id", form.id);
    setProcessing(null);
    if (error) { toast.error("تعذّر التحديث: " + error.message); return; }
    toast.success("تم وضع الطلب كـ (تمت الرؤية) 👁️");
    fetchForms();
  };

  // Bulk approve/reject for selected pending employee_forms rows.
  const handleBulkAction = async (action: "approved" | "rejected") => {
    if (!user || selectedIds.size === 0) return;
    // Disciplinary actions are excluded: they require an HR recommendation
    // followed by a binding management decision, never a bulk HR approval.
    const targets = allItems.filter(
      (f: any) =>
        selectedIds.has(f.id) &&
        f._source === "employee_forms" &&
        f.status === "pending" &&
        f.form_type !== "disciplinary_action" &&
        f.form_type !== "disciplinary"
    );
    if (targets.length === 0) {
      toast.error("لا يوجد طلبات قيد المراجعة ضمن المحدد");
      return;
    }
    let notes: string | null = null;
    if (action === "rejected") {
      const entered = typeof window !== "undefined"
        ? window.prompt(`سبب الرفض لـ ${targets.length} طلب (اختياري):`, "")
        : null;
      if (entered === null) return;
      notes = entered.trim() || null;
    } else {
      if (!confirm(`تأكيد الموافقة على ${targets.length} طلب؟`)) return;
    }
    setBulkProcessing(true);
    let ok = 0, fail = 0;
    for (const form of targets) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await handleAction(action, form, notes);
        ok++;
      } catch {
        fail++;
      }
    }
    setBulkProcessing(false);
    setSelectedIds(new Set());
    toast.success(`تم ${action === "approved" ? "اعتماد" : "رفض"} ${ok} طلب${fail ? ` — فشل ${fail}` : ""}`);
    fetchForms();
  };

  // Bulk archive / unarchive / mark-seen / delete for selected employee_forms rows.
  const handleBulkOp = async (op: "archive" | "unarchive" | "seen" | "delete") => {
    if (!user || selectedIds.size === 0) return;
    let targets = allItems.filter((f: any) => selectedIds.has(f.id) && f._source === "employee_forms");
    if (op === "archive") targets = targets.filter((f: any) => !f.archived_at);
    if (op === "unarchive") targets = targets.filter((f: any) => !!f.archived_at);
    if (op === "seen") targets = targets.filter((f: any) => !f.management_seen_at);
    if (targets.length === 0) { toast.error("لا يوجد طلبات مناسبة ضمن المحدد"); return; }
    const labels: Record<string, string> = { archive: "أرشفة", unarchive: "إلغاء أرشفة", seen: "وضع كـ (تمت الرؤية) لـ", delete: "حذف" };
    if (!confirm(`تأكيد ${labels[op]} ${targets.length} طلب؟`)) return;
    setBulkProcessing(true);
    const ids = targets.map((f: any) => f.id);
    let error: any = null;
    if (op === "delete") {
      ({ error } = await supabase.from("employee_forms").delete().in("id", ids));
    } else {
      const patch: any =
        op === "archive" ? { archived_at: new Date().toISOString() }
        : op === "unarchive" ? { archived_at: null }
        : { management_seen_at: new Date().toISOString(), management_seen_by: user.id };
      ({ error } = await supabase.from("employee_forms").update(patch).in("id", ids));
    }
    setBulkProcessing(false);
    if (error) { toast.error("تعذّر تنفيذ الإجراء: " + error.message); return; }
    setSelectedIds(new Set());
    toast.success(`تم ${labels[op]} ${ids.length} طلب`);
    fetchForms();
  };

  // Load branches/departments lazily when admin enters edit mode
  useEffect(() => {
    if (!editMode || !dataOwnerId) return;
    if (editBranches.length > 0 && editDepts.length > 0) return;
    (async () => {
      const [{ data: br }, { data: dp }] = await Promise.all([
        supabase.from("branches_safe").select("id, name").eq("user_id", dataOwnerId).eq("is_active", true).order("name"),
        supabase.from("departments").select("id, name_ar, name").eq("user_id", dataOwnerId).eq("is_active", true).eq("is_deleted", false).order("name_ar"),
      ]);
      setEditBranches((br || []).map((b: any) => ({ id: b.id, name: b.name })));
      setEditDepts((dp || []).map((d: any) => ({ id: d.id, name: d.name_ar || d.name })));
    })();
  }, [editMode, dataOwnerId]);

  const saveEdits = async () => {
    if (!selectedForm) return;
    setSavingEdit(true);
    const isFinancial = financialTypes.includes(selectedForm.form_type);
    let nextData: Record<string, any> = { ...editedData };
    const patch: Record<string, any> = {};
    let employeeNote = "";

    if (isFinancial) {
      const prevAmount = Number(
        selectedForm.form_data?.original_amount
        ?? selectedForm.form_data?.amount
        ?? selectedForm.form_data?.loan_amount
        ?? 0
      );
      const newAmount = Number(nextData.amount ?? nextData.loan_amount ?? 0);
      const amountChanged = Number.isFinite(prevAmount) && Number.isFinite(newAmount) && prevAmount !== newAmount;

      if (amountChanged) {
        nextData.original_amount = selectedForm.form_data?.original_amount ?? prevAmount;
        nextData.hr_modified = true;
        nextData.hr_modified_at = new Date().toISOString();
        nextData.hr_modified_by = user?.id ?? null;
        const typeLabel = selectedForm.form_type === "advance_request" ? "السلفة" : "القرض";
        employeeNote = `تم تعديل مبلغ ${typeLabel} من قبل الموارد البشرية: ${prevAmount.toLocaleString()} ₪ ← ${newAmount.toLocaleString()} ₪`;
        if (nextData.admin_note) employeeNote += `\nملاحظة: ${nextData.admin_note}`;
      } else if (nextData.admin_note && nextData.admin_note !== selectedForm.form_data?.admin_note) {
        employeeNote = `ملاحظة من الموارد البشرية: ${nextData.admin_note}`;
      }
    }

    patch.form_data = nextData;
    if (employeeNote) patch.review_notes = employeeNote;

    const { error } = await supabase
      .from("employee_forms")
      .update(patch as any)
      .eq("id", selectedForm.id);
    setSavingEdit(false);
    if (error) { toast.error("فشل حفظ التعديلات: " + error.message); return; }
    toast.success(employeeNote ? "تم حفظ التعديل وإشعار الموظف ✅" : "تم حفظ التعديلات ✅");
    setSelectedForm({
      ...selectedForm,
      form_data: nextData,
      review_notes: employeeNote || selectedForm.review_notes,
    });
    setEditedData(nextData);
    setEditMode(false);
    fetchForms();
  };

  const handleUploadPolicy = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingPolicy(true);
    const ext = file.name.split(".").pop();
    const path = `policies/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("employee-forms").upload(path, file);
    if (uploadErr) { toast.error("خطأ في رفع الملف"); setUploadingPolicy(false); return; }
    const { data: urlData } = supabase.storage.from("employee-forms").getPublicUrl(path);
    let error: any = null;
    if (editPolicyId) {
      const res = await supabase.from("employee_policy_documents").update({
        title: policyForm.title, description: policyForm.description || null,
        file_url: urlData.publicUrl, category: policyForm.category,
      } as any).eq("id", editPolicyId);
      error = res.error;
    } else {
      const res = await supabase.from("employee_policy_documents").insert({
        user_id: dataOwnerId, title: policyForm.title, description: policyForm.description || null,
        file_url: urlData.publicUrl, category: policyForm.category,
      } as any);
      error = res.error;
    }
    setUploadingPolicy(false);
    if (error) { toast.error("خطأ: " + error.message); }
    else { toast.success(editPolicyId ? "تم تحديث السياسة ✅" : "تم إضافة السياسة ✅"); closePolicyDialog(); fetchPolicies(); }
  };

  const closePolicyDialog = () => {
    setShowUploadPolicy(false);
    setEditPolicyId(null);
    setPolicyForm({ title: "", description: "", category: "" });
  };

  const openEditPolicy = (p: any) => {
    setEditPolicyId(p.id);
    setPolicyForm({ title: p.title || "", description: p.description || "", category: p.category || "" });
    setShowUploadPolicy(true);
  };

  const savePolicyMeta = async () => {
    if (!editPolicyId) return;
    setSavingPolicy(true);
    const { error } = await supabase.from("employee_policy_documents").update({
      title: policyForm.title, description: policyForm.description || null, category: policyForm.category,
    } as any).eq("id", editPolicyId);
    setSavingPolicy(false);
    if (error) { toast.error("خطأ: " + error.message); return; }
    toast.success("تم تحديث السياسة ✅");
    closePolicyDialog();
    fetchPolicies();
  };

  const deletePolicy = async (p: any) => {
    if (!confirm(`هل تريد حذف السياسة "${p.title}"؟`)) return;
    const { error } = await supabase.from("employee_policy_documents").delete().eq("id", p.id);
    if (error) { toast.error("خطأ في الحذف: " + error.message); return; }
    toast.success("تم حذف السياسة");
    fetchPolicies();
  };

  const openPolicyFile = (fileUrl?: string | null) => {
    openEmployeeFormsStorageFile(fileUrl, (message) => toast.error("تعذر فتح الملف: " + message));
  };

  const getFormAmount = (f: any) => {
    if (!financialTypes.includes(f.form_type)) return null;
    return f.form_data?.amount || f.form_data?.loan_amount || null;
  };

  // Smart Arabic summary that strips HRMSG raw JSON tags.
  const getFormDetails = (f: any) => {
    if (f._source === "correction_requests") return f._details || "";
    const summary = getRequestSummary(f);
    if (summary && summary !== "—") return summary;
    const reasonClean = displayReason(f?.reason || f?.form_data?.reason || "");
    return reasonClean || "";
  };

  const filtered = allItems.filter(f => {
    // Category chip filter (applied first)
    if (filterCategory !== "all") {
      const cat = CATEGORY_CHIPS.find(c => c.key === filterCategory);
      if (cat && !cat.types.includes(f.form_type)) return false;
    }
    if (filterType !== "all" && f.form_type !== filterType) return false;
    if (filterStatus !== "all" && f.status !== filterStatus) return false;
    // Archive filter (only applies to employee_forms; correction_requests are always visible)
    if (f._source === "employee_forms") {
      const isArchived = !!f.archived_at;
      if (filterArchive === "active" && isArchived) return false;
      if (filterArchive === "archived" && !isArchived) return false;
    }
    const emp = employeeMap[f.employee_id];
    if (filterBranch !== "all" && emp?.branch !== filterBranch) return false;
    if (filterReceiveBranch !== "all" && ((f.form_data?.receive_branch_name as string) || "") !== filterReceiveBranch) return false;
    if (search) {
      const empName = emp?.name || "";
      const det = (f._source === "correction_requests" ? f._details : "") || "";
      if (!empName.includes(search) && !f.form_type.includes(search) && !det.includes(search)) return false;
    }
    // Per-column text filters
    const empName = emp?.name || "";
    const empBranch = emp?.branch || "";
    const typeLabel = (f.form_type === "dynamic_template" && (f as any).title)
      ? (f as any).title
      : (formTypeLabels[f.form_type] || f.form_type);
    const detText = f._source === "correction_requests" ? (f._details || "") : (getRequestSummary(f) || displayReason(f?.reason || f?.form_data?.reason || "") || "");
    const statusText = statusConfig[f.status]?.label || f.status || "";
    const notesText = f.review_notes || "";
    const cf = colFilters;
    if (cf.employee && !empName.toLowerCase().includes(cf.employee.toLowerCase())) return false;
    if (cf.branch && !empBranch.toLowerCase().includes(cf.branch.toLowerCase())) return false;
    if (cf.form_type && !String(typeLabel).toLowerCase().includes(cf.form_type.toLowerCase())) return false;
    if (cf.details && !String(detText).toLowerCase().includes(cf.details.toLowerCase())) return false;
    if (cf.status && cf.status !== "all" && f.status !== cf.status) return false;
    if (cf.notes && !String(notesText).toLowerCase().includes(cf.notes.toLowerCase())) return false;
    if (dateFrom) {
      const created = f.created_at?.slice(0, 10);
      if (created < dateFrom) return false;
    }
    if (dateTo) {
      const created = f.created_at?.slice(0, 10);
      if (created > dateTo) return false;
    }
    return true;
  });

  const compareByKey = (a: any, b: any, key: SortKey): number => {
    if (key === "name") {
      const an = employeeMap[a.employee_id]?.name || "";
      const bn = employeeMap[b.employee_id]?.name || "";
      return an.localeCompare(bn, "ar");
    }
    if (key === "amount") {
      return (Number(getFormAmount(a)) || 0) - (Number(getFormAmount(b)) || 0);
    }
    if (key === "branch") {
      const ab = employeeMap[a.employee_id]?.branch || "";
      const bb = employeeMap[b.employee_id]?.branch || "";
      return ab.localeCompare(bb, "ar");
    }
    if (key === "form_type") {
      const label = (f: any) => (f.form_type === "dynamic_template" && f.title) ? f.title : (formTypeLabels[f.form_type] || f.form_type || "");
      return label(a).localeCompare(label(b), "ar");
    }
    if (key === "receive_branch") {
      const ar = (a.form_data?.receive_branch_name as string) || "";
      const br = (b.form_data?.receive_branch_name as string) || "";
      return ar.localeCompare(br, "ar");
    }
    // Compare by day only so secondary sort keys (name/amount) can break ties on the same date.
    const ad = (a.created_at || "").slice(0, 10);
    const bd = (b.created_at || "").slice(0, 10);
    return ad.localeCompare(bd);
  };
  const sorted = [...filtered].sort((a, b) => {
    for (const { key, dir } of sortStack) {
      const cmp = compareByKey(a, b, key) * (dir === "asc" ? 1 : -1);
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
  const paginated = sorted.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(sorted.length / perPage);

  const toggleSort = (key: SortKey, additive: boolean) => {
    setSortStack(prev => {
      const idx = prev.findIndex(s => s.key === key);
      if (!additive) {
        if (idx === 0 && prev.length === 1) {
          return [{ key, dir: prev[0].dir === "asc" ? "desc" : "asc" }];
        }
        return [{ key, dir: key === "amount" ? "desc" : "asc" }];
      }
      // additive (Shift+click): add or toggle direction in stack
      if (idx === -1) {
        return [...prev, { key, dir: key === "amount" ? "desc" : "asc" }];
      }
      const next = [...prev];
      next[idx] = { key, dir: next[idx].dir === "asc" ? "desc" : "asc" };
      return next;
    });
    setPage(1);
  };
  const sortIndicator = (key: SortKey) => {
    const idx = sortStack.findIndex(s => s.key === key);
    if (idx === -1) return "";
    const arrow = sortStack[idx].dir === "asc" ? "▲" : "▼";
    const badge = sortStack.length > 1 ? ` ${idx + 1}` : "";
    return ` ${arrow}${badge}`;
  };

  const exportToExcel = () => {
    if (!sorted.length) { toast.error("لا يوجد بيانات للتصدير"); return; }
    const statusLabelMap: Record<string, string> = {
      pending: "قيد المراجعة", approved: "تمت الموافقة", rejected: "مرفوض",
    };
    const rows = sorted.map(f => {
      const emp = employeeMap[f.employee_id];
      const formLabel = f.form_type === "dynamic_template" && (f as any).title
        ? (f as any).title
        : (formTypeLabels[f.form_type] || f.form_type);
      const amt = Number(getFormAmount(f)) || 0;
      return {
        "الموظف": emp?.name || "",
        "الفرع": emp?.branch || "",
        "النموذج": formLabel,
        "التفاصيل": getFormDetails(f) || "",
        "استلام من فرع": (f.form_data?.receive_branch_name as string) || "",
        "المبلغ (₪)": amt || "",
        "التاريخ": f.created_at ? format(new Date(f.created_at), "dd/MM/yyyy HH:mm") : "",
        "الحالة": statusLabelMap[f.status] || f.status,
        "ملاحظة / سبب الرفض": f.review_notes || "",
      };
    });
    const totalAmount = sorted.reduce((s, f) => s + (Number(getFormAmount(f)) || 0), 0);
    rows.push({
      "الموظف": `الإجمالي (${sorted.length} سجل)`,
      "الفرع": "", "النموذج": "", "التفاصيل": "", "استلام من فرع": "",
      "المبلغ (₪)": totalAmount as any,
      "التاريخ": "", "الحالة": "", "ملاحظة / سبب الرفض": "",
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws["!cols"] = [{ wch: 22 }, { wch: 18 }, { wch: 22 }, { wch: 40 }, { wch: 20 }, { wch: 14 }, { wch: 18 }, { wch: 14 }, { wch: 30 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "طلبات الموظفين");
    XLSX.writeFile(wb, `طلبات-الموظفين-${format(new Date(), "yyyy-MM-dd")}.xlsx`);
    toast.success("تم تصدير الملف ✅");
  };

  const counts = {
    pending: allItems.filter(f => f.status === "pending").length,
    approved: allItems.filter(f => f.status === "approved").length,
    rejected: allItems.filter(f => f.status === "rejected").length,
    total: allItems.length,
  };

  // Per-category counts for chips (status-agnostic, branch/date/type-agnostic).
  const categoryCounts: Record<CategoryKey, number> = CATEGORY_CHIPS.reduce((acc, c) => {
    acc[c.key] = c.key === "all"
      ? allItems.length
      : allItems.filter(f => c.types.includes(f.form_type)).length;
    return acc;
  }, {} as Record<CategoryKey, number>);

  // Financial totals for filtered results
  const financialFiltered = filtered.filter(f => financialTypes.includes(f.form_type));
  const totalAmount = financialFiltered.reduce((sum, f) => sum + (Number(getFormAmount(f)) || 0), 0);
  const pendingAmount = financialFiltered.filter(f => f.status === "pending").reduce((sum, f) => sum + (Number(getFormAmount(f)) || 0), 0);
  const approvedAmount = financialFiltered.filter(f => f.status === "approved").reduce((sum, f) => sum + (Number(getFormAmount(f)) || 0), 0);

  return (
    <div className="min-h-screen bg-[#FAF9F8] w-full max-w-none hr-themed" dir="rtl" style={{ fontFamily: "'Segoe UI', Tajawal, sans-serif" }}>
      {/* D365 FinanceShell — Title bar */}
      <div className="bg-white border-b border-[#EDEBE9]">
        <div className="px-4 pt-3 pb-1 flex items-center gap-2 text-[11px] text-[#605E5C]">
          <span>الموارد البشرية</span>
          <ChevronBreadcrumb className="h-3 w-3 rotate-180" />
          <span className="text-[#323130]">طلبات الموظفين</span>
        </div>
        <div className="px-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BackButton />
            <h1 className="text-[18px] font-semibold text-[#323130] leading-none">طلبات الموظفين</h1>
            <span className="text-[11px] text-[#605E5C] mr-2">إدارة الطلبات، السلف، الإجازات، الرسائل والشكاوى</span>
          </div>
        </div>
        {/* Command bar */}
        <div className="px-2 py-1 flex items-center gap-0.5 border-t border-[#EDEBE9] bg-[#FAF9F8] overflow-x-auto">
          {(isAdmin || can("can_manage_forms")) && (
            <button
              type="button"
              onClick={() => { setAdvPickerQuery(""); setAddAdvOpen(true); }}
              className="h-8 px-2.5 gap-1.5 inline-flex items-center text-[12px] text-[#323130] hover:bg-[#EDEBE9] rounded-sm whitespace-nowrap"
              title="تسجيل سلفة جديدة لموظف مباشرة"
            >
              <Plus className="h-4 w-4" />
              <span>إضافة سلفة</span>
            </button>
          )}
          <div className="w-px h-5 bg-[#EDEBE9] mx-1" />
          <button
            type="button"
            onClick={() => fetchForms()}
            className="h-8 px-2.5 gap-1.5 inline-flex items-center text-[12px] text-[#323130] hover:bg-[#EDEBE9] rounded-sm whitespace-nowrap"
            title="تحديث البيانات"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>تحديث</span>
          </button>
          <div className="w-px h-5 bg-[#EDEBE9] mx-1" />
          <button
            type="button"
            onClick={exportToExcel}
            className="h-8 px-2.5 gap-1.5 inline-flex items-center text-[12px] text-[#323130] hover:bg-[#EDEBE9] rounded-sm whitespace-nowrap"
            title="تصدير القائمة الحالية إلى ملف Excel"
          >
            <FileSpreadsheet className="h-3.5 w-3.5 text-[#107C41]" />
            <span>تصدير Excel</span>
          </button>
          {(isAdmin || can("can_manage_forms")) && (
            <>
              <div className="w-px h-5 bg-[#EDEBE9] mx-1" />
              <button
                type="button"
                onClick={() => setIntakeOpen(v => !v)}
                className="h-8 px-2.5 gap-1.5 inline-flex items-center text-[12px] text-[#323130] hover:bg-[#EDEBE9] rounded-sm whitespace-nowrap"
                title="إعدادات استقبال الطلبات"
              >
                <Settings2 className="h-3.5 w-3.5" />
                <span>الإعدادات</span>
              </button>
              <div className="w-px h-5 bg-[#EDEBE9] mx-1" />
              <button
                type="button"
                onClick={() => setShowPoliciesDialog(true)}
                className="h-8 px-2.5 gap-1.5 inline-flex items-center text-[12px] text-[#323130] hover:bg-[#EDEBE9] rounded-sm whitespace-nowrap"
                title="السياسات واللوائح"
              >
                <FileText className="h-3.5 w-3.5" />
                <span>السياسات واللوائح</span>
              </button>
            </>
          )}
        </div>
      </div>

      <div className="w-full space-y-3 p-3 md:p-4">

        {/* Compact metrics strip — D365 flat tiles */}
        <div className="bg-white border border-[#EDEBE9] rounded-sm">
          <div className="p-2">
            <div className="grid grid-cols-4 divide-x divide-x-reverse divide-[#EDEBE9]" dir="rtl">
              {[
                { label: "الإجمالي", value: counts.total, color: "text-[#323130]" },
                { label: "قيد المراجعة", value: counts.pending, color: "text-[#8A6100]" },
                { label: "تمت الموافقة", value: counts.approved, color: "text-[#0B6A0B]" },
                { label: "مرفوض", value: counts.rejected, color: "text-[#A4262C]" },
              ].map(s => (
                <div key={s.label} className="px-3 text-center">
                  <div className={`text-[18px] font-semibold leading-tight ${s.color}`}>{s.value}</div>
                  <p className="text-[10px] text-[#605E5C] mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            {/* Financial summary — only when loans/advances category is active */}
            {filterCategory === "loans" && financialFiltered.length > 0 && (
              <div className="mt-2 pt-2 border-t border-[#EDEBE9] grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-sm font-semibold text-[#323130]">{totalAmount.toLocaleString()} ₪</div>
                  <p className="text-[10px] text-[#605E5C]">إجمالي ({financialFiltered.length})</p>
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#8A6100]">{pendingAmount.toLocaleString()} ₪</div>
                  <p className="text-[10px] text-[#605E5C]">قيد المراجعة</p>
                </div>
                <div>
                  <div className="text-sm font-semibold text-[#0B6A0B]">{approvedAmount.toLocaleString()} ₪</div>
                  <p className="text-[10px] text-[#605E5C]">تمت الموافقة</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Unified intake control panel — dedicated place to pause/manage all incoming employee requests */}
        {(isAdmin || can("can_manage_forms")) && (
          <Card className="border-border">
            <Collapsible open={intakeOpen} onOpenChange={setIntakeOpen}>
              <CollapsibleTrigger className="w-full flex items-center justify-between p-3 hover:bg-muted/40 transition-colors">
                <div className="flex items-center gap-2">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-bold">إعدادات استقبال الطلبات</span>
                  {(companySettings.hr_allow_advance_requests === false || companySettings.hr_allow_leave_requests === false) && (
                    <Badge variant="outline" className="h-5 text-[10px] border-warning text-warning">استقبال موقوف جزئياً</Badge>
                  )}
                  {(companySettings as any).hr_intake_auto_managed === true && (
                    <Badge variant="outline" className="h-5 text-[10px] border-primary text-primary">مُدار تلقائياً</Badge>
                  )}
                  {pendingPwdResetCount > 0 && (
                    <Badge variant="destructive" className="h-5 text-[10px]">
                      {pendingPwdResetCount} طلب كلمة مرور
                    </Badge>
                  )}
                </div>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${intakeOpen ? "rotate-180" : ""}`} />
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="p-4 pt-2 border-t border-border space-y-4">
                  {/* Direct manual switches — always available, take effect immediately
                       on the employee side (they re-fetch on focus/visibility). */}
                  {(() => {
                    const allowLeave = companySettings.hr_allow_leave_requests !== false;
                    const allowAdv = companySettings.hr_allow_advance_requests !== false;
                    const auto = (companySettings as any).hr_intake_auto_managed === true;
                    return (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className={`rounded-lg border p-3 flex items-center justify-between ${allowLeave ? "bg-success/5 border-success/30" : "bg-destructive/5 border-destructive/30"}`}>
                          <div>
                            <p className="text-sm font-medium">استقبال طلبات الإجازات</p>
                            <p className="text-[11px] text-muted-foreground">
                              {allowLeave ? "مفتوح — الموظف يقدر يقدّم طلب إجازة" : "مغلق — الموظف ما يقدر يقدّم طلب إجازة"}
                            </p>
                          </div>
                          <Switch
                            checked={allowLeave}
                            onCheckedChange={v => {
                              const patch: any = { hr_allow_leave_requests: v };
                              if (auto) patch.hr_intake_auto_managed = false;
                              persistIntake(patch);
                            }}
                          />
                        </div>
                        <div className={`rounded-lg border p-3 flex items-center justify-between ${allowAdv ? "bg-success/5 border-success/30" : "bg-destructive/5 border-destructive/30"}`}>
                          <div>
                            <p className="text-sm font-medium">استقبال طلبات السلف</p>
                            <p className="text-[11px] text-muted-foreground">
                              {allowAdv ? "مفتوح — الموظف يقدر يقدّم طلب سلفة" : "مغلق — الموظف ما يقدر يقدّم طلب سلفة"}
                            </p>
                          </div>
                          <Switch
                            checked={allowAdv}
                            onCheckedChange={v => {
                              const patch: any = { hr_allow_advance_requests: v };
                              if (auto) patch.hr_intake_auto_managed = false;
                              persistIntake(patch);
                            }}
                          />
                        </div>
                        {auto && (
                          <div className="md:col-span-2 text-[11px] text-warning bg-warning/5 border border-warning/30 rounded-md p-2">
                            تنبيه: "الإدارة التلقائية" مُفعّلة. إذا غيّرت المفتاح يدوياً، رح يتم إيقاف الإدارة التلقائية حتى لا يعيد فتح/إغلاق الطلبات من نفسه.
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* أيام محظورة لطلبات الإجازات */}
                  <LeaveBlackoutDatesEditor />

                  {/* سقف مبلغ السلفة + الاستثناءات */}
                  <AdvanceLimitEditor
                    maxAmount={
                      (companySettings as any).hr_advance_max_amount != null
                        ? Number((companySettings as any).hr_advance_max_amount)
                        : null
                    }
                    exemptIds={((companySettings as any).hr_advance_limit_exempt_employees ?? []) as string[]}
                    onSave={patch => persistIntake(patch)}
                  />

                  {/* Automatic scheduling — opt-in. When enabled, the manual
                       switches below become read-only and a background job
                       flips them based on the schedule + payroll-freeze rules. */}
                  {(() => {
                    const auto = (companySettings as any).hr_intake_auto_managed === true;
                    const advSch = (companySettings as any).hr_advance_intake_schedule_enabled === true;
                    const lvSch = (companySettings as any).hr_leave_intake_schedule_enabled === true;
                    const freeze = (companySettings as any).hr_payroll_freeze_enabled === true;
                    const salaryDay = (companySettings as any).hr_salary_day ?? 28;
                    return (
                      <div className="border rounded-lg p-3 space-y-3 bg-primary/5 border-primary/20">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-sm">الإدارة التلقائية</p>
                            <p className="text-[10px] text-muted-foreground">
                              يفتح ويغلق النماذج تلقائياً حسب الجدولة الشهرية وقاعدة التجميد قبل الرواتب. عند التفعيل يصبح المفتاحان أدناه للعرض فقط.
                            </p>
                          </div>
                          <Switch
                            checked={auto}
                            onCheckedChange={v => persistIntake({ hr_intake_auto_managed: v })}
                          />
                        </div>

                        {auto && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-primary/10">
                            {/* Advances schedule */}
                            <div className="space-y-2 rounded-md bg-background p-2 border">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium">جدولة السلف</p>
                                <Switch
                                  checked={advSch}
                                  onCheckedChange={v => persistIntake({ hr_advance_intake_schedule_enabled: v })}
                                />
                              </div>
                              <ScheduleModeEditor
                                disabled={!advSch}
                                mode={((companySettings as any).hr_advance_intake_schedule_mode ?? "monthly") as "monthly" | "weekly"}
                                openDay={(companySettings as any).hr_advance_intake_open_day ?? null}
                                closeDay={(companySettings as any).hr_advance_intake_close_day ?? null}
                                weekdays={((companySettings as any).hr_advance_intake_weekdays ?? []) as number[]}
                                onMode={v => persistIntake({ hr_advance_intake_schedule_mode: v })}
                                onOpenDay={n => persistIntake({ hr_advance_intake_open_day: n })}
                                onCloseDay={n => persistIntake({ hr_advance_intake_close_day: n })}
                                onWeekdays={arr => persistIntake({ hr_advance_intake_weekdays: arr })}
                              />
                            </div>

                            {/* Leaves schedule */}
                            <div className="space-y-2 rounded-md bg-background p-2 border">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium">جدولة الإجازات</p>
                                <Switch
                                  checked={lvSch}
                                  onCheckedChange={v => persistIntake({ hr_leave_intake_schedule_enabled: v })}
                                />
                              </div>
                              <ScheduleModeEditor
                                disabled={!lvSch}
                                mode={((companySettings as any).hr_leave_intake_schedule_mode ?? "monthly") as "monthly" | "weekly"}
                                openDay={(companySettings as any).hr_leave_intake_open_day ?? null}
                                closeDay={(companySettings as any).hr_leave_intake_close_day ?? null}
                                weekdays={((companySettings as any).hr_leave_intake_weekdays ?? []) as number[]}
                                onMode={v => persistIntake({ hr_leave_intake_schedule_mode: v })}
                                onOpenDay={n => persistIntake({ hr_leave_intake_open_day: n })}
                                onCloseDay={n => persistIntake({ hr_leave_intake_close_day: n })}
                                onWeekdays={arr => persistIntake({ hr_leave_intake_weekdays: arr })}
                              />
                            </div>

                            {/* Payroll freeze */}
                            <div className="space-y-2 rounded-md bg-background p-2 border">
                              <div className="flex items-center justify-between">
                                <p className="text-xs font-medium">تجميد السلف قبل الرواتب</p>
                                <Switch
                                  checked={freeze}
                                  onCheckedChange={v => persistIntake({ hr_payroll_freeze_enabled: v })}
                                />
                              </div>
                              <div>
                                <Label className="text-[10px]">عدد الأيام قبل يوم الراتب ({salaryDay})</Label>
                                <Input
                                  type="number" min={0} max={15}
                                  className="h-8 text-xs"
                                  disabled={!freeze}
                                  value={(companySettings as any).hr_payroll_freeze_days_before ?? 5}
                                  onChange={e => {
                                    const n = Math.max(0, Math.min(15, Number(e.target.value) || 0));
                                    persistIntake({ hr_payroll_freeze_days_before: n });
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {intakeSaving && (
                    <div className="flex justify-end">
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> يتم الحفظ...
                      </span>
                    </div>
                  )}

                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        )}

        <div className="w-full space-y-3" dir="rtl">
          {/* Password-reset requests — merged into the forms area (above the table) */}
          <PasswordResetRequestsPanel />
            {/* Category chips — D365 flat pill row */}
            <div className="flex flex-wrap gap-1 bg-white border border-[#EDEBE9] rounded-sm p-1.5" dir="rtl">
              {CATEGORY_CHIPS.map(c => {
                const active = filterCategory === c.key;
                const count = categoryCounts[c.key] || 0;
                const Icon = c.icon;
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => { setFilterCategory(c.key); setFilterType("all"); setPage(1); }}
                    className={`h-7 px-2.5 rounded-sm text-[12px] font-normal transition-colors flex items-center gap-1.5 border ${
                      active
                        ? "bg-[#EFF6FC] text-[#0F6CBD] border-[#0F6CBD]"
                        : "bg-transparent text-[#323130] border-transparent hover:bg-[#F3F2F1]"
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${active ? "text-[#0F6CBD]" : "text-[#605E5C]"}`} strokeWidth={1.75} />
                    <span>{c.label}</span>
                    <span className={`text-[10px] rounded-sm px-1 py-0 ${active ? "bg-[#0F6CBD]/15 text-[#0F6CBD]" : "bg-[#EDEBE9] text-[#605E5C]"}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Filters — D365 filter bar */}
            <div className="flex items-center gap-2 flex-wrap bg-white border border-[#EDEBE9] rounded-sm p-2" dir="rtl">
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[#605E5C] pointer-events-none" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="بحث باسم الموظف..."
                  className="ps-7 pe-2 w-[240px] h-8 text-[12px] rounded-sm border-[#EDEBE9] focus-visible:ring-1 focus-visible:ring-[#0F6CBD]"
                />
              </div>
              <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
                <SelectTrigger className="w-[130px] h-8 text-[12px] rounded-sm border-[#EDEBE9]"><SelectValue placeholder="الحالة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="pending">قيد المراجعة</SelectItem>
                  <SelectItem value="approved">تمت الموافقة</SelectItem>
                  <SelectItem value="rejected">مرفوض</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterArchive} onValueChange={v => { setFilterArchive(v as any); setPage(1); }}>
                <SelectTrigger className="w-[130px] h-8 text-[12px] rounded-sm border-[#EDEBE9]"><SelectValue placeholder="الأرشيف" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">النشط</SelectItem>
                  <SelectItem value="archived">الأرشيف</SelectItem>
                  <SelectItem value="all">الكل</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={v => { setFilterType(v); setPage(1); }}>
                <SelectTrigger className="w-[160px] h-8 text-[12px] rounded-sm border-[#EDEBE9]"><SelectValue placeholder="نوع النموذج" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  {Object.entries(formTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {branches.length > 0 && (
                <Select value={filterBranch} onValueChange={v => { setFilterBranch(v); setPage(1); }}>
                  <SelectTrigger className="w-[130px] h-8 text-[12px] rounded-sm border-[#EDEBE9]"><SelectValue placeholder="الفرع" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفروع</SelectItem>
                    {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {(() => {
                const receiveBranches = Array.from(new Set(
                  allItems.map((f: any) => (f.form_data?.receive_branch_name as string) || "").filter(Boolean)
                )).sort((a, b) => a.localeCompare(b, "ar"));
                if (receiveBranches.length === 0) return null;
                return (
                  <Select value={filterReceiveBranch} onValueChange={v => { setFilterReceiveBranch(v); setPage(1); }}>
                    <SelectTrigger className="w-[160px] h-8 text-[12px] rounded-sm border-[#EDEBE9]"><SelectValue placeholder="استلام من فرع" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">استلام من كل الفروع</SelectItem>
                      {receiveBranches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                    </SelectContent>
                  </Select>
                );
              })()}
              <HRDateRangeFilter
                from={dateFrom}
                to={dateTo}
                onFromChange={(v) => { setDateFrom(v); setPage(1); }}
                onToChange={(v) => { setDateTo(v); setPage(1); }}
                inlineLabels
                className="shrink-0"
                fieldClassName="w-auto [&_input]:h-8 [&_input]:w-[128px] [&_input]:text-[12px] [&_input]:rounded-sm [&_input]:border-[#EDEBE9]"
              />
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Card className="border-border overflow-hidden rounded-xl">
                {selectedIds.size > 0 && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-[#EFF6FC] border-b border-[#0F6CBD]/30 text-[12px]" dir="rtl">
                    <div className="flex items-center gap-2 text-[#0F6CBD] font-medium">
                      <span>تم تحديد {selectedIds.size}</span>
                      <button type="button" className="text-[11px] underline text-[#605E5C] hover:text-[#323130]" onClick={() => setSelectedIds(new Set())}>
                        إلغاء التحديد
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-[12px] text-emerald-700 border-emerald-300 hover:bg-emerald-50"
                        disabled={bulkProcessing} onClick={() => handleBulkAction("approved")}>
                        {bulkProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                        موافقة على المحدد
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-[12px] text-destructive border-destructive/40 hover:bg-destructive/5"
                        disabled={bulkProcessing} onClick={() => handleBulkAction("rejected")}>
                        {bulkProcessing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                        رفض المحدد
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-[12px]"
                        disabled={bulkProcessing} onClick={() => handleBulkOp("seen")}>
                        <Eye className="h-3.5 w-3.5" /> تمت الرؤية
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-[12px]"
                        disabled={bulkProcessing} onClick={() => handleBulkOp("archive")}>
                        <Archive className="h-3.5 w-3.5" /> أرشفة
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-[12px]"
                        disabled={bulkProcessing} onClick={() => handleBulkOp("unarchive")}>
                        <ArchiveRestore className="h-3.5 w-3.5" /> إلغاء الأرشفة
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 text-[12px] text-destructive border-destructive/40 hover:bg-destructive/5"
                        disabled={bulkProcessing} onClick={() => handleBulkOp("delete")}>
                        <Trash2 className="h-3.5 w-3.5" /> حذف
                      </Button>
                    </div>
                  </div>
                )}
                <div className="overflow-x-auto">
                  <Table dir="rtl">
                    <TableHeader className="bg-[#0D1B2E]">
                      <TableRow className="hover:bg-[#0D1B2E] border-b-0">
                        <TableHead className="text-center text-white font-semibold w-10">
                          {(() => {
                            const selectableIds = paginated.filter((f: any) => f._source === "employee_forms").map((f: any) => f.id);
                            const allSelected = selectableIds.length > 0 && selectableIds.every(id => selectedIds.has(id));
                            const someSelected = selectableIds.some(id => selectedIds.has(id));
                            return (
                              <Checkbox
                                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                                onCheckedChange={(v) => {
                                  setSelectedIds(prev => {
                                    const next = new Set(prev);
                                    if (v) selectableIds.forEach(id => next.add(id));
                                    else selectableIds.forEach(id => next.delete(id));
                                    return next;
                                  });
                                }}
                                aria-label="تحديد الكل"
                              />
                            );
                          })()}
                        </TableHead>
                        <TableHead className="text-right text-white font-semibold cursor-pointer select-none" onMouseDown={(e) => e.preventDefault()} onClick={(e) => toggleSort("name", e.shiftKey)}>الموظف{sortIndicator("name")}</TableHead>
                        <TableHead className="text-right text-white font-semibold cursor-pointer select-none" onMouseDown={(e) => e.preventDefault()} onClick={(e) => toggleSort("branch", e.shiftKey)}>الفرع{sortIndicator("branch")}</TableHead>
                        <TableHead className="text-right text-white font-semibold cursor-pointer select-none" onMouseDown={(e) => e.preventDefault()} onClick={(e) => toggleSort("form_type", e.shiftKey)}>النموذج{sortIndicator("form_type")}</TableHead>
                        <TableHead className="text-right text-white font-semibold">التفاصيل</TableHead>
                        {filterCategory === "leaves" && (
                          <TableHead className="text-right text-white font-semibold">سبب الإجازة</TableHead>
                        )}
                        {(filterCategory === "all" || filterCategory === "advances") && (
                          <TableHead className="text-right text-white font-semibold cursor-pointer select-none" onMouseDown={(e) => e.preventDefault()} onClick={(e) => toggleSort("receive_branch", e.shiftKey)}>استلام من فرع{sortIndicator("receive_branch")}</TableHead>
                        )}
                        {(filterCategory === "all" || filterCategory === "advances" || filterCategory === "loans") && (
                          <TableHead className="text-right text-white font-semibold cursor-pointer select-none" onMouseDown={(e) => e.preventDefault()} onClick={(e) => toggleSort("amount", e.shiftKey)}>المبلغ{sortIndicator("amount")}</TableHead>
                        )}
                        {filterCategory === "advances" && (
                          <TableHead className="text-right text-white font-semibold" title="مجموع السلف المصروفة للموظف خلال نفس الشهر (كما تظهر في محفظتي)">
                            مجموع السلف بالشهر
                          </TableHead>
                        )}
                        <TableHead className="text-right text-white font-semibold cursor-pointer select-none" onMouseDown={(e) => e.preventDefault()} onClick={(e) => toggleSort("date", e.shiftKey)}>التاريخ{sortIndicator("date")}</TableHead>
                        <TableHead className="text-right text-white font-semibold">الحالة</TableHead>
                        <TableHead className="text-right text-white font-semibold">ملاحظة / سبب الرفض</TableHead>
                        <TableHead className="text-center text-white font-semibold">الإجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginated.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={9 + (filterCategory === "leaves" ? 1 : 0) + ((filterCategory === "all" || filterCategory === "advances") ? 1 : 0) + ((filterCategory === "all" || filterCategory === "advances" || filterCategory === "loans") ? 1 : 0) + (filterCategory === "advances" ? 1 : 0)} className="text-center py-8 text-muted-foreground">لا يوجد نماذج</TableCell>
                        </TableRow>
                      ) : (
                        paginated.map(f => {
                          const st = statusConfig[f.status] || statusConfig.pending;
                          const emp = employeeMap[f.employee_id];
                          const amount = getFormAmount(f);
                          const details = getFormDetails(f);
                          const isPending = f.status === "pending";
                          const selectable = f._source === "employee_forms";
                          return (
                            <TableRow key={f.id} className="hover:bg-muted/40 border-b border-border">
                              <TableCell className="text-center align-middle">
                                {selectable ? (
                                  <Checkbox
                                    checked={selectedIds.has(f.id)}
                                    onCheckedChange={(v) => {
                                      setSelectedIds(prev => {
                                        const next = new Set(prev);
                                        if (v) next.add(f.id); else next.delete(f.id);
                                        return next;
                                      });
                                    }}
                                    aria-label="تحديد"
                                  />
                                ) : null}
                              </TableCell>
                              <TableCell className="font-medium text-sm whitespace-nowrap text-right">{emp?.name || "—"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap text-right">{emp?.branch || "—"}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap text-right">
                                {(() => {
                                  const Icon = formTypeIcons[f.form_type] || FileText;
                                  const label = f.form_type === "dynamic_template" && (f as any).title
                                    ? (f as any).title
                                    : (formTypeLabels[f.form_type] || f.form_type);
                                  return (
                                    <span className="inline-flex items-center gap-1.5">
                                      <Icon className="h-3.5 w-3.5 text-[#605E5C] shrink-0" />
                                      <span>{label}</span>
                                    </span>
                                  );
                                })()}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground text-right align-top whitespace-pre-wrap break-words" title={details}>{details || "—"}</TableCell>
                              {filterCategory === "leaves" && (() => {
                                const reasonText = displayReason(f?.form_data?.reason || f?.reason || "");
                                return (
                                  <TableCell className="text-xs text-right align-top" title={reasonText}>
                                    {reasonText ? (
                                      <span className="whitespace-pre-wrap break-words text-foreground">{reasonText}</span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                );
                              })()}
                              {(filterCategory === "all" || filterCategory === "advances") && (
                                <TableCell className="text-xs text-muted-foreground whitespace-nowrap text-right">
                                  {(f.form_data?.receive_branch_name as string) || "—"}
                                </TableCell>
                              )}
                              {(filterCategory === "all" || filterCategory === "advances" || filterCategory === "loans") && (
                                <TableCell className="text-sm font-semibold whitespace-nowrap text-right">
                                  {amount ? `${Number(amount).toLocaleString()} ₪` : "—"}
                                </TableCell>
                              )}
                              {filterCategory === "advances" && (() => {
                                const total = advanceTotals[monthKey(f.employee_id, f.created_at)] || 0;
                                return (
                                  <TableCell className="text-sm whitespace-nowrap text-right">
                                    {total > 0 ? (
                                      <span className="font-semibold text-primary">{total.toLocaleString()} ₪</span>
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </TableCell>
                                );
                              })()}
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap text-right">
                                <div className="flex flex-col leading-tight" dir="ltr">
                                  <span className="font-medium text-foreground">{format(new Date(f.created_at), "dd/MM/yyyy")}</span>
                                  <span className="text-[10px] text-muted-foreground">{format(new Date(f.created_at), "HH:mm")}</span>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex flex-col items-end gap-1">
                                  <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                                  {isPending && (f.form_type === "disciplinary_action" || f.form_type === "disciplinary") && (
                                    f.hr_recommendation ? (
                                      <span className="text-[10px] text-[#0F6CBD] whitespace-nowrap">
                                        بانتظار قرار الإدارة • توصية HR: {f.hr_recommendation === "approve" ? "اعتماد" : "رفض"}
                                      </span>
                                    ) : (
                                      <span className="text-[10px] text-amber-600 whitespace-nowrap">بانتظار رأي الموارد البشرية</span>
                                    )
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-xs text-right align-top min-w-[240px]">
                                {f.hr_recommendation_notes && (
                                  <span className="block text-[11px] text-[#0F6CBD] whitespace-pre-wrap break-words mb-1">
                                    رأي HR: {f.hr_recommendation_notes}
                                  </span>
                                )}
                                {f.final_decision_notes && (
                                  <span className="block text-[11px] text-foreground whitespace-pre-wrap break-words mb-1">
                                    قرار الإدارة: {f.final_decision_notes}
                                  </span>
                                )}
                                {f.review_notes ? (
                                  <span
                                    className={`whitespace-pre-wrap break-words block ${f.status === "rejected" ? "text-destructive" : "text-muted-foreground"}`}
                                    title={f.review_notes}
                                  >
                                    {f.review_notes}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center gap-1">
                                  {f._source !== "correction_requests" && (
                                    <>
                                      <Button size="sm" variant="ghost"
                                        className={`h-7 w-7 p-0 ${f.management_seen_at ? "text-sky-600 hover:bg-sky-50" : "text-[#605E5C] hover:bg-[#F3F2F1]"}`}
                                        onClick={() => !f.management_seen_at && handleMarkSeen(f)}
                                        disabled={!!f.management_seen_at || !!processing}
                                        title={f.management_seen_at ? `تمت الرؤية من الإدارة${f.management_seen_at ? " • " + new Date(f.management_seen_at).toLocaleString("ar") : ""}` : "وضع كتمت الرؤية من الإدارة"}
                                        aria-label="تمت الرؤية">
                                        {processing === f.id + "seen" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BadgeCheck className="h-3.5 w-3.5" />}
                                      </Button>
                                      {(f.form_type === "disciplinary_action" || f.form_type === "disciplinary") ? (
                                        <>
                                          <Button size="sm" variant="ghost"
                                            className={`h-7 w-7 p-0 ${isPending ? "text-emerald-600 hover:bg-emerald-50" : "text-muted-foreground/40"} ${f.hr_recommendation === "approve" ? "bg-emerald-50" : ""}`}
                                            onClick={() => isPending && handleHrRecommendation("approve", f)}
                                            disabled={!isPending || !!processing}
                                            title="توصية الموارد البشرية بالاعتماد (القرار النهائي للإدارة)" aria-label="توصية بالاعتماد">
                                            {processing === f.id + "hr_approve" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5" />}
                                          </Button>
                                          <Button size="sm" variant="ghost"
                                            className={`h-7 w-7 p-0 ${isPending ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground/40"} ${f.hr_recommendation === "reject" ? "bg-destructive/10" : ""}`}
                                            onClick={() => isPending && handleHrRecommendation("reject", f)}
                                            disabled={!isPending || !!processing}
                                            title="توصية الموارد البشرية بالرفض (القرار النهائي للإدارة)" aria-label="توصية بالرفض">
                                            {processing === f.id + "hr_reject" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsDown className="h-3.5 w-3.5" />}
                                          </Button>
                                        </>
                                      ) : (
                                        <>
                                          <Button size="sm" variant="ghost"
                                            className={`h-7 w-7 p-0 ${isPending ? "text-emerald-600 hover:bg-emerald-50" : "text-muted-foreground/40"}`}
                                            onClick={() => isPending && handleAction("approved", f)}
                                            disabled={!isPending || !!processing} title={isPending ? "موافقة" : "غير متاح"} aria-label="موافقة">
                                            {processing === f.id + "approved" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                          </Button>
                                          <Button size="sm" variant="ghost"
                                            className={`h-7 w-7 p-0 ${isPending ? "text-destructive hover:bg-destructive/10" : "text-muted-foreground/40"}`}
                                            onClick={() => isPending && handleAction("rejected", f)}
                                            disabled={!isPending || !!processing} title={isPending ? "رفض" : "غير متاح"} aria-label="رفض">
                                            {processing === f.id + "rejected" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                                          </Button>
                                        </>
                                      )}
                                      <Button size="sm" variant="ghost"
                                        className="h-7 w-7 p-0 text-[#605E5C] hover:bg-[#F3F2F1]"
                                        onClick={() => handleArchiveToggle(f)}
                                        disabled={!!processing}
                                        title={f.archived_at ? "إلغاء الأرشفة" : "أرشفة"}
                                        aria-label={f.archived_at ? "إلغاء الأرشفة" : "أرشفة"}>
                                        {processing === f.id + "archive" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : (f.archived_at ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />)}
                                      </Button>
                                    </>
                                  )}
                                  {f._source === "correction_requests" ? (
                                    <Button size="sm" variant="ghost" className="h-7 px-2 gap-1 text-xs"
                                      title="مراجعة في صفحة الحضور"
                                      onClick={() => navigate(`/hr-attendance?tab=corrections&requestId=${f.id}`)}>
                                      <Eye className="h-3.5 w-3.5" /> مراجعة
                                    </Button>
                                  ) : (
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="عرض التفاصيل" aria-label="عرض التفاصيل" onClick={() => { setSelectedForm(f); setReviewNotes(f.review_notes || ""); setEditMode(false); setEditedData({ ...(f.form_data || {}) }); }}>
                                      <Eye className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {f._source === "employee_forms" && financialTypes.includes(f.form_type) && isPending && (
                                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-[#0F6CBD] hover:bg-[#EFF6FC]"
                                      title="تعديل المبلغ / فرع الاستلام" aria-label="تعديل الطلب"
                                      onClick={() => { setSelectedForm(f); setReviewNotes(f.review_notes || ""); setEditedData({ ...(f.form_data || {}) }); setEditMode(true); }}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                  )}
                                  {f._source !== "correction_requests" && (
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="المزيد" aria-label="المزيد">
                                        <MoreHorizontal className="h-3.5 w-3.5" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="min-w-[140px]">
                                      <DropdownMenuItem onClick={() => setPrintForm(f)} className="gap-2">
                                        <Printer className="h-3.5 w-3.5" /> طباعة
                                      </DropdownMenuItem>
                                      {canDelete && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem onClick={() => handleDelete(f)} disabled={!!processing} className="gap-2 text-destructive focus:text-destructive">
                                            <Trash2 className="h-3.5 w-3.5" /> حذف
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      )}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="bg-[#F3F2F1] hover:bg-[#F3F2F1] font-semibold">
                        {(() => {
                          const showLeaveReason = filterCategory === "leaves";
                          const showReceive = filterCategory === "all" || filterCategory === "advances";
                          const showAmount = filterCategory === "all" || filterCategory === "advances" || filterCategory === "loans";
                          // Fixed cols before amount: checkbox, employee, branch, form_type, details (=5) + leaveReason? + receive?
                          const beforeAmount = 5 + (showLeaveReason ? 1 : 0) + (showReceive ? 1 : 0);
                          // After amount: date, status, notes, action = 4
                          return (
                            <>
                              <TableCell colSpan={beforeAmount} className="text-right text-[12px] text-[#0D1B2E]">
                                الإجمالي ({sorted.length} سجل)
                              </TableCell>
                              {showAmount && (
                                <TableCell className="text-right text-sm font-bold text-[#0D1B2E] whitespace-nowrap tabular-nums">
                                  {sorted.reduce((sum, f) => sum + (Number(getFormAmount(f)) || 0), 0).toLocaleString()} ₪
                                </TableCell>
                              )}
                              <TableCell colSpan={4}></TableCell>
                            </>
                          );
                        })()}
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between p-3 border-t border-border flex-wrap gap-2">
                    <span className="text-xs text-muted-foreground">
                      صفحة {page} من {totalPages} • {sorted.length} سجل
                    </span>
                    <div className="flex items-center gap-1" dir="ltr">
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-sm" disabled={page === 1} onClick={() => setPage(1)} title="الصفحة الأولى">
                        <ChevronsRight className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)} title="السابق">
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      {(() => {
                        const pages: (number | "…")[] = [];
                        const add = (n: number) => { if (!pages.includes(n)) pages.push(n); };
                        add(1);
                        for (let i = page - 2; i <= page + 2; i++) if (i > 1 && i < totalPages) add(i);
                        if (totalPages > 1) add(totalPages);
                        const out: (number | "…")[] = [];
                        pages.forEach((p, i) => {
                          if (i > 0 && typeof p === "number" && typeof pages[i - 1] === "number" && (p as number) - (pages[i - 1] as number) > 1) out.push("…");
                          out.push(p);
                        });
                        return out.map((p, idx) =>
                          p === "…" ? (
                            <span key={`e${idx}`} className="px-1 text-xs text-muted-foreground">…</span>
                          ) : (
                            <Button key={p} size="sm" variant={p === page ? "default" : "outline"} className="h-8 min-w-[32px] px-2 rounded-sm text-xs" onClick={() => setPage(p as number)}>
                              {p}
                            </Button>
                          )
                        );
                      })()}
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} title="التالي">
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 w-8 p-0 rounded-sm" disabled={page === totalPages} onClick={() => setPage(totalPages)} title="الصفحة الأخيرة">
                        <ChevronsLeft className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )}
        </div>
      </div>

      {/* Policies & regulations — opened from the top command bar */}
      <Dialog open={showPoliciesDialog} onOpenChange={setShowPoliciesDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>السياسات واللوائح</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold text-sm">السياسات واللوائح المرفوعة</h3>
              <Button size="sm" className="gap-2 rounded-xl" onClick={() => setShowUploadPolicy(true)}>
                <Upload className="h-4 w-4" /> رفع سياسة جديدة
              </Button>
            </div>
            <div className="space-y-2">
              {policies.length === 0 ? (
                <Card className="border-border">
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>لم يتم رفع سياسات بعد</p>
                  </CardContent>
                </Card>
              ) : (
                policies.map(p => (
                  <Card key={p.id} className="border-border">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-primary" />
                        <div>
                          <h4 className="text-sm font-medium">{p.title}</h4>
                          {p.description && <p className="text-xs text-muted-foreground">{p.description}</p>}
                          <Badge variant="outline" className="text-[9px] mt-1">{p.category}</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => openPolicyFile(p.file_url)}>
                          <Eye className="h-3 w-3" /> عرض
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1" onClick={() => openEditPolicy(p)}>
                          <Pencil className="h-3 w-3" /> تعديل
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1 text-destructive hover:text-destructive" onClick={() => deletePolicy(p)}>
                          <Trash2 className="h-3 w-3" /> حذف
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Form detail dialog */}
      <Dialog open={!!selectedForm} onOpenChange={o => { if (!o) setSelectedForm(null); }}>
        <DialogContent
          className="bg-card border-border p-0 gap-0 overflow-hidden
                     w-screen h-[100dvh] max-w-none rounded-none
                     sm:w-auto sm:h-auto sm:max-w-3xl sm:max-h-[90vh] sm:rounded-2xl"
          dir="rtl"
        >
          <div className="flex flex-col h-full max-h-[100dvh] sm:max-h-[90vh]">
          <DialogHeader>
            <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-border bg-muted/30">
            <DialogTitle className="text-base sm:text-lg">
              {selectedForm?.form_type === "dynamic_template" && (selectedForm as any)?.title
                ? `📋 ${(selectedForm as any).title}`
                : (formTypeLabels[selectedForm?.form_type] || selectedForm?.form_type)}
            </DialogTitle>
            <DialogDescription className="text-[11px] sm:text-xs mt-1">
              مقدم من: {employeeMap[selectedForm?.employee_id]?.name || "—"}
              {employeeMap[selectedForm?.employee_id]?.branch && ` — ${employeeMap[selectedForm?.employee_id]?.branch}`}
              {" — "}{selectedForm && format(new Date(selectedForm.created_at), "dd/MM/yyyy HH:mm")}
            </DialogDescription>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3">
            {(() => {
              if (!selectedForm) return null;
              // Dynamic templates: render with their schema for a professional view.
              if (selectedForm.form_type === "dynamic_template") {
                const tid = (selectedForm as any).template_id as string | undefined;
                const tpl = tid ? templateSchemas[tid] : undefined;
                const isMonthly = (tpl?.schema as any)?.kind === "monthly_inventory" || /جرد\s*شهري/.test(tpl?.name || (selectedForm as any)?.title || "");
                if (isMonthly) {
                  return <MonthlyInventoryView data={selectedForm.form_data} />;
                }
                return (
                  <DynamicTemplateView
                    schema={tpl?.schema}
                    data={selectedForm.form_data}
                    title={(selectedForm as any).title || tpl?.name}
                  />
                );
              }
              const groups = getDetailGroups(selectedForm);
              const hasAnyDetail = groups.some(g => g.title === "تفاصيل النموذج" && g.fields.length);
              return (
                <>
                  {groups.map(g => (
                    <div key={g.title} className="bg-muted/30 rounded-xl p-4 space-y-2">
                      <div className="text-xs font-semibold text-foreground/80 mb-1">{g.title}</div>
                      {g.fields.map((fld, i) => {
                        const val = fld.value;
                        const isAttachment = fld.isUrl || /^https?:\/\//i.test(String(val || ""));
                        return (
                          <div key={`${fld.label}-${i}`} className="flex justify-between gap-3 text-sm">
                            <span className="text-muted-foreground shrink-0">{fld.label}:</span>
                            {isAttachment ? (
                              <button type="button" onClick={() => openPolicyFile(String(val))} className="text-primary hover:underline inline-flex items-center gap-1 truncate">
                                <Download className="h-3.5 w-3.5" /> فتح المرفق
                              </button>
                            ) : (
                              <span className="font-medium text-right break-words whitespace-pre-wrap">
                                {typeof val === "object" ? JSON.stringify(val) : String(val)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                  {!hasAnyDetail && (
                    <div className="text-center text-xs text-muted-foreground py-2">لا توجد تفاصيل إضافية</div>
                  )}
                  {/* HR modification banner for advances/loans */}
                  {financialTypes.includes(selectedForm?.form_type) && selectedForm?.form_data?.hr_modified && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs space-y-1">
                      <div className="font-semibold text-amber-900">تم تعديل المبلغ من قبل الموارد البشرية</div>
                      <div className="text-amber-900/80">
                        الأصلي: <span className="font-bold tabular-nums">{Number(selectedForm.form_data.original_amount || 0).toLocaleString()} ₪</span>
                        {" ← "}
                        المعتمد: <span className="font-bold tabular-nums">{Number(selectedForm.form_data.amount ?? selectedForm.form_data.loan_amount ?? 0).toLocaleString()} ₪</span>
                      </div>
                      {selectedForm.form_data.admin_note && (
                        <div className="text-amber-900/80">ملاحظة: {selectedForm.form_data.admin_note}</div>
                      )}
                    </div>
                  )}
                  {/* Always-visible reason summary (for legacy rows like complaints/content) */}
                  {(() => {
                    const reasonText = displayReason(selectedForm?.reason || selectedForm?.form_data?.reason || "");
                    if (!reasonText) return null;
                    if (groups.some(g => g.fields.some(fld => fld.label === "السبب" || fld.label === "المحتوى" || fld.label === "الرسالة"))) return null;
                    return (
                      <div className="bg-muted/30 rounded-xl p-4 text-sm whitespace-pre-wrap">
                        <div className="text-xs font-semibold text-foreground/80 mb-1">الرسالة</div>
                        {reasonText}
                      </div>
                    );
                  })()}
                </>
              );
            })()}
            <div className="flex items-center gap-2 pt-2 border-t border-border/60">
              <span className="text-sm text-muted-foreground">الحالة الحالية:</span>
              <Badge variant={statusConfig[selectedForm?.status]?.variant || "outline"}>
                {statusConfig[selectedForm?.status]?.label || selectedForm?.status}
              </Badge>
              {selectedForm?.status === "pending" && selectedForm?.form_type === "employee_info" && (
                <Button size="sm" variant="outline" className="mr-auto h-7 text-xs gap-1 rounded-lg" onClick={() => setEditMode(m => !m)}>
                  {editMode ? "إلغاء التعديل" : "تعديل البيانات"}
                </Button>
              )}
              {selectedForm?.status === "pending" && financialTypes.includes(selectedForm?.form_type) && (
                <Button size="sm" variant="outline" className="mr-auto h-7 text-xs gap-1 rounded-lg" onClick={() => setEditMode(m => !m)}>
                  {editMode ? "إلغاء التعديل" : "تعديل المبلغ"}
                </Button>
              )}
            </div>
            {editMode && financialTypes.includes(selectedForm?.form_type) && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <div className="text-xs font-semibold text-amber-900">
                  تعديل مبلغ {selectedForm?.form_type === "advance_request" ? "السلفة" : "القرض"} قبل الاعتماد
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">المبلغ المعتمد (₪)</label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    dir="ltr"
                    className="rounded-xl h-11 text-lg font-bold tabular-nums"
                    value={editedData.amount ?? editedData.loan_amount ?? ""}
                    onChange={e => setEditedData(p => ({
                      ...p,
                      amount: e.target.value,
                      ...(p.loan_amount !== undefined ? { loan_amount: e.target.value } : {}),
                    }))}
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">
                    المبلغ الأصلي المطلوب: {Number(selectedForm?.form_data?.amount || selectedForm?.form_data?.loan_amount || 0).toLocaleString()} ₪
                  </p>
                </div>
                {selectedForm?.form_type === "loan_request" && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">قسط شهري (اختياري)</label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      dir="ltr"
                      className="rounded-xl h-10 tabular-nums"
                      value={editedData.installment_amount ?? ""}
                      onChange={e => setEditedData(p => ({ ...p, installment_amount: e.target.value }))}
                    />
                  </div>
                )}
                {selectedForm?.form_type === "advance_request" && editBranches.length > 0 && (
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">فرع الاستلام</label>
                    <Select
                      value={editedData.receive_branch_id || ""}
                      onValueChange={(v) => {
                        const b = editBranches.find(x => x.id === v);
                        setEditedData(p => ({ ...p, receive_branch_id: v, receive_branch_name: b?.name || "" }));
                      }}
                    >
                      <SelectTrigger className="rounded-xl h-10"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                      <SelectContent>{editBranches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">ملاحظة للموظف (اختياري)</label>
                  <Textarea
                    rows={2}
                    className="rounded-xl"
                    value={editedData.admin_note ?? ""}
                    onChange={e => setEditedData(p => ({ ...p, admin_note: e.target.value }))}
                    placeholder="مثلاً: تم تعديل المبلغ لأن…"
                  />
                </div>
                <Button className="w-full gap-2 rounded-xl" onClick={saveEdits} disabled={savingEdit}>
                  {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  حفظ المبلغ
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">
                  احفظ التعديلات أولاً ثم اضغط "موافقة" — سيصل إشعار للموظف بالمبلغ المعتمد.
                </p>
              </div>
            )}
            {editMode && selectedForm?.form_type === "employee_info" && (
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-3">
                <div className="text-xs font-semibold text-primary">تعديل بيانات الموظف قبل الاعتماد</div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">الاسم الكامل</label>
                  <Input value={editedData.name || ""} onChange={e => setEditedData(p => ({ ...p, name: e.target.value }))} className="rounded-xl h-10" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">رقم الهوية</label>
                    <Input value={editedData.id_number || ""} onChange={e => setEditedData(p => ({ ...p, id_number: e.target.value.replace(/\D/g, "").slice(0,9) }))} dir="ltr" className="rounded-xl h-10" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">تاريخ الميلاد</label>
                    <Input type="date" value={editedData.date_of_birth || ""} onChange={e => setEditedData(p => ({ ...p, date_of_birth: e.target.value }))} dir="ltr" className="rounded-xl h-10" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">تاريخ بدء العمل</label>
                  <Input type="date" value={editedData.malaky_start_date || ""} onChange={e => setEditedData(p => ({ ...p, malaky_start_date: e.target.value }))} dir="ltr" className="rounded-xl h-10" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">الفرع</label>
                    <Select value={editedData.branch_id || ""} onValueChange={(v) => {
                      const b = editBranches.find(x => x.id === v);
                      setEditedData(p => ({ ...p, branch_id: v, branch: b?.name || "" }));
                    }}>
                      <SelectTrigger className="rounded-xl h-10"><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                      <SelectContent>{editBranches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">القسم</label>
                    <Select value={editedData.department_id || ""} onValueChange={(v) => {
                      const d = editDepts.find(x => x.id === v);
                      setEditedData(p => ({ ...p, department_id: v, department: d?.name || "" }));
                    }}>
                      <SelectTrigger className="rounded-xl h-10"><SelectValue placeholder="اختر القسم" /></SelectTrigger>
                      <SelectContent>{editDepts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">المستوى التعليمي</label>
                  <Select value={editedData.education || ""} onValueChange={(v) => setEditedData(p => ({ ...p, education: v }))}>
                    <SelectTrigger className="rounded-xl h-10"><SelectValue placeholder="اختر المستوى" /></SelectTrigger>
                    <SelectContent>
                      {["ابتدائي","إعدادي","ثانوي","توجيهي","دبلوم","بكالوريوس","ماجستير","دكتوراه","أخرى"].map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">الحالة الاجتماعية</label>
                    <Select value={editedData.marital_status || ""} onValueChange={(v) => setEditedData(p => ({ ...p, marital_status: v }))}>
                      <SelectTrigger className="rounded-xl h-10"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {["أعزب","متزوج","مطلق","أرمل"].map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">عدد الأبناء</label>
                    <Input type="number" min={0} value={editedData.children_count ?? ""} onChange={e => setEditedData(p => ({ ...p, children_count: e.target.value }))} dir="ltr" className="rounded-xl h-10" />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">رقم الواتساب</label>
                  <Input value={editedData.whatsapp || ""} onChange={e => setEditedData(p => ({ ...p, whatsapp: e.target.value }))} dir="ltr" className="rounded-xl h-10" placeholder="+972..." />
                </div>
                <Button className="w-full gap-2 rounded-xl" onClick={saveEdits} disabled={savingEdit}>
                  {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  حفظ التعديلات
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">احفظ التعديلات أولاً ثم اضغط "موافقة" لاعتماد البيانات الجديدة على ملف الموظف.</p>
              </div>
            )}
            {selectedForm?.status === "pending" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">ملاحظات المراجعة</label>
                  <Textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={2} className="rounded-xl" placeholder="أضف ملاحظة..." />
                </div>
                <div className="flex gap-2 sticky bottom-0 bg-card pt-2">
                  {(selectedForm.form_type === "disciplinary_action" || selectedForm.form_type === "disciplinary") ? (
                    <>
                      <Button className="flex-1 gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleHrRecommendation("approve", selectedForm)} disabled={!!processing}>
                        <ThumbsUp className="h-4 w-4" /> توصية بالاعتماد
                      </Button>
                      <Button variant="destructive" className="flex-1 gap-2 rounded-xl" onClick={() => handleHrRecommendation("reject", selectedForm)} disabled={!!processing}>
                        <ThumbsDown className="h-4 w-4" /> توصية بالرفض
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button className="flex-1 gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleAction("approved", selectedForm)} disabled={!!processing}>
                        <CheckCircle2 className="h-4 w-4" /> موافقة
                      </Button>
                      <Button variant="destructive" className="flex-1 gap-2 rounded-xl" onClick={() => handleAction("rejected", selectedForm)} disabled={!!processing}>
                        <XCircle className="h-4 w-4" /> رفض
                      </Button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload/Edit Policy Dialog */}
      <Dialog open={showUploadPolicy} onOpenChange={o => { if (!o) closePolicyDialog(); }}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editPolicyId ? "تعديل السياسة" : "رفع سياسة جديدة"}</DialogTitle>
            <DialogDescription className="text-xs">
              {editPolicyId ? "عدّل البيانات أو ارفع ملف PDF جديد لاستبدال الحالي" : "ارفع ملف PDF للسياسة ليظهر للموظفين"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">اسم السياسة *</label>
              <Input value={policyForm.title} onChange={e => setPolicyForm(p => ({ ...p, title: e.target.value }))} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">الوصف</label>
              <Textarea value={policyForm.description} onChange={e => setPolicyForm(p => ({ ...p, description: e.target.value }))} rows={2} className="rounded-xl" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">التصنيف *</label>
              <Select value={policyForm.category} onValueChange={v => setPolicyForm(p => ({ ...p, category: v }))}>
                <SelectTrigger className="rounded-xl"><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="incentive_policy">نظام التحفيز</SelectItem>
                  <SelectItem value="loan_policy">سياسة القرض الحسن</SelectItem>
                  <SelectItem value="late_policy">سياسة التأخر</SelectItem>
                  <SelectItem value="disciplinary_policy">لائحة الجزاءات التأديبية</SelectItem>
                  <SelectItem value="admin_decisions">قرارات إدارية</SelectItem>
                  <SelectItem value="general">عام</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                {editPolicyId ? "ملف PDF (اختياري — لاستبدال الحالي)" : "ملف PDF *"}
              </label>
              <label className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors">
                {uploadingPolicy ? <Loader2 className="h-6 w-6 animate-spin" /> : (
                  <><Upload className="h-6 w-6 text-muted-foreground" /><span className="text-xs text-primary">{editPolicyId ? "اختر ملف PDF جديد" : "اختر ملف PDF"}</span></>
                )}
                <input type="file" className="hidden" accept=".pdf" onChange={handleUploadPolicy} disabled={!policyForm.title || !policyForm.category || uploadingPolicy} />
              </label>
            </div>
            {editPolicyId && (
              <Button className="w-full rounded-xl gap-2" onClick={savePolicyMeta} disabled={savingPolicy || !policyForm.title || !policyForm.category}>
                {savingPolicy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                حفظ التعديلات بدون استبدال الملف
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {/* Print Preview */}
      <EmployeeFormPrintView
        open={!!printForm}
        onClose={() => setPrintForm(null)}
        form={printForm}
        employeeName={employeeMap[printForm?.employee_id]?.name || "—"}
        employeeBranch={employeeMap[printForm?.employee_id]?.branch || "—"}
        companyName={companySettings?.company_name}
        companyLogo={companySettings?.logo_url}
      />

      {/* Employee picker for direct advance creation */}
      <Dialog open={addAdvOpen} onOpenChange={setAddAdvOpen}>
        <DialogContent dir="rtl" className="max-w-md">
          <DialogHeader>
            <DialogTitle>اختر الموظف لتسجيل السلفة</DialogTitle>
            <DialogDescription>ابحث عن الموظف ثم اضغط اسمه للمتابعة</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="ابحث بالاسم..."
            value={advPickerQuery}
            onChange={(e) => setAdvPickerQuery(e.target.value)}
            className="h-9"
          />
          <div className="max-h-[50vh] overflow-y-auto border rounded-md divide-y">
            {Object.entries(employeeMap)
              .filter(([, e]) => !advPickerQuery || (e.name || "").toLowerCase().includes(advPickerQuery.toLowerCase()))
              .sort(([, a], [, b]) => (a.name || "").localeCompare(b.name || "", "ar"))
              .slice(0, 200)
              .map(([id, e]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setAdvChosenEmp({ id, name: e.name });
                    setAddAdvOpen(false);
                  }}
                  className="w-full text-right px-3 py-2 hover:bg-muted/50 text-sm flex items-center justify-between"
                >
                  <span className="font-medium">{e.name}</span>
                  {e.branch && <span className="text-[10px] text-muted-foreground">{e.branch}</span>}
                </button>
              ))}
            {Object.keys(employeeMap).length === 0 && (
              <div className="p-4 text-center text-muted-foreground text-sm">لا يوجد موظفون</div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {advChosenEmp && dataOwnerId && (
        <AdvanceRequestModal
          open={!!advChosenEmp}
          onClose={() => setAdvChosenEmp(null)}
          employeeId={advChosenEmp.id}
          employeeName={advChosenEmp.name}
          userId={dataOwnerId}
          onSuccess={() => { fetchForms(); }}
        />
      )}
    </div>
  );
}
