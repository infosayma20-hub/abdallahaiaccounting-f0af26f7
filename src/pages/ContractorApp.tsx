import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Plus, ArrowRight, TrendingDown, TrendingUp,
  Receipt, Search, Trash2, Edit, DollarSign, CreditCard,
  BarChart3, Download, Phone, MapPin, FileText,
} from "lucide-react";
import * as XLSX from "xlsx";
import FinancialClaimModal from "@/components/contractor/FinancialClaimModal";
import { generateContractorContractPDF, ContractorContractData, ContractorCompanyData } from "@/utils/generateContractorContractPDF";

interface Project {
  id: string;
  name: string;
  client_name: string | null;
  budget: number;
  total_expenses: number;
  total_receipts: number;
  status: string;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  phone: string | null;
  address: string | null;
  execution_duration: string | null;
  payment_terms: string | null;
  tasks: string[] | null;
  created_at: string;
}

interface Transaction {
  id: string;
  project_id: string;
  type: string;
  amount: number;
  description: string | null;
  category: string | null;
  supplier: string | null;
  payment_method: string;
  cheque_number: string | null;
  cheque_date: string | null;
  cheque_status: string;
  transaction_date: string;
  notes: string | null;
  created_at: string;
}

const defaultCategories = [
  "مواد بناء", "عمالة", "نقل", "معدات", "كهرباء", "سباكة",
  "دهانات", "حديد", "خرسانة", "تشطيبات", "إدارة", "أخرى",
];

const taskOptions = ["تشطيب", "إشراف", "بناء هيكل", "كهرباء", "سباكة", "دهانات", "تصميم", "هدم وإزالة"];

const defaultPForm = {
  name: "", client_name: "", budget: "", start_date: "", end_date: "", notes: "",
  phone: "", address: "", execution_duration: "", payment_terms: "", tasks: [] as string[], custom_task: "",
};

export default function ContractorApp() {
  const { user } = useAuth();
  const { settings } = useCompanySettings();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [view, setView] = useState<"projects" | "project" | "reports">("projects");
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [showTxDialog, setShowTxDialog] = useState(false);
  const [showContractDialog, setShowContractDialog] = useState(false);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  

  const [pForm, setPForm] = useState({ ...defaultPForm });
  const [txForm, setTxForm] = useState({
    type: "expense", amount: "", description: "", category: "", supplier: "",
    payment_method: "نقدي", cheque_number: "", cheque_date: "", transaction_date: format(new Date(), "yyyy-MM-dd"), notes: "",
  });

  const fetchProjects = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("contractor_projects")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setProjects(data as unknown as Project[]);
  }, [user]);

  const fetchTransactions = useCallback(async (projectId: string) => {
    const { data } = await supabase
      .from("contractor_transactions")
      .select("*")
      .eq("project_id", projectId)
      .order("transaction_date", { ascending: false });
    if (data) setTransactions(data as unknown as Transaction[]);
  }, []);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);
  useEffect(() => {
    if (selectedProject) fetchTransactions(selectedProject.id);
  }, [selectedProject, fetchTransactions]);

  const saveProject = async () => {
    if (!pForm.name.trim()) { toast.error("اسم المشروع مطلوب"); return; }
    const allTasks = [...pForm.tasks];
    if (pForm.custom_task.trim()) allTasks.push(pForm.custom_task.trim());
    const payload = {
      name: pForm.name, client_name: pForm.client_name || null,
      budget: parseFloat(pForm.budget) || 0, start_date: pForm.start_date || null,
      end_date: pForm.end_date || null, notes: pForm.notes || null, user_id: user!.id,
      phone: pForm.phone || null, address: pForm.address || null,
      execution_duration: pForm.execution_duration || null,
      payment_terms: pForm.payment_terms || null, tasks: allTasks,
    };
    if (editingProject) {
      const { error } = await supabase.from("contractor_projects").update(payload).eq("id", editingProject.id);
      if (error) { toast.error("فشل التحديث"); return; }
      toast.success("تم تحديث المشروع");
    } else {
      const { error } = await supabase.from("contractor_projects").insert(payload);
      if (error) { toast.error("فشل الإضافة"); return; }
      toast.success("تم إنشاء المشروع");
    }
    setShowProjectDialog(false);
    setEditingProject(null);
    setPForm({ ...defaultPForm });
    fetchProjects();
  };

  const deleteProject = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا المشروع وجميع حركاته؟")) return;
    await supabase.from("contractor_projects").delete().eq("id", id);
    toast.success("تم حذف المشروع");
    if (selectedProject?.id === id) { setSelectedProject(null); setView("projects"); }
    fetchProjects();
  };

  const saveTx = async () => {
    if (!txForm.amount || parseFloat(txForm.amount) <= 0) { toast.error("المبلغ مطلوب"); return; }
    const payload = {
      project_id: selectedProject!.id, user_id: user!.id, type: txForm.type,
      amount: parseFloat(txForm.amount), description: txForm.description || null,
      category: txForm.category || null, supplier: txForm.supplier || null,
      payment_method: txForm.payment_method, cheque_number: txForm.cheque_number || null,
      cheque_date: txForm.cheque_date || null, transaction_date: txForm.transaction_date,
      notes: txForm.notes || null,
    };
    const { error } = await supabase.from("contractor_transactions").insert(payload);
    if (error) { toast.error("فشل الإضافة"); return; }
    toast.success("تمت الإضافة بنجاح");
    setShowTxDialog(false);
    setTxForm({ type: "expense", amount: "", description: "", category: "", supplier: "", payment_method: "نقدي", cheque_number: "", cheque_date: "", transaction_date: format(new Date(), "yyyy-MM-dd"), notes: "" });
    fetchTransactions(selectedProject!.id);
    fetchProjects();
  };

  const deleteTx = async (id: string) => {
    if (!confirm("حذف هذه الحركة؟")) return;
    await supabase.from("contractor_transactions").delete().eq("id", id);
    toast.success("تم الحذف");
    fetchTransactions(selectedProject!.id);
    fetchProjects();
  };

  const openEditProject = (p: Project) => {
    setEditingProject(p);
    setPForm({
      name: p.name, client_name: p.client_name || "", budget: String(p.budget),
      start_date: p.start_date || "", end_date: p.end_date || "", notes: p.notes || "",
      phone: p.phone || "", address: p.address || "",
      execution_duration: p.execution_duration || "", payment_terms: p.payment_terms || "",
      tasks: p.tasks || [], custom_task: "",
    });
    setShowProjectDialog(true);
  };

  const openProject = (p: Project) => {
    setSelectedProject(p);
    setView("project");
  };

  const printContract = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow || !contractRef.current) return;
    printWindow.document.write(`<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>عقد اتفاق - ${selectedProject?.name || ""}</title>
      <style>
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&display=swap');
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'IBM Plex Sans Arabic', 'Cairo', sans-serif; padding: 0; color: #1a1a1a; background: white; direction: rtl; }
        .contract { max-width: 780px; margin: 0 auto; padding: 0 40px 40px; }
        
        /* Header */
        .header { display: flex; justify-content: space-between; align-items: center; padding: 30px 0 20px; border-bottom: 3px solid #1f5c3a; }
        .header-right { display: flex; align-items: center; gap: 14px; }
        .logo { max-height: 64px; max-width: 64px; border-radius: 6px; }
        .company-name { font-size: 22px; font-weight: 700; color: #1f5c3a; }
        .header-left { text-align: left; }
        .header-left .subtitle { font-size: 13px; color: #888; letter-spacing: 0.5px; }
        .header-left .contract-label { font-size: 11px; color: #aaa; text-transform: uppercase; letter-spacing: 1px; margin-top: 2px; }
        
        /* Title */
        .title { text-align: center; font-size: 18px; font-weight: 700; margin: 28px 0 24px; padding: 12px 0; background: linear-gradient(135deg, #f0f9f4, #e8f5ee); border: 1px solid #c8e6d0; border-radius: 6px; color: #1f5c3a; }
        
        /* Sections */
        .section { margin-bottom: 22px; }
        .section-title { font-size: 14px; font-weight: 700; color: #1f5c3a; padding-bottom: 6px; margin-bottom: 12px; border-bottom: 1.5px solid #d4e8dc; }
        
        /* Parties Info */
        .parties-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 30px; }
        .info-row { display: flex; gap: 8px; font-size: 13px; padding: 5px 0; border-bottom: 1px dotted #e8e8e8; }
        .info-label { font-weight: 600; min-width: 95px; color: #333; white-space: nowrap; }
        .info-value { color: #1a1a1a; }
        
        /* Tasks */
        .tasks-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 30px; }
        .task-item { display: flex; align-items: center; gap: 8px; font-size: 13px; padding: 5px 0; }
        .task-check { color: #1f5c3a; font-weight: 700; font-size: 15px; }
        
        /* Financial Table */
        .summary-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .summary-table th, .summary-table td { padding: 10px 14px; font-size: 13px; text-align: right; }
        .summary-table th { background: #1f5c3a; color: white; font-weight: 600; }
        .summary-table td { border-bottom: 1px solid #e5e5e5; }
        .summary-table tr:last-child td { border-bottom: 2px solid #1f5c3a; font-weight: 700; background: #f7faf8; }
        .amount-positive { color: #1f5c3a; font-weight: 600; }
        .amount-negative { color: #c0392b; font-weight: 600; }
        
        /* Notes */
        .notes-box { font-size: 13px; color: #444; padding: 10px 14px; background: #fafafa; border: 1px solid #eee; border-radius: 4px; line-height: 1.7; }
        
        /* Signatures */
        .signatures { display: grid; grid-template-columns: 1fr 1fr; gap: 60px; margin-top: 50px; padding-top: 10px; }
        .sig-box { text-align: center; }
        .sig-title { font-weight: 700; font-size: 13px; color: #1f5c3a; margin-bottom: 6px; }
        .sig-field { font-size: 12px; color: #555; margin-top: 14px; padding-top: 4px; }
        .sig-field span { display: inline-block; border-bottom: 1px solid #333; min-width: 160px; margin-right: 6px; }
        .sig-date { text-align: center; margin-top: 30px; font-size: 12px; color: #555; }
        .sig-date span { display: inline-block; border-bottom: 1px solid #333; min-width: 160px; margin-right: 6px; }
        
        /* Footer */
        .footer { text-align: center; margin-top: 40px; padding-top: 14px; border-top: 2px solid #1f5c3a; font-size: 10px; color: #999; letter-spacing: 0.3px; }
        
        /* Separator */
        .sep { border: none; border-top: 1px solid #e0e0e0; margin: 20px 0; }
        
        @media print { 
          body { padding: 0; } 
          .contract { padding: 15px 30px; }
          @page { margin: 15mm; }
        }
      </style></head><body>`);
    printWindow.document.write(contractRef.current.innerHTML);
    printWindow.document.write("</body></html>");
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  const exportExcel = () => {
    const data = transactions.map(t => ({
      "التاريخ": t.transaction_date, "النوع": t.type === "expense" ? "مصروف" : t.type === "receipt" ? "سند قبض" : "شيك",
      "المبلغ": t.amount, "الوصف": t.description || "", "التصنيف": t.category || "",
      "المورد": t.supplier || "", "طريقة الدفع": t.payment_method,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الحركات");
    XLSX.writeFile(wb, "contractor-report.xlsx");
  };

  const filteredTx = transactions.filter(t => {
    if (filterType !== "all" && t.type !== filterType) return false;
    if (searchTerm && !t.description?.includes(searchTerm) && !t.category?.includes(searchTerm) && !t.supplier?.includes(searchTerm)) return false;
    return true;
  });

  const filteredProjects = projects.filter(p =>
    p.name.includes(searchTerm) || p.client_name?.includes(searchTerm)
  );

  const fmtNum = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const fmtDate = (d: string | null) => d ? format(new Date(d), "dd/MM/yyyy") : "-";

  const toggleTask = (task: string) => {
    setPForm(f => ({
      ...f,
      tasks: f.tasks.includes(task) ? f.tasks.filter(t => t !== task) : [...f.tasks, task],
    }));
  };

  // ============= PROJECT FORM DIALOG (inline JSX) =============
  const projectDialogJSX = (
    <Dialog open={showProjectDialog} onOpenChange={setShowProjectDialog}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader><DialogTitle>{editingProject ? "تعديل المشروع" : "مشروع جديد"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input placeholder="اسم المشروع *" value={pForm.name} onChange={e => setPForm(f => ({ ...f, name: e.target.value }))} />
            <Input placeholder="اسم العميل" value={pForm.client_name} onChange={e => setPForm(f => ({ ...f, client_name: e.target.value }))} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative">
              <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="رقم الجوال" value={pForm.phone} onChange={e => setPForm(f => ({ ...f, phone: e.target.value }))} className="pr-10" />
            </div>
            <Input type="number" placeholder="الميزانية (₪)" value={pForm.budget} onChange={e => setPForm(f => ({ ...f, budget: e.target.value }))} />
          </div>
          <div className="relative">
            <MapPin className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="العنوان / موقع المشروع" value={pForm.address} onChange={e => setPForm(f => ({ ...f, address: e.target.value }))} className="pr-10" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground">تاريخ البداية</label><Input type="date" max="9999-12-31" value={pForm.start_date} onChange={e => setPForm(f => ({ ...f, start_date: e.target.value }))} /></div>
            <div><label className="text-xs text-muted-foreground">تاريخ النهاية</label><Input type="date" max="9999-12-31" value={pForm.end_date} onChange={e => setPForm(f => ({ ...f, end_date: e.target.value }))} /></div>
          </div>
          <Input placeholder="مدة التنفيذ (مثال: 3 أشهر)" value={pForm.execution_duration} onChange={e => setPForm(f => ({ ...f, execution_duration: e.target.value }))} />
          <Select value={pForm.payment_terms} onValueChange={v => setPForm(f => ({ ...f, payment_terms: v }))}>
            <SelectTrigger><SelectValue placeholder="آلية الدفع" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="نقدي عند الاستلام">نقدي عند الاستلام</SelectItem>
              <SelectItem value="دفعات شهرية">دفعات شهرية</SelectItem>
              <SelectItem value="50% مقدم - 50% عند الانتهاء">50% مقدم - 50% عند الانتهاء</SelectItem>
              <SelectItem value="30% مقدم - 40% أثناء - 30% عند الانتهاء">30%-40%-30%</SelectItem>
              <SelectItem value="حسب الاتفاق">حسب الاتفاق</SelectItem>
            </SelectContent>
          </Select>

          {/* Tasks */}
          <div>
            <label className="text-xs font-medium text-foreground mb-2 block">المهام المطلوبة</label>
            <div className="grid grid-cols-2 gap-2">
              {taskOptions.map(task => (
                <label key={task} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={pForm.tasks.includes(task)} onCheckedChange={() => toggleTask(task)} />
                  {task}
                </label>
              ))}
            </div>
            <Input placeholder="مهمة أخرى (اكتب هنا)" value={pForm.custom_task} onChange={e => setPForm(f => ({ ...f, custom_task: e.target.value }))} className="mt-2" />
          </div>

          <Textarea placeholder="ملاحظات إضافية" value={pForm.notes} onChange={e => setPForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
        </div>
        <DialogFooter><Button onClick={saveProject}>{editingProject ? "تحديث" : "إنشاء"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ============= PRINTABLE CONTRACT (hidden, used for print) =============
  const contractPrintJSX = selectedProject ? (() => {
    const p = selectedProject;
    const companyName = settings.company_name || "الشركة";
    const companyPhone = settings.phone || "";
    const companyAddress = settings.address || "";
    const companyEmail = settings.email || "";
    const logoUrl = settings.logo_url || "";

    return (
      <div ref={contractRef} style={{ display: "none" }}>
        <div className="contract">
          {/* Header */}
          <div className="header">
            <div className="header-right">
              {logoUrl && <img src={logoUrl} alt="logo" className="logo" />}
              <div className="company-name">{companyName}</div>
            </div>
            <div className="header-left">
              <div className="subtitle">Contract Agreement</div>
              <div className="contract-label">PROJECT AGREEMENT</div>
            </div>
          </div>

          {/* Title */}
          <div className="title">عقد اتفاق مشروع</div>

          {/* Parties */}
          <div className="section">
            <div className="section-title">بيانات الأطراف</div>
            <div className="parties-grid">
              <div className="info-row"><span className="info-label">الطرف الأول:</span><span className="info-value">{companyName}</span></div>
              <div className="info-row"><span className="info-label">الطرف الثاني:</span><span className="info-value">{p.client_name || "-"}</span></div>
              <div className="info-row"><span className="info-label">العنوان:</span><span className="info-value">{p.address || "-"}</span></div>
              <div className="info-row"><span className="info-label">رقم الجوال:</span><span className="info-value">{p.phone || "-"}</span></div>
            </div>
          </div>

          {/* Project Details */}
          <div className="section">
            <div className="section-title">بيانات المشروع</div>
            <div className="parties-grid">
              <div className="info-row"><span className="info-label">اسم المشروع:</span><span className="info-value">{p.name}</span></div>
              <div className="info-row"><span className="info-label">تاريخ البداية:</span><span className="info-value">{fmtDate(p.start_date)}</span></div>
              <div className="info-row"><span className="info-label">مدة التنفيذ:</span><span className="info-value">{p.execution_duration || "-"}</span></div>
              <div className="info-row"><span className="info-label">آلية الدفع:</span><span className="info-value">{p.payment_terms || "-"}</span></div>
            </div>
          </div>

          {/* Scope of Work */}
          {p.tasks && p.tasks.length > 0 && (
            <div className="section">
              <div className="section-title">نطاق العمل</div>
              <div className="tasks-grid">
                {p.tasks.map((t, i) => (
                  <div key={i} className="task-item">
                    <span className="task-check">✓</span>
                    <span>{t}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Financial Summary */}
          <div className="section">
            <div className="section-title">الملخص المالي</div>
            <table className="summary-table">
              <thead><tr><th>البند</th><th>المبلغ (₪)</th></tr></thead>
              <tbody>
                <tr><td>الميزانية المتفق عليها</td><td className="amount-positive">{fmtNum(p.budget)}</td></tr>
                <tr><td>إجمالي المصروفات</td><td className="amount-negative">{fmtNum(p.total_expenses)}</td></tr>
                <tr><td>إجمالي المقبوضات</td><td className="amount-positive">{fmtNum(p.total_receipts)}</td></tr>
                <tr><td>المتبقي</td><td className="amount-positive">{fmtNum(p.budget - p.total_expenses)}</td></tr>
              </tbody>
            </table>
          </div>

          {/* Notes */}
          {p.notes && (
            <div className="section">
              <div className="section-title">الملاحظات</div>
              <div className="notes-box">{p.notes}</div>
            </div>
          )}

          <hr className="sep" />

          {/* Signatures */}
          <div className="signatures">
            <div className="sig-box">
              <div className="sig-title">الطرف الأول (المقاول)</div>
              <div className="sig-field">الاسم: <span>&nbsp;</span></div>
              <div className="sig-field">التوقيع: <span>&nbsp;</span></div>
            </div>
            <div className="sig-box">
              <div className="sig-title">الطرف الثاني (العميل)</div>
              <div className="sig-field">الاسم: <span>&nbsp;</span></div>
              <div className="sig-field">التوقيع: <span>&nbsp;</span></div>
            </div>
          </div>
          <div className="sig-date">التاريخ: <span>{format(new Date(), "dd/MM/yyyy")}</span></div>

          <hr className="sep" />

          {/* Footer */}
          <div className="footer">
            {logoUrl && <img src={logoUrl} alt="logo" style={{ maxHeight: "28px", marginBottom: "6px" }} />}
            <div>{companyName}</div>
            <div>
              {companyPhone && `${companyPhone}`}
              {companyAddress && ` | ${companyAddress}`}
              {companyEmail && ` | ${companyEmail}`}
            </div>
          </div>
        </div>
      </div>
    );
  })() : null;

  // ============ RENDER ============

  // Projects List View
  if (view === "projects") {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6" dir="rtl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">🏗️ محاسب المشاريع والمقاولات</h1>
            <p className="text-muted-foreground text-sm">إدارة مشاريع المقاولات والحركات المالية</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setView("reports")}>
              <BarChart3 className="h-4 w-4 ml-1" /> التقارير
            </Button>
            <Button onClick={() => { setEditingProject(null); setPForm({ ...defaultPForm }); setShowProjectDialog(true); }}>
              <Plus className="h-4 w-4 ml-1" /> مشروع جديد
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">المشاريع</p>
            <p className="text-2xl font-bold text-foreground">{projects.length}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الميزانيات</p>
            <p className="text-2xl font-bold text-primary">{fmtNum(projects.reduce((s, p) => s + p.budget, 0))}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">إجمالي المصروفات</p>
            <p className="text-2xl font-bold text-destructive">{fmtNum(projects.reduce((s, p) => s + p.total_expenses, 0))}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">إجمالي المقبوضات</p>
            <p className="text-2xl font-bold text-emerald-600">{fmtNum(projects.reduce((s, p) => s + p.total_receipts, 0))}</p>
          </CardContent></Card>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="ابحث عن مشروع..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pr-10" />
        </div>

        {/* Projects Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map(p => {
            const remaining = p.budget - p.total_expenses;
            const progress = p.budget > 0 ? Math.min((p.total_expenses / p.budget) * 100, 100) : 0;
            return (
              <Card key={p.id} className="cursor-pointer hover:shadow-md transition-shadow border-border" onClick={() => openProject(p)}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-foreground">{p.name}</h3>
                      {p.client_name && <p className="text-xs text-muted-foreground">{p.client_name}</p>}
                      {p.phone && <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{p.phone}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); openEditProject(p); }}><Edit className="h-3 w-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={e => { e.stopPropagation(); deleteProject(p.id); }}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                  {p.tasks && p.tasks.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {p.tasks.slice(0, 3).map((t, i) => <Badge key={i} variant="outline" className="text-[9px] px-1.5">{t}</Badge>)}
                      {p.tasks.length > 3 && <Badge variant="outline" className="text-[9px] px-1.5">+{p.tasks.length - 3}</Badge>}
                    </div>
                  )}
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">الميزانية: <span className="font-medium text-foreground">{fmtNum(p.budget)}</span></span>
                    <Badge variant={remaining >= 0 ? "default" : "destructive"} className="text-[10px]">
                      {remaining >= 0 ? `متبقي: ${fmtNum(remaining)}` : `تجاوز: ${fmtNum(Math.abs(remaining))}`}
                    </Badge>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div className={`h-2 rounded-full transition-all ${progress > 90 ? "bg-destructive" : progress > 70 ? "bg-yellow-500" : "bg-primary"}`} style={{ width: `${progress}%` }} />
                  </div>
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>مصروفات: {fmtNum(p.total_expenses)}</span>
                    <span>مقبوضات: {fmtNum(p.total_receipts)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {/* Add Project Card */}
          <Card className="cursor-pointer border-dashed border-2 border-muted hover:border-primary/50 transition-colors" onClick={() => { setEditingProject(null); setPForm({ ...defaultPForm }); setShowProjectDialog(true); }}>
            <CardContent className="p-4 flex flex-col items-center justify-center h-full min-h-[140px] text-muted-foreground">
              <Plus className="h-8 w-8 mb-2" />
              <span className="text-sm font-medium">مشروع جديد</span>
            </CardContent>
          </Card>
        </div>

        {projectDialogJSX}
      </div>
    );
  }

  // Project Detail View
  if (view === "project" && selectedProject) {
    const remaining = selectedProject.budget - selectedProject.total_expenses;

    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => { setView("projects"); setSelectedProject(null); }}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold text-foreground">{selectedProject.name}</h1>
              {selectedProject.client_name && <p className="text-sm text-muted-foreground">{selectedProject.client_name}</p>}
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={printContract}>
              <Printer className="h-4 w-4 ml-1" /> طباعة العقد
            </Button>
            <Button variant="outline" size="sm" onClick={exportExcel}>
              <Download className="h-4 w-4 ml-1" /> تصدير
            </Button>
            <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" onClick={() => setShowClaimModal(true)}>
              <Mail className="h-4 w-4 ml-1" /> 📩 مطالبة مالية
            </Button>
          </div>
        </div>

        {/* Project Info Summary */}
        {(selectedProject.phone || selectedProject.address || selectedProject.execution_duration || selectedProject.payment_terms) && (
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {selectedProject.phone && <div><span className="text-muted-foreground text-xs">الجوال:</span><p className="font-medium">{selectedProject.phone}</p></div>}
                {selectedProject.address && <div><span className="text-muted-foreground text-xs">العنوان:</span><p className="font-medium">{selectedProject.address}</p></div>}
                {selectedProject.execution_duration && <div><span className="text-muted-foreground text-xs">مدة التنفيذ:</span><p className="font-medium">{selectedProject.execution_duration}</p></div>}
                {selectedProject.payment_terms && <div><span className="text-muted-foreground text-xs">آلية الدفع:</span><p className="font-medium">{selectedProject.payment_terms}</p></div>}
              </div>
              {selectedProject.tasks && selectedProject.tasks.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="text-xs text-muted-foreground ml-1">المهام:</span>
                  {selectedProject.tasks.map((t, i) => <Badge key={i} variant="secondary" className="text-xs">{t}</Badge>)}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-primary/20"><CardContent className="pt-4 text-center">
            <DollarSign className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-xs text-muted-foreground">الميزانية</p>
            <p className="text-lg font-bold text-foreground">{fmtNum(selectedProject.budget)}</p>
          </CardContent></Card>
          <Card className="border-destructive/20"><CardContent className="pt-4 text-center">
            <TrendingDown className="h-5 w-5 mx-auto text-destructive mb-1" />
            <p className="text-xs text-muted-foreground">المصروفات</p>
            <p className="text-lg font-bold text-destructive">{fmtNum(selectedProject.total_expenses)}</p>
          </CardContent></Card>
          <Card className="border-emerald-500/20"><CardContent className="pt-4 text-center">
            <TrendingUp className="h-5 w-5 mx-auto text-emerald-600 mb-1" />
            <p className="text-xs text-muted-foreground">المقبوضات</p>
            <p className="text-lg font-bold text-emerald-600">{fmtNum(selectedProject.total_receipts)}</p>
          </CardContent></Card>
          <Card className={remaining >= 0 ? "border-primary/20" : "border-destructive/20"}><CardContent className="pt-4 text-center">
            <Receipt className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">المتبقي</p>
            <p className={`text-lg font-bold ${remaining >= 0 ? "text-primary" : "text-destructive"}`}>{fmtNum(remaining)}</p>
          </CardContent></Card>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 flex-wrap">
          <Button variant="destructive" onClick={() => { setTxForm(f => ({ ...f, type: "expense" })); setShowTxDialog(true); }}>
            <TrendingDown className="h-4 w-4 ml-1" /> مصروف جديد
          </Button>
          <Button className="bg-emerald-600 hover:bg-emerald-700" onClick={() => { setTxForm(f => ({ ...f, type: "receipt" })); setShowTxDialog(true); }}>
            <TrendingUp className="h-4 w-4 ml-1" /> سند قبض
          </Button>
          <Button variant="outline" onClick={() => { setTxForm(f => ({ ...f, type: "cheque" })); setShowTxDialog(true); }}>
            <CreditCard className="h-4 w-4 ml-1" /> دفع شيك
          </Button>
        </div>

        {/* Filter Bar */}
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="بحث..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pr-10" />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">الكل</SelectItem>
              <SelectItem value="expense">مصروفات</SelectItem>
              <SelectItem value="receipt">مقبوضات</SelectItem>
              <SelectItem value="cheque">شيكات</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Transactions Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">التاريخ</TableHead>
                  <TableHead className="text-right">النوع</TableHead>
                  <TableHead className="text-right">الوصف</TableHead>
                  <TableHead className="text-right">التصنيف</TableHead>
                  <TableHead className="text-right">المبلغ</TableHead>
                  <TableHead className="text-right">الدفع</TableHead>
                  <TableHead className="text-center w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTx.length === 0 ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">لا توجد حركات</TableCell></TableRow>
                ) : filteredTx.map(t => (
                  <TableRow key={t.id}>
                    <TableCell className="text-sm">{fmtDate(t.transaction_date)}</TableCell>
                    <TableCell>
                      <Badge variant={t.type === "expense" ? "destructive" : t.type === "receipt" ? "default" : "outline"} className="text-[10px]">
                        {t.type === "expense" ? "مصروف" : t.type === "receipt" ? "قبض" : "شيك"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">{t.description || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{t.category || "-"}</TableCell>
                    <TableCell className={`text-sm font-medium ${t.type === "expense" || t.type === "cheque" ? "text-destructive" : "text-emerald-600"}`}>
                      {t.type === "expense" || t.type === "cheque" ? "-" : "+"}{fmtNum(t.amount)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{t.payment_method}</TableCell>
                    <TableCell className="text-center">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => deleteTx(t.id)}><Trash2 className="h-3 w-3" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Transaction Dialog */}
        <Dialog open={showTxDialog} onOpenChange={setShowTxDialog}>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader>
              <DialogTitle>
                {txForm.type === "expense" ? "🔴 مصروف جديد" : txForm.type === "receipt" ? "🟢 سند قبض" : "🔵 دفع شيك"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Input type="number" placeholder="المبلغ *" value={txForm.amount} onChange={e => setTxForm(f => ({ ...f, amount: e.target.value }))} />
              <Input placeholder="الوصف" value={txForm.description} onChange={e => setTxForm(f => ({ ...f, description: e.target.value }))} />
              <Select value={txForm.category} onValueChange={v => setTxForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue placeholder="التصنيف" /></SelectTrigger>
                <SelectContent>
                  {defaultCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input placeholder="المورد / الجهة" value={txForm.supplier} onChange={e => setTxForm(f => ({ ...f, supplier: e.target.value }))} />
              <Select value={txForm.payment_method} onValueChange={v => setTxForm(f => ({ ...f, payment_method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="نقدي">نقدي</SelectItem>
                  <SelectItem value="بنك">تحويل بنكي</SelectItem>
                  <SelectItem value="شيك">شيك</SelectItem>
                </SelectContent>
              </Select>
              {(txForm.payment_method === "شيك" || txForm.type === "cheque") && (
                <div className="grid grid-cols-2 gap-2">
                  <Input placeholder="رقم الشيك" value={txForm.cheque_number} onChange={e => setTxForm(f => ({ ...f, cheque_number: e.target.value }))} />
                  <Input type="date" max="9999-12-31" value={txForm.cheque_date} onChange={e => setTxForm(f => ({ ...f, cheque_date: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground">تاريخ العملية</label>
                <Input type="date" max="9999-12-31" value={txForm.transaction_date} onChange={e => setTxForm(f => ({ ...f, transaction_date: e.target.value }))} />
              </div>
              <Textarea placeholder="ملاحظات" value={txForm.notes} onChange={e => setTxForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <DialogFooter><Button onClick={saveTx}>حفظ</Button></DialogFooter>
          </DialogContent>
        </Dialog>

        {projectDialogJSX}
        {contractPrintJSX}

        {/* Financial Claim Modal */}
        <FinancialClaimModal
          open={showClaimModal}
          onOpenChange={setShowClaimModal}
          project={selectedProject}
          userId={user!.id}
          companyName={settings.company_name || "الشركة"}
          companyPhone={settings.phone || ""}
          companyAddress={settings.address || ""}
          companyEmail={settings.email || ""}
          logoUrl={settings.logo_url || ""}
        />
      </div>
    );
  }

  // Reports View
  if (view === "reports") {
    const totalBudget = projects.reduce((s, p) => s + p.budget, 0);
    const totalExpenses = projects.reduce((s, p) => s + p.total_expenses, 0);
    const totalReceipts = projects.reduce((s, p) => s + p.total_receipts, 0);
    const netCash = totalReceipts - totalExpenses;

    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5" dir="rtl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => setView("projects")}>
              <ArrowRight className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-bold text-foreground">📊 التقارير</h1>
          </div>
          <Button variant="outline" size="sm" onClick={exportExcel}><Download className="h-4 w-4 ml-1" /> تصدير Excel</Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">إجمالي الميزانيات</p>
            <p className="text-xl font-bold text-foreground">{fmtNum(totalBudget)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">إجمالي المصروفات</p>
            <p className="text-xl font-bold text-destructive">{fmtNum(totalExpenses)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">إجمالي المقبوضات</p>
            <p className="text-xl font-bold text-emerald-600">{fmtNum(totalReceipts)}</p>
          </CardContent></Card>
          <Card><CardContent className="pt-4 text-center">
            <p className="text-xs text-muted-foreground">صافي التدفق النقدي</p>
            <p className={`text-xl font-bold ${netCash >= 0 ? "text-primary" : "text-destructive"}`}>{fmtNum(netCash)}</p>
          </CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">ملخص المشاريع</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-right">المشروع</TableHead>
                  <TableHead className="text-right">العميل</TableHead>
                  <TableHead className="text-right">الميزانية</TableHead>
                  <TableHead className="text-right">المصروفات</TableHead>
                  <TableHead className="text-right">المقبوضات</TableHead>
                  <TableHead className="text-right">المتبقي</TableHead>
                  <TableHead className="text-right">نسبة الإنفاق</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map(p => {
                  const rem = p.budget - p.total_expenses;
                  const pct = p.budget > 0 ? ((p.total_expenses / p.budget) * 100).toFixed(0) : "0";
                  return (
                    <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openProject(p)}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-muted-foreground">{p.client_name || "-"}</TableCell>
                      <TableCell>{fmtNum(p.budget)}</TableCell>
                      <TableCell className="text-destructive">{fmtNum(p.total_expenses)}</TableCell>
                      <TableCell className="text-emerald-600">{fmtNum(p.total_receipts)}</TableCell>
                      <TableCell className={rem >= 0 ? "text-primary" : "text-destructive"}>{fmtNum(rem)}</TableCell>
                      <TableCell><Badge variant={Number(pct) > 90 ? "destructive" : "outline"}>{pct}%</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  return null;
}
