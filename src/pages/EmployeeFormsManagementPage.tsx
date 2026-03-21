import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import BackButton from "@/components/BackButton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search, Filter, CheckCircle2, XCircle, Clock, Eye, MessageSquare, Upload, FileText,
  Download, ChevronLeft, ChevronRight, Loader2
} from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

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
};

const statusConfig: Record<string, { label: string; variant: "default" | "destructive" | "outline" | "secondary"; color: string }> = {
  pending: { label: "قيد المراجعة", variant: "outline", color: "text-warning" },
  approved: { label: "تمت الموافقة", variant: "default", color: "text-emerald-600" },
  rejected: { label: "مرفوض", variant: "destructive", color: "text-destructive" },
};

export default function EmployeeFormsManagementPage() {
  const { user } = useAuth();
  const [forms, setForms] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedForm, setSelectedForm] = useState<any | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [page, setPage] = useState(1);
  const perPage = 20;

  // Policies management
  const [policiesTab, setPoliciesTab] = useState("forms");
  const [policies, setPolicies] = useState<any[]>([]);
  const [showUploadPolicy, setShowUploadPolicy] = useState(false);
  const [policyForm, setPolicyForm] = useState({ title: "", description: "", category: "" });
  const [uploadingPolicy, setUploadingPolicy] = useState(false);

  useEffect(() => {
    if (user) {
      fetchForms();
      fetchEmployees();
      fetchPolicies();
    }
  }, [user]);

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

  const fetchEmployees = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("employees")
      .select("id, full_name")
      .eq("user_id", user.id);
    const map: Record<string, string> = {};
    (data || []).forEach((e: any) => { map[e.id] = e.full_name; });
    setEmployees(map);
  };

  const fetchPolicies = async () => {
    const { data } = await supabase
      .from("employee_policy_documents")
      .select("*")
      .order("created_at", { ascending: false });
    setPolicies(data || []);
  };

  const handleAction = async (action: "approved" | "rejected") => {
    if (!selectedForm || !user) return;
    setProcessing(true);
    const { error } = await supabase
      .from("employee_forms")
      .update({
        status: action,
        reviewed_by: user.id,
        review_notes: reviewNotes || null,
        reviewed_at: new Date().toISOString(),
      } as any)
      .eq("id", selectedForm.id);
    setProcessing(false);
    if (error) {
      toast.error("خطأ: " + error.message);
    } else {
      toast.success(action === "approved" ? "تمت الموافقة ✅" : "تم الرفض ❌");
      setSelectedForm(null);
      setReviewNotes("");
      fetchForms();
    }
  };

  const handleUploadPolicy = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setUploadingPolicy(true);
    const ext = file.name.split(".").pop();
    const path = `policies/${Date.now()}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from("employee-forms").upload(path, file);
    if (uploadErr) {
      toast.error("خطأ في رفع الملف");
      setUploadingPolicy(false);
      return;
    }
    const { data: urlData } = supabase.storage.from("employee-forms").getPublicUrl(path);

    const { error } = await supabase.from("employee_policy_documents").insert({
      user_id: user.id,
      title: policyForm.title,
      description: policyForm.description || null,
      file_url: urlData.publicUrl,
      category: policyForm.category,
    } as any);

    setUploadingPolicy(false);
    if (error) {
      toast.error("خطأ: " + error.message);
    } else {
      toast.success("تم إضافة السياسة ✅");
      setShowUploadPolicy(false);
      setPolicyForm({ title: "", description: "", category: "" });
      fetchPolicies();
    }
  };

  const filtered = forms.filter(f => {
    if (filterType !== "all" && f.form_type !== filterType) return false;
    if (filterStatus !== "all" && f.status !== filterStatus) return false;
    if (search) {
      const empName = employees[f.employee_id] || "";
      if (!empName.includes(search) && !f.form_type.includes(search)) return false;
    }
    return true;
  });

  const paginated = filtered.slice((page - 1) * perPage, page * perPage);
  const totalPages = Math.ceil(filtered.length / perPage);

  const counts = {
    pending: forms.filter(f => f.status === "pending").length,
    approved: forms.filter(f => f.status === "approved").length,
    rejected: forms.filter(f => f.status === "rejected").length,
    total: forms.length,
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-6" dir="rtl" style={{ fontFamily: "Tajawal, sans-serif" }}>
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <BackButton />
            <h1 className="text-xl font-bold">إدارة نماذج الموظفين</h1>
          </div>
        </div>

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

        <Tabs value={policiesTab} onValueChange={setPoliciesTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="forms">الطلبات والنماذج</TabsTrigger>
            <TabsTrigger value="policies">السياسات واللوائح</TabsTrigger>
          </TabsList>

          <TabsContent value="forms" className="space-y-4 mt-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث باسم الموظف..." className="pr-9 rounded-xl" />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[180px] rounded-xl"><SelectValue placeholder="نوع النموذج" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  {Object.entries(formTypeLabels).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px] rounded-xl"><SelectValue placeholder="الحالة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="pending">قيد المراجعة</SelectItem>
                  <SelectItem value="approved">تمت الموافقة</SelectItem>
                  <SelectItem value="rejected">مرفوض</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Table */}
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
            ) : (
              <Card className="border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-right">الموظف</TableHead>
                      <TableHead className="text-right">النموذج</TableHead>
                      <TableHead className="text-right">التاريخ</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                      <TableHead className="text-right">إجراء</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">لا يوجد نماذج</TableCell>
                      </TableRow>
                    ) : (
                      paginated.map(f => {
                        const st = statusConfig[f.status] || statusConfig.pending;
                        return (
                          <TableRow key={f.id}>
                            <TableCell className="font-medium text-sm">{employees[f.employee_id] || "—"}</TableCell>
                            <TableCell className="text-xs">{formTypeLabels[f.form_type] || f.form_type}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">{format(new Date(f.created_at), "dd/MM/yyyy HH:mm")}</TableCell>
                            <TableCell>
                              <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                            </TableCell>
                            <TableCell>
                              <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={() => { setSelectedForm(f); setReviewNotes(f.review_notes || ""); }}>
                                <Eye className="h-3 w-3" /> عرض
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
                {totalPages > 1 && (
                  <div className="flex items-center justify-between p-3 border-t border-border">
                    <span className="text-xs text-muted-foreground">صفحة {page} من {totalPages}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronRight className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}><ChevronLeft className="h-4 w-4" /></Button>
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
                    <p className="text-xs mt-1">ارفع ملفات PDF للسياسات ليتمكن الموظفون من الاطلاع عليها</p>
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
                      <Button size="sm" variant="outline" className="gap-1" onClick={() => window.open(p.file_url, "_blank")}>
                        <Eye className="h-3 w-3" /> عرض
                      </Button>
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
            <DialogDescription className="text-xs">مقدم من: {employees[selectedForm?.employee_id] || "—"} - {selectedForm && format(new Date(selectedForm.created_at), "dd/MM/yyyy HH:mm")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {/* Form data display */}
            <div className="bg-muted/30 rounded-xl p-4 space-y-2">
              {selectedForm?.form_data && Object.entries(selectedForm.form_data).filter(([k]) => k !== "attachment_url").map(([key, value]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{key.replace(/_/g, " ")}:</span>
                  <span className="font-medium">{String(value)}</span>
                </div>
              ))}
            </div>

            {/* Attachment */}
            {selectedForm?.attachment_url && (
              <a href={selectedForm.attachment_url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                <Download className="h-4 w-4" /> عرض المرفق
              </a>
            )}

            {/* Current status */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">الحالة الحالية:</span>
              <Badge variant={statusConfig[selectedForm?.status]?.variant || "outline"}>
                {statusConfig[selectedForm?.status]?.label || selectedForm?.status}
              </Badge>
            </div>

            {/* Review actions */}
            {selectedForm?.status === "pending" && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">ملاحظات المراجعة</label>
                  <Textarea value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} rows={2} className="rounded-xl" placeholder="أضف ملاحظة..." />
                </div>
                <div className="flex gap-2">
                  <Button className="flex-1 gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => handleAction("approved")} disabled={processing}>
                    <CheckCircle2 className="h-4 w-4" /> موافقة
                  </Button>
                  <Button variant="destructive" className="flex-1 gap-2 rounded-xl" onClick={() => handleAction("rejected")} disabled={processing}>
                    <XCircle className="h-4 w-4" /> رفض
                  </Button>
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Policy Dialog */}
      <Dialog open={showUploadPolicy} onOpenChange={setShowUploadPolicy}>
        <DialogContent dir="rtl" className="max-w-sm">
          <DialogHeader>
            <DialogTitle>رفع سياسة جديدة</DialogTitle>
            <DialogDescription className="text-xs">ارفع ملف PDF للسياسة ليظهر للموظفين</DialogDescription>
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
              <label className="text-xs text-muted-foreground mb-1 block">ملف PDF *</label>
              <label className="border-2 border-dashed border-border rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer hover:bg-muted/50 transition-colors">
                {uploadingPolicy ? (
                  <Loader2 className="h-6 w-6 animate-spin" />
                ) : (
                  <>
                    <Upload className="h-6 w-6 text-muted-foreground" />
                    <span className="text-xs text-primary">اختر ملف PDF</span>
                  </>
                )}
                <input
                  type="file"
                  className="hidden"
                  accept=".pdf"
                  onChange={handleUploadPolicy}
                  disabled={!policyForm.title || !policyForm.category || uploadingPolicy}
                />
              </label>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
