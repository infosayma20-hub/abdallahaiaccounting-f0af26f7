import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, CheckCircle2, XCircle, Eye, Upload, FileText,
  Download, ChevronLeft, ChevronRight, Loader2, Trash2, Printer, MoreHorizontal, Pencil
} from "lucide-react";
import EmployeeFormPrintView from "@/components/employee/EmployeeFormPrintView";
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

const formTypeLabels: Record<string, string> = {
  leave_request: "🏖️ طلب إجازة",
  advance_request: "💰 طلب سلفة",
  loan_request: "🏦 طلب قرض حسن",
  correction_request: "✏️ تصحيح بصمة",
  overtime_request: "⏱️ طلب أوفرتايم",
  hr_message: "💬 رسالة لـ HR",
  employee_info: "📋 تعبئة معلومات",
  birthday_whatsapp: "🎂 تاريخ الميلاد والواتساب",
  complaints: "💬 شكاوى وملاحظات",
  disciplinary_action: "⚖️ طلب إجراء عقابي",
  facility_quality: "🏢 جودة المرافق",
  equipment_fault: "🔧 إبلاغ أعطال",
  inventory_balance: "📦 رصيد الأصناف",
  // Virtual types from correction_requests:
  _attendance_correction: "✏️ تصحيح بصمة",
  _hr_message: "💬 رسالة HR",
  _hr_inquiry: "❓ طلب توضيح",
  _hr_warning: "⚠️ إنذار",
  _hr_penalty: "⚖️ إجراء عقابي",
};

const statusConfig: Record<string, { label: string; variant: "default" | "destructive" | "outline" | "secondary"; color: string }> = {
  pending: { label: "قيد المراجعة", variant: "outline", color: "text-warning" },
  approved: { label: "تمت الموافقة", variant: "default", color: "text-emerald-600" },
  rejected: { label: "مرفوض", variant: "destructive", color: "text-destructive" },
};

const financialTypes = ["advance_request", "loan_request"];

export default function EmployeeFormsManagementPage() {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const { settings: companySettings } = useCompanySettings();
  const { can, isAdmin } = useHRManagerPermissions();
  const navigate = useNavigate();
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
  const [filterStatus, setFilterStatus] = useState("all");
  const [dateFrom, setDateFrom] = useState(() => getDefaultDateRangeThisYear().fromISO);
  const [dateTo, setDateTo] = useState(() => getDefaultDateRangeThisYear().toISO);
  const [filterBranch, setFilterBranch] = useState("all");
  const [selectedForm, setSelectedForm] = useState<any | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editedData, setEditedData] = useState<Record<string, any>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editBranches, setEditBranches] = useState<{ id: string; name: string }[]>([]);
  const [editDepts, setEditDepts] = useState<{ id: string; name: string }[]>([]);
  const [processing, setProcessing] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const perPage = 20;

  const [policiesTab, setPoliciesTab] = useState("forms");
  const [policies, setPolicies] = useState<any[]>([]);
  const [showUploadPolicy, setShowUploadPolicy] = useState(false);
  const [policyForm, setPolicyForm] = useState({ title: "", description: "", category: "" });
  const [uploadingPolicy, setUploadingPolicy] = useState(false);
  const [editPolicyId, setEditPolicyId] = useState<string | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);

  useEffect(() => {
    if (user && dataOwnerId) {
      fetchForms();
      fetchCorrections();
      fetchEmployees();
      fetchPolicies();
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

  const fetchPolicies = async () => {
    const { data } = await supabase
      .from("employee_policy_documents")
      .select("*")
      .order("created_at", { ascending: false });
    setPolicies(data || []);
  };

  const handleAction = async (action: "approved" | "rejected", form: any) => {
    if (!user) return;
    setProcessing(form.id + action);
    const notes = form.id === selectedForm?.id ? reviewNotes : null;
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
            const { error: upErr } = await supabase.from("employees").update(patch).eq("id", form.employee_id);
            if (upErr) toast.error("تم اعتماد الطلب لكن فشل تحديث ملف الموظف: " + upErr.message);
          }
        } catch (e: any) {
          toast.error("تعذّر مزامنة البيانات: " + (e?.message || ""));
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
    const { error } = await supabase
      .from("employee_forms")
      .update({ form_data: editedData } as any)
      .eq("id", selectedForm.id);
    setSavingEdit(false);
    if (error) { toast.error("فشل حفظ التعديلات: " + error.message); return; }
    toast.success("تم حفظ التعديلات ✅");
    setSelectedForm({ ...selectedForm, form_data: editedData });
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
    if (filterType !== "all" && f.form_type !== filterType) return false;
    if (filterStatus !== "all" && f.status !== filterStatus) return false;
    const emp = employeeMap[f.employee_id];
    if (filterBranch !== "all" && emp?.branch !== filterBranch) return false;
    if (search) {
      const empName = emp?.name || "";
      const det = (f._source === "correction_requests" ? f._details : "") || "";
      if (!empName.includes(search) && !f.form_type.includes(search) && !det.includes(search)) return false;
    }
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

  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const counts = {
    pending: allItems.filter(f => f.status === "pending").length,
    approved: allItems.filter(f => f.status === "approved").length,
    rejected: allItems.filter(f => f.status === "rejected").length,
    total: allItems.length,
  };

  // Financial totals for filtered results
  const financialFiltered = filtered.filter(f => financialTypes.includes(f.form_type));
  const totalAmount = financialFiltered.reduce((sum, f) => sum + (Number(getFormAmount(f)) || 0), 0);
  const pendingAmount = financialFiltered.filter(f => f.status === "pending").reduce((sum, f) => sum + (Number(getFormAmount(f)) || 0), 0);
  const approvedAmount = financialFiltered.filter(f => f.status === "approved").reduce((sum, f) => sum + (Number(getFormAmount(f)) || 0), 0);

  return (
    <div className="min-h-screen bg-background p-4 md:p-6" dir="rtl" style={{ fontFamily: "Tajawal, sans-serif" }}>
      <div className="max-w-7xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold">طلبات الموظفين</h1>
          </div>
        </div>

        <PasswordResetRequestsPanel />

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "الإجمالي", value: counts.total, color: "text-foreground" },
            { label: "قيد المراجعة", value: counts.pending, color: "text-warning" },
            { label: "تمت الموافقة", value: counts.approved, color: "text-emerald-600" },
            { label: "مرفوض", value: counts.rejected, color: "text-destructive" },
          ].map(s => (
            <Card key={s.label} className="border-border">
              <CardContent className="p-4 text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Financial summary when filtering financial types */}
        {(filterType === "advance_request" || filterType === "loan_request" || financialFiltered.length > 0) && (
          <div className="grid grid-cols-3 gap-3">
            <Card className="border-border bg-muted/30">
              <CardContent className="p-3 text-center">
                <div className="text-lg font-bold text-foreground">{totalAmount.toLocaleString()} ₪</div>
                <p className="text-[10px] text-muted-foreground">إجمالي المبالغ ({financialFiltered.length})</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-muted/30">
              <CardContent className="p-3 text-center">
                <div className="text-lg font-bold text-warning">{pendingAmount.toLocaleString()} ₪</div>
                <p className="text-[10px] text-muted-foreground">قيد المراجعة</p>
              </CardContent>
            </Card>
            <Card className="border-border bg-muted/30">
              <CardContent className="p-3 text-center">
                <div className="text-lg font-bold text-emerald-600">{approvedAmount.toLocaleString()} ₪</div>
                <p className="text-[10px] text-muted-foreground">تمت الموافقة</p>
              </CardContent>
            </Card>
          </div>
        )}

        <Tabs value={policiesTab} onValueChange={setPoliciesTab} className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="forms" className="gap-1">
              <FileText className="h-3.5 w-3.5" /> الطلبات والنماذج
            </TabsTrigger>
            <TabsTrigger value="policies" className="gap-1">
              <FileText className="h-3.5 w-3.5" /> السياسات واللوائح
            </TabsTrigger>
          </TabsList>

          <TabsContent value="forms" className="mt-4 space-y-3">
            {/* Filters — same pattern as Attendance toolbar */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="h-4 w-4 absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="بحث باسم الموظف..."
                  className="ps-2 pe-8 w-[260px] h-9"
                />
              </div>
              <Select value={filterStatus} onValueChange={v => { setFilterStatus(v); setPage(1); }}>
                <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="الحالة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="pending">قيد المراجعة</SelectItem>
                  <SelectItem value="approved">تمت الموافقة</SelectItem>
                  <SelectItem value="rejected">مرفوض</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterType} onValueChange={v => { setFilterType(v); setPage(1); }}>
                <SelectTrigger className="w-[170px] h-9"><SelectValue placeholder="نوع النموذج" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الأنواع</SelectItem>
                  {Object.entries(formTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {branches.length > 0 && (
                <Select value={filterBranch} onValueChange={v => { setFilterBranch(v); setPage(1); }}>
                  <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="الفرع" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفروع</SelectItem>
                    {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <HRDateRangeFilter
                from={dateFrom}
                to={dateTo}
                onFromChange={(v) => { setDateFrom(v); setPage(1); }}
                onToChange={(v) => { setDateTo(v); setPage(1); }}
                fieldClassName="w-[160px]"
              />
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Card className="border-border overflow-hidden rounded-xl">
                <div className="overflow-x-auto">
                  <Table dir="rtl">
                    <TableHeader className="bg-[#0D1B2E]">
                      <TableRow className="hover:bg-[#0D1B2E] border-b-0">
                        <TableHead className="text-right text-white font-semibold">الموظف</TableHead>
                        <TableHead className="text-right text-white font-semibold">الفرع</TableHead>
                        <TableHead className="text-right text-white font-semibold">النموذج</TableHead>
                        <TableHead className="text-right text-white font-semibold">التفاصيل</TableHead>
                        <TableHead className="text-right text-white font-semibold">المبلغ</TableHead>
                        <TableHead className="text-right text-white font-semibold">التاريخ</TableHead>
                        <TableHead className="text-right text-white font-semibold">الحالة</TableHead>
                        <TableHead className="text-center text-white font-semibold">الإجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginated.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">لا يوجد نماذج</TableCell>
                        </TableRow>
                      ) : (
                        paginated.map(f => {
                          const st = statusConfig[f.status] || statusConfig.pending;
                          const emp = employeeMap[f.employee_id];
                          const amount = getFormAmount(f);
                          const details = getFormDetails(f);
                          const isPending = f.status === "pending";
                          return (
                            <TableRow key={f.id} className="hover:bg-muted/40 border-b border-border">
                              <TableCell className="font-medium text-sm whitespace-nowrap text-right">{emp?.name || "—"}</TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap text-right">{emp?.branch || "—"}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap text-right">{formTypeLabels[f.form_type] || f.form_type}</TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate text-right" title={details}>{details || "—"}</TableCell>
                              <TableCell className="text-sm font-semibold whitespace-nowrap text-right">
                                {amount ? `${Number(amount).toLocaleString()} ₪` : "—"}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground whitespace-nowrap text-right">{format(new Date(f.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                              <TableCell className="text-right">
                                <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center gap-1">
                                  {isPending && f._source !== "correction_requests" && (
                                    <>
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50"
                                        onClick={() => handleAction("approved", f)}
                                        disabled={!!processing} title="موافقة" aria-label="موافقة">
                                        {processing === f.id + "approved" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:bg-destructive/10"
                                        onClick={() => handleAction("rejected", f)}
                                        disabled={!!processing} title="رفض" aria-label="رفض">
                                        {processing === f.id + "rejected" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
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
                  </Table>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between p-3 border-t border-border">
                    <span className="text-xs text-muted-foreground">صفحة {page} من {totalPages}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                  </div>
                )}
              </Card>
            )}
          </TabsContent>

          <TabsContent value="policies" className="space-y-4 mt-4">
            <div className="flex justify-between items-center">
              <h3 className="font-semibold">السياسات واللوائح المرفوعة</h3>
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
          </TabsContent>
        </Tabs>
      </div>

      {/* Form detail dialog */}
      <Dialog open={!!selectedForm} onOpenChange={o => { if (!o) setSelectedForm(null); }}>
        <DialogContent className="max-w-lg bg-card border-border max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{formTypeLabels[selectedForm?.form_type] || selectedForm?.form_type}</DialogTitle>
            <DialogDescription className="text-xs">
              مقدم من: {employeeMap[selectedForm?.employee_id]?.name || "—"}
              {employeeMap[selectedForm?.employee_id]?.branch && ` — ${employeeMap[selectedForm?.employee_id]?.branch}`}
              {" — "}{selectedForm && format(new Date(selectedForm.created_at), "dd/MM/yyyy HH:mm")}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(() => {
              if (!selectedForm) return null;
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
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">الحالة الحالية:</span>
              <Badge variant={statusConfig[selectedForm?.status]?.variant || "outline"}>
                {statusConfig[selectedForm?.status]?.label || selectedForm?.status}
              </Badge>
              {selectedForm?.status === "pending" && selectedForm?.form_type === "employee_info" && (
                <Button size="sm" variant="outline" className="mr-auto h-7 text-xs gap-1 rounded-lg" onClick={() => setEditMode(m => !m)}>
                  {editMode ? "إلغاء التعديل" : "تعديل البيانات"}
                </Button>
              )}
            </div>
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
                <div className="flex gap-2">
                  <Button className="flex-1 gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleAction("approved", selectedForm)} disabled={!!processing}>
                    <CheckCircle2 className="h-4 w-4" /> موافقة
                  </Button>
                  <Button variant="destructive" className="flex-1 gap-2 rounded-xl" onClick={() => handleAction("rejected", selectedForm)} disabled={!!processing}>
                    <XCircle className="h-4 w-4" /> رفض
                  </Button>
                </div>
              </>
            )}
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
    </div>
  );
}
