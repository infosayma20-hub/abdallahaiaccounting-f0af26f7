import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  Plus, ArrowRight, ArrowLeft, Building2, TrendingDown, TrendingUp,
  Receipt, FileText, Search, Trash2, Edit, DollarSign, CreditCard,
  BarChart3, Calendar, Filter, Download,
} from "lucide-react";
import BackButton from "@/components/BackButton";
import * as XLSX from "xlsx";

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

export default function ContractorApp() {
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [view, setView] = useState<"projects" | "project" | "reports">("projects");
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [showTxDialog, setShowTxDialog] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [reportTab, setReportTab] = useState("summary");

  // Form states
  const [pForm, setPForm] = useState({ name: "", client_name: "", budget: "", start_date: "", end_date: "", notes: "" });
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
    const payload = {
      name: pForm.name, client_name: pForm.client_name || null,
      budget: parseFloat(pForm.budget) || 0, start_date: pForm.start_date || null,
      end_date: pForm.end_date || null, notes: pForm.notes || null, user_id: user!.id,
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
    setPForm({ name: "", client_name: "", budget: "", start_date: "", end_date: "", notes: "" });
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
    setPForm({ name: p.name, client_name: p.client_name || "", budget: String(p.budget), start_date: p.start_date || "", end_date: p.end_date || "", notes: p.notes || "" });
    setShowProjectDialog(true);
  };

  const openProject = (p: Project) => {
    setSelectedProject(p);
    setView("project");
  };

  const exportExcel = () => {
    const data = (view === "reports" ? getAllTransactions() : transactions).map(t => ({
      "التاريخ": t.transaction_date,
      "النوع": t.type === "expense" ? "مصروف" : t.type === "receipt" ? "سند قبض" : "شيك",
      "المبلغ": t.amount,
      "الوصف": t.description || "",
      "التصنيف": t.category || "",
      "المورد": t.supplier || "",
      "طريقة الدفع": t.payment_method,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "الحركات");
    XLSX.writeFile(wb, "contractor-report.xlsx");
  };

  const getAllTransactions = (): (Transaction & { projectName?: string })[] => {
    // For reports, we'd need all transactions across projects
    return transactions;
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

  // ============ RENDER ============

  // Projects List View
  if (view === "projects") {
    return (
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6" dir="rtl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">🏗️ محاسبك السريع</h1>
            <p className="text-muted-foreground text-sm">إدارة مشاريع المقاولات والحركات المالية</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setView("reports")}>
              <BarChart3 className="h-4 w-4 ml-1" /> التقارير
            </Button>
            <Button onClick={() => { setEditingProject(null); setPForm({ name: "", client_name: "", budget: "", start_date: "", end_date: "", notes: "" }); setShowProjectDialog(true); }}>
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
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={e => { e.stopPropagation(); openEditProject(p); }}><Edit className="h-3 w-3" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={e => { e.stopPropagation(); deleteProject(p.id); }}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
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
          <Card className="cursor-pointer border-dashed border-2 border-muted hover:border-primary/50 transition-colors" onClick={() => { setEditingProject(null); setPForm({ name: "", client_name: "", budget: "", start_date: "", end_date: "", notes: "" }); setShowProjectDialog(true); }}>
            <CardContent className="p-4 flex flex-col items-center justify-center h-full min-h-[140px] text-muted-foreground">
              <Plus className="h-8 w-8 mb-2" />
              <span className="text-sm font-medium">مشروع جديد</span>
            </CardContent>
          </Card>
        </div>

        {/* Project Dialog */}
        <Dialog open={showProjectDialog} onOpenChange={setShowProjectDialog}>
          <DialogContent className="sm:max-w-md" dir="rtl">
            <DialogHeader><DialogTitle>{editingProject ? "تعديل المشروع" : "مشروع جديد"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <Input placeholder="اسم المشروع *" value={pForm.name} onChange={e => setPForm(f => ({ ...f, name: e.target.value }))} />
              <Input placeholder="اسم العميل" value={pForm.client_name} onChange={e => setPForm(f => ({ ...f, client_name: e.target.value }))} />
              <Input type="number" placeholder="الميزانية" value={pForm.budget} onChange={e => setPForm(f => ({ ...f, budget: e.target.value }))} />
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-xs text-muted-foreground">تاريخ البداية</label><Input type="date" value={pForm.start_date} onChange={e => setPForm(f => ({ ...f, start_date: e.target.value }))} /></div>
                <div><label className="text-xs text-muted-foreground">تاريخ النهاية</label><Input type="date" value={pForm.end_date} onChange={e => setPForm(f => ({ ...f, end_date: e.target.value }))} /></div>
              </div>
              <Textarea placeholder="ملاحظات" value={pForm.notes} onChange={e => setPForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <DialogFooter><Button onClick={saveProject}>{editingProject ? "تحديث" : "إنشاء"}</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // Project Detail View
  if (view === "project" && selectedProject) {
    const remaining = selectedProject.budget - selectedProject.total_expenses;
    const netCash = selectedProject.total_receipts - selectedProject.total_expenses;

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
            <Button variant="outline" size="sm" onClick={exportExcel}><Download className="h-4 w-4 ml-1" /> تصدير</Button>
          </div>
        </div>

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
                    <TableCell className="text-sm">{t.transaction_date}</TableCell>
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

        {/* Add Transaction Dialog */}
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
                  <Input type="date" value={txForm.cheque_date} onChange={e => setTxForm(f => ({ ...f, cheque_date: e.target.value }))} />
                </div>
              )}
              <div>
                <label className="text-xs text-muted-foreground">تاريخ العملية</label>
                <Input type="date" value={txForm.transaction_date} onChange={e => setTxForm(f => ({ ...f, transaction_date: e.target.value }))} />
              </div>
              <Textarea placeholder="ملاحظات" value={txForm.notes} onChange={e => setTxForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <DialogFooter><Button onClick={saveTx}>حفظ</Button></DialogFooter>
          </DialogContent>
        </Dialog>
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

        {/* Summary KPIs */}
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

        {/* Projects Summary Table */}
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
                      <TableCell>
                        <Badge variant={Number(pct) > 90 ? "destructive" : "outline"}>{pct}%</Badge>
                      </TableCell>
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
