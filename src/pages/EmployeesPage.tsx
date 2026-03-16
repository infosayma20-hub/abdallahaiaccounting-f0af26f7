import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Search, Users, DollarSign, Calendar, FileText, Edit, Trash2, UserPlus, Loader2, Upload, CalendarDays, LogOut as LogOutIcon, Download, FileBarChart, ArrowUpDown, ArrowUp, ArrowDown, Filter, Layers, Pencil, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import BackButton from "@/components/BackButton";
import EmployeeMovementsTab from "@/components/hr/EmployeeMovementsTab";
import EmployeeFinancialMovementsTab from "@/components/hr/EmployeeFinancialMovementsTab";
import EmployeeDeductionsTab from "@/components/hr/EmployeeDeductionsTab";
import EmployeeLeavesTab from "@/components/hr/EmployeeLeavesTab";
import EmployeeHRTab from "@/components/hr/EmployeeHRTab";
import AdvanceRequestModal from "@/components/hr/AdvanceRequestModal";
import EmployeeImportDialog from "@/components/hr/EmployeeImportDialog";
import OfficialHolidaysDialog from "@/components/hr/OfficialHolidaysDialog";
import TerminationDialog from "@/components/hr/TerminationDialog";
import SalarySlipDialog from "@/components/hr/SalarySlipDialog";
import DeductionsExportDialog from "@/components/hr/DeductionsExportDialog";
import { calculateSalarySlip, calculateLeaveBalance, getWorkDaysInMonth, getWeeklyDaysOffInMonth, formatCurrency, type SalarySlip } from "@/lib/hr-utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface Employee {
  id: string;
  full_name: string;
  id_number: string;
  phone: string;
  email: string;
  photo_url: string;
  position: string;
  department: string;
  job_title: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  salary_type: string;
  base_salary: number;
  hourly_rate: number;
  work_days_per_week: number;
  work_hours_per_day: number;
  annual_leave_days: number;
  sick_leave_days: number;
  bank_name: string;
  bank_account: string;
  emergency_contact: string;
  emergency_phone: string;
  address: string;
  notes: string;
  marital_status?: string;
  children_count?: number;
  spouse_allowance_amount?: number;
  child_allowance_per_child?: number;
  gender?: string;
  nationality?: string;
  date_of_birth?: string;
  contract_type?: string;
  transportation_allowance_per_day?: number;
  meal_allowance_per_day?: number;
  annual_leave_balance?: number;
  previous_year_balance?: number;
  is_terminated?: boolean;
  auth_user_id?: string;
}

const emptyEmployee: Partial<Employee> = {
  full_name: "", id_number: "", phone: "", email: "", position: "", department: "",
  job_title: "", start_date: new Date().toISOString().split("T")[0], salary_type: "شهري",
  base_salary: 0, hourly_rate: 0, work_days_per_week: 6, work_hours_per_day: 8,
  annual_leave_days: 14, sick_leave_days: 14, bank_name: "", bank_account: "",
  emergency_contact: "", emergency_phone: "", address: "", notes: "", is_active: true,
  marital_status: "single", children_count: 0, spouse_allowance_amount: 0,
  child_allowance_per_child: 0, gender: "male", nationality: "", contract_type: "permanent",
  transportation_allowance_per_day: 0, meal_allowance_per_day: 0,
};

type SortField = "full_name" | "department" | "job_title" | "start_date" | "base_salary" | "is_active";
type SortDir = "asc" | "desc";

const EmployeesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Employee>>(emptyEmployee);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [activeTab, setActiveTab] = useState("info");
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Filters
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterJob, setFilterJob] = useState<string>("all");
  const [groupByBranch, setGroupByBranch] = useState(false);

  // Sort & Pagination
  const [sortField, setSortField] = useState<SortField>("full_name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const PAGE_SIZE_OPTIONS = [15, 30, 100];

  // Sub-data
  const [deductions, setDeductions] = useState<any[]>([]);
  const [allowances, setAllowances] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [advances, setAdvances] = useState<any[]>([]);
  const [showDeductionForm, setShowDeductionForm] = useState(false);
  const [showAllowanceForm, setShowAllowanceForm] = useState(false);
  const [deductionForm, setDeductionForm] = useState({ deduction_type: "سلفة", amount: 0, deduction_date: new Date().toISOString().split("T")[0], description: "", notes: "" });
  const [allowanceForm, setAllowanceForm] = useState({ allowance_name: "", allowance_type: "ثابت", amount: 0, percentage: 0, notes: "" });
  const [userRoles, setUserRoles] = useState<string[]>([]);

  // Create account
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [accountForm, setAccountForm] = useState({ email: "", password: "" });
  const [creatingAccount, setCreatingAccount] = useState(false);

  // New dialogs
  const [showImport, setShowImport] = useState(false);
  const [showHolidays, setShowHolidays] = useState(false);
  const [showTermination, setShowTermination] = useState(false);
  const [showSalarySlip, setShowSalarySlip] = useState(false);
  const [salarySlip, setSalarySlip] = useState<SalarySlip | null>(null);
  const [showDeductionsExport, setShowDeductionsExport] = useState(false);

  const handleCreateAccount = async () => {
    if (!selectedEmployee || !accountForm.email || !accountForm.password) {
      toast.error("الإيميل وكلمة المرور مطلوبين");
      return;
    }
    if (accountForm.password.length < 6) {
      toast.error("كلمة المرور يجب أن تكون 6 أحرف على الأقل");
      return;
    }
    setCreatingAccount(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-employee-account", {
        body: { employee_id: selectedEmployee.id, email: accountForm.email, password: accountForm.password },
      });
      if (error || data?.error) toast.error(data?.error || error?.message || "فشل إنشاء الحساب");
      else { toast.success(data.message || "تم إنشاء الحساب بنجاح"); setShowCreateAccount(false); setAccountForm({ email: "", password: "" }); fetchEmployees(); }
    } catch (err: any) { toast.error(err.message || "خطأ غير متوقع"); }
    finally { setCreatingAccount(false); }
  };

  const fetchEmployees = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.from("employees_safe").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) { toast.error("خطأ في جلب الموظفين"); console.error(error); }
    else setEmployees((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchEmployees(); }, [user]);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).then(({ data }) => {
      setUserRoles((data || []).map((r: any) => r.role));
    });
  }, [user]);

  const canSeeHR = userRoles.includes("admin") || userRoles.includes("hr_manager") || userRoles.includes("super_admin");

  const fetchEmployeeDetails = async (empId: string) => {
    if (!user) return;
    const [dedRes, allRes, levRes, advRes] = await Promise.all([
      supabase.from("employee_deductions").select("*").eq("employee_id", empId).eq("user_id", user.id).order("deduction_date", { ascending: false }),
      supabase.from("employee_allowances").select("*").eq("employee_id", empId).eq("user_id", user.id),
      supabase.from("employee_leaves").select("*").eq("employee_id", empId).eq("user_id", user.id).order("start_date", { ascending: false }),
      supabase.from("employee_advances").select("*").eq("employee_id", empId).eq("user_id", user.id).in("status", ["approved", "active"]),
    ]);
    setDeductions((dedRes.data as any[]) || []);
    setAllowances((allRes.data as any[]) || []);
    setLeaves((levRes.data as any[]) || []);
    setAdvances((advRes.data as any[]) || []);
  };

  const ensureEmployeeAccount = async (employeeName: string) => {
    if (!user) return;
    try {
      const { data: parentExists } = await supabase.from("accounts").select("id").eq("user_id", user.id).eq("account_code", "1180").maybeSingle();
      if (!parentExists) {
        await supabase.from("accounts").insert({ user_id: user.id, account_code: "1180", account_name: "ذمم موظفين", account_type: "أصول", is_system: true, is_active: true });
      }
      const { data: existingSubs } = await supabase.from("accounts").select("account_code").eq("user_id", user.id).like("account_code", "118%").neq("account_code", "1180").order("account_code", { ascending: false }).limit(1);
      const lastCode = existingSubs?.[0]?.account_code;
      const nextCode = lastCode ? String(Number(lastCode) + 1) : "1181";
      const { data: alreadyExists } = await supabase.from("accounts").select("id").eq("user_id", user.id).eq("account_name", `ذمم موظف - ${employeeName}`).maybeSingle();
      if (!alreadyExists) {
        await supabase.from("accounts").insert({ user_id: user.id, account_code: nextCode, account_name: `ذمم موظف - ${employeeName}`, account_type: "أصول", parent_code: "1180", is_system: false, is_active: true });
      }
    } catch (err) { console.error("Error creating employee account:", err); }
  };

  const handleSave = async () => {
    if (!user || !form.full_name) { toast.error("اسم الموظف مطلوب"); return; }
    const payload = { ...form, user_id: user.id };
    if (editingId) {
      const { error } = await supabase.from("employees").update(payload as any).eq("id", editingId);
      if (error) toast.error("خطأ في التحديث"); else { toast.success("تم التحديث"); setShowForm(false); setEditingId(null); fetchEmployees(); }
    } else {
      const { error } = await supabase.from("employees").insert(payload as any);
      if (error) toast.error("خطأ في الإضافة");
      else { toast.success("تمت الإضافة"); setShowForm(false); fetchEmployees(); await ensureEmployeeAccount(form.full_name!); }
    }
    setForm(emptyEmployee);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الموظف؟")) return;
    const employeeToDelete = employees.find(e => e.id === id);
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) { toast.error("خطأ في الحذف"); return; }
    if (employeeToDelete && user) {
      const accountName = `ذمم موظف - ${employeeToDelete.full_name}`;
      const { data: empAccount } = await supabase.from("accounts").select("account_code").eq("user_id", user.id).eq("account_name", accountName).maybeSingle();
      if (empAccount) {
        const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", user.id).or(`debit_account_code.eq.${empAccount.account_code},credit_account_code.eq.${empAccount.account_code}`);
        if (!count || count === 0) await supabase.from("accounts").delete().eq("user_id", user.id).eq("account_name", accountName);
        else await supabase.from("accounts").update({ is_active: false }).eq("user_id", user.id).eq("account_name", accountName);
      }
    }
    toast.success("تم الحذف");
    fetchEmployees();
    if (selectedEmployee?.id === id) { setSelectedEmployee(null); setDrawerOpen(false); }
  };

  const handleAddDeduction = async () => {
    if (!user || !selectedEmployee) return;
    const { error } = await supabase.from("employee_deductions").insert({ ...deductionForm, employee_id: selectedEmployee.id, user_id: user.id } as any);
    if (error) toast.error("خطأ"); else { toast.success("تمت الإضافة"); setShowDeductionForm(false); setDeductionForm({ deduction_type: "سلفة", amount: 0, deduction_date: new Date().toISOString().split("T")[0], description: "", notes: "" }); fetchEmployeeDetails(selectedEmployee.id); }
  };

  const handleAddAllowance = async () => {
    if (!user || !selectedEmployee) return;
    const { error } = await supabase.from("employee_allowances").insert({ ...allowanceForm, employee_id: selectedEmployee.id, user_id: user.id, is_active: true } as any);
    if (error) toast.error("خطأ"); else { toast.success("تمت الإضافة"); setShowAllowanceForm(false); setAllowanceForm({ allowance_name: "", allowance_type: "ثابت", amount: 0, percentage: 0, notes: "" }); fetchEmployeeDetails(selectedEmployee.id); }
  };

  const generateSalarySlip = async () => {
    if (!selectedEmployee || !user) return;
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const workDays = getWorkDaysInMonth(year, month);
    const weeklyOff = getWeeklyDaysOffInMonth(year, month);
    const customAllowancesTotal = allowances.filter(a => a.is_active).reduce((s: number, a: any) => s + Number(a.amount || 0), 0);
    const { data: movementsData } = await supabase.from("employee_financial_movements").select("*").eq("employee_id", selectedEmployee.id).eq("user_id", user.id).eq("salary_month", month).eq("salary_year", year).eq("status", "approved").eq("movement_type", "debit");
    const movementsTotal = (movementsData || []).reduce((s: number, m: any) => s + Number(m.amount || 0), 0);
    const legacyDeductions = deductions.filter(d => !d.is_repaid).reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
    const slip = calculateSalarySlip({
      baseSalary: Number(selectedEmployee.base_salary) || 0, hourlyRate: Number(selectedEmployee.hourly_rate) || 0,
      workDaysPerWeek: selectedEmployee.work_days_per_week || 6, workHoursPerDay: selectedEmployee.work_hours_per_day || 8,
      presentDays: workDays, annualLeaveDays: 0, sickLeaveDays: 0, officialHolidayDays: 0, weeklyDaysOff: weeklyOff, totalWorkDays: workDays,
      transportationPerDay: Number((selectedEmployee as any).transportation_allowance_per_day) || 0,
      mealPerDay: Number((selectedEmployee as any).meal_allowance_per_day) || 0,
      spouseAllowance: Number((selectedEmployee as any).spouse_allowance_amount) || 0,
      childrenCount: Number((selectedEmployee as any).children_count) || 0,
      childAllowancePerChild: Number((selectedEmployee as any).child_allowance_per_child) || 0,
      overtimeHours: 0, overtimeAmount: 0, advanceDeductions: legacyDeductions + movementsTotal, otherDeductions: 0,
      customAllowances: customAllowancesTotal, socialInsuranceRate: 0.075,
    });
    setSalarySlip(slip);
    setShowSalarySlip(true);
  };

  const openEmployeeDrawer = (emp: Employee) => {
    setSelectedEmployee(emp);
    fetchEmployeeDetails(emp.id);
    setActiveTab("info");
    setDrawerOpen(true);
  };

  // Derived data
  const branches = useMemo(() => [...new Set(employees.map(e => e.department || "بدون فرع"))], [employees]);
  const jobs = useMemo(() => [...new Set(employees.filter(e => e.job_title).map(e => e.job_title))], [employees]);

  const filtered = useMemo(() => {
    let list = employees.filter(e =>
      (e.full_name?.includes(search) || e.id_number?.includes(search) || e.job_title?.includes(search) || e.position?.includes(search))
    );
    if (filterBranch !== "all") list = list.filter(e => (e.department || "بدون فرع") === filterBranch);
    if (filterStatus === "active") list = list.filter(e => e.is_active);
    else if (filterStatus === "inactive") list = list.filter(e => !e.is_active);
    if (filterJob !== "all") list = list.filter(e => e.job_title === filterJob);

    list.sort((a, b) => {
      let va: any = a[sortField];
      let vb: any = b[sortField];
      if (sortField === "base_salary") { va = Number(va || 0); vb = Number(vb || 0); }
      if (sortField === "is_active") { va = va ? 1 : 0; vb = vb ? 1 : 0; }
      if (va == null) va = "";
      if (vb == null) vb = "";
      const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb), "ar");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [employees, search, filterBranch, filterStatus, filterJob, sortField, sortDir]);

  const activeCount = employees.filter(e => e.is_active).length;
  const totalSalaries = employees.filter(e => e.is_active).reduce((s, e) => s + Number(e.base_salary || 0), 0);

  // Group by branch
  const groupedData = useMemo(() => {
    if (!groupByBranch) return null;
    const groups: Record<string, Employee[]> = {};
    filtered.forEach(e => {
      const key = e.department || "بدون فرع";
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    return groups;
  }, [filtered, groupByBranch]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const leaveBalance = selectedEmployee ? calculateLeaveBalance(
    selectedEmployee.start_date,
    Number((selectedEmployee as any).previous_year_balance) || 0,
    leaves.filter(l => (l.status === "موافق عليها" || l.status === "موافقة" || l.status === "معتمدة") && new Date(l.start_date).getFullYear() === new Date().getFullYear()).reduce((s: number, l: any) => s + Number(l.days_count || 0), 0)
  ) : null;

  // Advance/loan totals per employee (for table display)
  const getAdvanceBadge = (emp: Employee) => {
    // We don't have per-employee advance data preloaded for table, so show base_salary-based indicator
    // We'll show it properly once the drawer is open
    return null;
  };

  const renderEmployeeRow = (emp: Employee, idx: number) => (
    <TableRow
      key={emp.id}
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => openEmployeeDrawer(emp)}
    >
      <TableCell className="sticky right-0 bg-background z-10 font-medium">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
            {emp.full_name?.charAt(0)}
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{emp.full_name}</p>
            <p className="text-[10px] text-muted-foreground">{emp.id_number || "—"}</p>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-sm">{emp.department || "—"}</TableCell>
      <TableCell className="text-sm">{emp.job_title || emp.position || "—"}</TableCell>
      <TableCell className="text-sm">{emp.start_date || "—"}</TableCell>
      <TableCell className="text-sm font-medium">{formatCurrency(Number(emp.base_salary || 0))}</TableCell>
      <TableCell>
        <Badge
          variant={emp.is_active ? "default" : (emp as any).is_terminated ? "destructive" : "secondary"}
          className={`text-[10px] ${emp.is_active ? "bg-emerald-500/15 text-emerald-700 border-emerald-200 hover:bg-emerald-500/20" : (emp as any).is_terminated ? "bg-destructive/15 text-destructive" : "bg-muted text-muted-foreground"}`}
        >
          {emp.is_active ? "نشط" : (emp as any).is_terminated ? "منتهي" : "موقوف"}
        </Badge>
      </TableCell>
    </TableRow>
  );

  // Mobile card view
  const renderMobileCard = (emp: Employee) => (
    <Card
      key={emp.id}
      className="cursor-pointer transition-all hover:border-primary/50"
      onClick={() => openEmployeeDrawer(emp)}
    >
      <CardContent className="p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm flex-shrink-0">
          {emp.full_name?.charAt(0)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm text-foreground truncate">{emp.full_name}</p>
          <p className="text-xs text-muted-foreground truncate">{emp.job_title || emp.position || "—"}</p>
        </div>
        <Badge
          variant={emp.is_active ? "default" : "secondary"}
          className={`text-[10px] ${emp.is_active ? "bg-emerald-500/15 text-emerald-700 border-emerald-200" : ""}`}
        >
          {emp.is_active ? "نشط" : "متوقف"}
        </Badge>
      </CardContent>
    </Card>
  );

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-full mx-auto" dir="rtl">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <BackButton />
          <div>
            <h1 className="text-2xl font-bold text-foreground">إدارة الموظفين</h1>
            <p className="text-sm text-muted-foreground">نظام الموارد البشرية - قانون العمل الفلسطيني</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowHolidays(true)} className="gap-1">
            <CalendarDays className="h-4 w-4" /> العطل الرسمية
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-1">
            <Upload className="h-4 w-4" /> استيراد Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDeductionsExport(true)} className="gap-1">
            <Download className="h-4 w-4" /> تصدير المسحوبات
          </Button>
          <Button onClick={() => { setForm(emptyEmployee); setEditingId(null); setShowForm(true); }} className="gap-2">
            <Plus className="h-4 w-4" /> إضافة موظف
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card><CardContent className="p-4 text-center">
          <Users className="h-5 w-5 mx-auto text-primary mb-1" />
          <p className="text-2xl font-bold text-foreground">{activeCount}</p>
          <p className="text-xs text-muted-foreground">موظف نشط</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <DollarSign className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-2xl font-bold text-foreground">{totalSalaries.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">إجمالي الرواتب</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <Calendar className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-2xl font-bold text-foreground">{employees.length - activeCount}</p>
          <p className="text-xs text-muted-foreground">غير نشط</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <FileText className="h-5 w-5 mx-auto text-muted-foreground mb-1" />
          <p className="text-2xl font-bold text-foreground">{employees.length}</p>
          <p className="text-xs text-muted-foreground">إجمالي السجلات</p>
        </CardContent></Card>
      </div>

      {/* Toolbar: Search + Filters */}
      <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="بحث بالاسم، رقم الهوية، الوظيفة..." value={search} onChange={e => setSearch(e.target.value)} className="pr-10" />
        </div>

        {!isMobile && (
          <div className="flex gap-2 flex-wrap items-center">
            <Select value={filterBranch} onValueChange={setFilterBranch}>
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <Filter className="h-3 w-3 ml-1" />
                <SelectValue placeholder="الفرع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الفروع</SelectItem>
                {branches.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[120px] h-9 text-xs">
                <SelectValue placeholder="الحالة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">الكل</SelectItem>
                <SelectItem value="active">نشط</SelectItem>
                <SelectItem value="inactive">غير نشط</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterJob} onValueChange={setFilterJob}>
              <SelectTrigger className="w-[140px] h-9 text-xs">
                <SelectValue placeholder="الوظيفة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل الوظائف</SelectItem>
                {jobs.map(j => <SelectItem key={j} value={j}>{j}</SelectItem>)}
              </SelectContent>
            </Select>

            <Button
              variant={groupByBranch ? "default" : "outline"}
              size="sm"
              onClick={() => setGroupByBranch(!groupByBranch)}
              className="gap-1 text-xs h-9"
            >
              <Layers className="h-3 w-3" /> تجميع بالفرع
            </Button>
          </div>
        )}
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : isMobile ? (
        /* MOBILE: Card View */
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">لا يوجد موظفون</p>
          ) : (
            filtered.map(emp => renderMobileCard(emp))
          )}
        </div>
      ) : (
        /* DESKTOP: Table View */
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="sticky right-0 bg-muted/30 z-10 cursor-pointer select-none min-w-[200px]" onClick={() => toggleSort("full_name")}>
                    <div className="flex items-center gap-1">الموظف <SortIcon field="full_name" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("department")}>
                    <div className="flex items-center gap-1">الفرع <SortIcon field="department" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("job_title")}>
                    <div className="flex items-center gap-1">الوظيفة <SortIcon field="job_title" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("start_date")}>
                    <div className="flex items-center gap-1">تاريخ التعيين <SortIcon field="start_date" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("base_salary")}>
                    <div className="flex items-center gap-1">الراتب الأساسي <SortIcon field="base_salary" /></div>
                  </TableHead>
                  <TableHead className="cursor-pointer select-none" onClick={() => toggleSort("is_active")}>
                    <div className="flex items-center gap-1">الحالة <SortIcon field="is_active" /></div>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">لا يوجد موظفون</TableCell></TableRow>
                ) : groupByBranch && groupedData ? (
                  Object.entries(groupedData).map(([branch, emps]) => (
                    <>
                      <TableRow key={`group-${branch}`} className="bg-muted/50">
                        <TableCell colSpan={6} className="font-bold text-sm py-2">
                          <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-primary" />
                            {branch} <Badge variant="secondary" className="text-[10px] mr-2">{emps.length}</Badge>
                          </div>
                        </TableCell>
                      </TableRow>
                      {emps.map((emp, i) => renderEmployeeRow(emp, i))}
                    </>
                  ))
                ) : (
                  filtered.map((emp, i) => renderEmployeeRow(emp, i))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Summary Row */}
          <div className="border-t border-border bg-muted/20 px-4 py-2.5 flex items-center gap-6 text-sm font-medium sticky bottom-0">
            <span>إجمالي: <strong>{filtered.length}</strong> موظف</span>
            <span className="text-muted-foreground">|</span>
            <span>الرواتب: <strong>₪{filtered.reduce((s, e) => s + Number(e.base_salary || 0), 0).toLocaleString()}</strong></span>
            <span className="text-muted-foreground">|</span>
            <span>نشط: <strong className="text-emerald-600">{filtered.filter(e => e.is_active).length}</strong></span>
          </div>
        </Card>
      )}

      {/* Employee Detail DRAWER */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto p-0" dir="rtl">
          {selectedEmployee && (
            <div className="p-6">
              <SheetHeader className="pb-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg">
                      {selectedEmployee.full_name?.charAt(0)}
                    </div>
                    <div>
                      <SheetTitle className="text-lg">{selectedEmployee.full_name}</SheetTitle>
                      <p className="text-sm text-muted-foreground">{selectedEmployee.job_title || selectedEmployee.position || "—"}</p>
                    </div>
                  </div>
                  <Badge
                    className={`text-xs ${selectedEmployee.is_active ? "bg-emerald-500/15 text-emerald-700 border-emerald-200" : "bg-destructive/15 text-destructive"}`}
                  >
                    {selectedEmployee.is_active ? "نشط" : "متوقف"}
                  </Badge>
                </div>
              </SheetHeader>

              {/* Action buttons */}
              <div className="flex gap-1.5 flex-wrap mb-4">
                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => navigate(`/account-statement?employee_name=${encodeURIComponent(selectedEmployee.full_name)}`)}>
                  <FileBarChart className="h-3 w-3" /> كشف حساب
                </Button>
                {!selectedEmployee.auth_user_id && (
                  <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => { setAccountForm({ email: selectedEmployee.email || "", password: "" }); setShowCreateAccount(true); }}>
                    <UserPlus className="h-3 w-3" /> إنشاء حساب
                  </Button>
                )}
                {selectedEmployee.auth_user_id && <Badge variant="secondary" className="text-[10px]">لديه حساب ✓</Badge>}
                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={generateSalarySlip}>
                  <DollarSign className="h-3 w-3" /> قسيمة راتب
                </Button>
                {selectedEmployee.is_active && (
                  <Button size="sm" variant="outline" className="gap-1 text-xs text-destructive" onClick={() => setShowTermination(true)}>
                    <LogOutIcon className="h-3 w-3" /> إنهاء خدمة
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => { setForm(selectedEmployee); setEditingId(selectedEmployee.id); setShowForm(true); }}><Edit className="h-3 w-3" /></Button>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(selectedEmployee.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>

              {/* Tabs */}
              <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className={`w-full grid mb-4 ${canSeeHR ? 'grid-cols-6' : 'grid-cols-5'}`}>
                  <TabsTrigger value="info">المعلومات</TabsTrigger>
                  <TabsTrigger value="allowances">البدلات</TabsTrigger>
                  <TabsTrigger value="deductions">المسحوبات</TabsTrigger>
                  <TabsTrigger value="movements">الحركات المالية</TabsTrigger>
                  <TabsTrigger value="leaves">الإجازات</TabsTrigger>
                  {canSeeHR && <TabsTrigger value="hr">HR</TabsTrigger>}
                </TabsList>

                <TabsContent value="info">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {[
                      ["رقم الهوية", selectedEmployee.id_number],
                      ["الهاتف", selectedEmployee.phone],
                      ["البريد", selectedEmployee.email],
                      ["الجنس", (selectedEmployee as any).gender === "female" ? "أنثى" : "ذكر"],
                      ["الحالة الاجتماعية", (selectedEmployee as any).marital_status === "married" ? "متزوج" : (selectedEmployee as any).marital_status === "divorced" ? "مطلق" : "أعزب"],
                      ["عدد الأبناء", (selectedEmployee as any).children_count || 0],
                      ["المنصب", selectedEmployee.position],
                      ["القسم", selectedEmployee.department],
                      ["المسمى الوظيفي", selectedEmployee.job_title],
                      ["نوع العقد", (selectedEmployee as any).contract_type || "دائم"],
                      ["تاريخ البداية", selectedEmployee.start_date],
                      ["نوع الراتب", selectedEmployee.salary_type],
                      ["الراتب الأساسي", formatCurrency(Number(selectedEmployee.base_salary || 0))],
                      ["معدل الساعة", Number(selectedEmployee.hourly_rate || 0).toLocaleString()],
                      ["بدل مواصلات/يوم", formatCurrency(Number((selectedEmployee as any).transportation_allowance_per_day || 0))],
                      ["بدل وجبات/يوم", formatCurrency(Number((selectedEmployee as any).meal_allowance_per_day || 0))],
                      ["علاوة زوجة", formatCurrency(Number((selectedEmployee as any).spouse_allowance_amount || 0))],
                      ["علاوة أبناء/طفل", formatCurrency(Number((selectedEmployee as any).child_allowance_per_child || 0))],
                      ["أيام العمل/أسبوع", selectedEmployee.work_days_per_week],
                      ["ساعات العمل/يوم", selectedEmployee.work_hours_per_day],
                      ["إجازات سنوية", `${selectedEmployee.annual_leave_days} يوم`],
                      ["إجازات مرضية", `${selectedEmployee.sick_leave_days} يوم`],
                      ["البنك", selectedEmployee.bank_name],
                      ["رقم الحساب", selectedEmployee.bank_account],
                      ["جهة طوارئ", selectedEmployee.emergency_contact],
                      ["هاتف طوارئ", selectedEmployee.emergency_phone],
                    ].map(([label, val]) => (
                      <div key={label as string} className="flex justify-between border-b border-border/30 pb-1">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium text-foreground">{val || "—"}</span>
                      </div>
                    ))}
                  </div>
                </TabsContent>

                <TabsContent value="allowances">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="font-medium text-foreground">البدلات</h3>
                    <Button size="sm" onClick={() => setShowAllowanceForm(true)} className="gap-1"><Plus className="h-3 w-3" /> إضافة بدل</Button>
                  </div>
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead className="text-right">البدل</TableHead>
                      <TableHead className="text-right">النوع</TableHead>
                      <TableHead className="text-right">المبلغ</TableHead>
                      <TableHead className="text-right">الحالة</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {allowances.map(a => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.allowance_name}</TableCell>
                          <TableCell>{a.allowance_type}</TableCell>
                          <TableCell>{a.allowance_type === "نسبة من الراتب" ? `${a.percentage}%` : Number(a.amount).toLocaleString()}</TableCell>
                          <TableCell><Badge variant={a.is_active ? "default" : "secondary"}>{a.is_active ? "فعال" : "متوقف"}</Badge></TableCell>
                        </TableRow>
                      ))}
                      {allowances.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground">لا توجد بدلات</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </TabsContent>

                <TabsContent value="deductions">
                  {user && selectedEmployee && (
                    <EmployeeDeductionsTab
                      employeeId={selectedEmployee.id}
                      employeeName={selectedEmployee.full_name}
                      userId={user.id}
                      deductions={deductions}
                      onRefresh={() => fetchEmployeeDetails(selectedEmployee.id)}
                    />
                  )}
                </TabsContent>

                <TabsContent value="movements">
                  {user && selectedEmployee && (
                    <EmployeeFinancialMovementsTab
                      employeeId={selectedEmployee.id}
                      employeeName={selectedEmployee.full_name}
                      userId={user.id}
                    />
                  )}
                </TabsContent>

                <TabsContent value="leaves">
                  {user && selectedEmployee && (
                    <EmployeeLeavesTab
                      employeeId={selectedEmployee.id}
                      userId={user.id}
                      employee={selectedEmployee}
                      leaves={leaves}
                      onRefresh={() => fetchEmployeeDetails(selectedEmployee.id)}
                    />
                  )}
                </TabsContent>

                {canSeeHR && (
                  <TabsContent value="hr">
                    {user && selectedEmployee && (
                      <EmployeeHRTab
                        employeeId={selectedEmployee.id}
                        userId={user.id}
                        employee={selectedEmployee}
                      />
                    )}
                  </TabsContent>
                )}
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Add/Edit Employee Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto" dir="rtl">
          <DialogHeader><DialogTitle>{editingId ? "تعديل موظف" : "إضافة موظف جديد"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-muted-foreground">الاسم الكامل *</label><Input value={form.full_name || ""} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">رقم الهوية</label><Input value={form.id_number || ""} onChange={e => setForm({ ...form, id_number: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">الجنس</label>
              <Select value={form.gender || "male"} onValueChange={v => setForm({ ...form, gender: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="male">ذكر</SelectItem><SelectItem value="female">أنثى</SelectItem></SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground">تاريخ الميلاد</label><Input type="date" value={form.date_of_birth || ""} onChange={e => setForm({ ...form, date_of_birth: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">الجنسية</label><Input value={form.nationality || ""} onChange={e => setForm({ ...form, nationality: e.target.value })} placeholder="فلسطينية" /></div>
            <div><label className="text-xs text-muted-foreground">الهاتف</label><Input value={form.phone || ""} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">البريد</label><Input value={form.email || ""} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">المنصب</label><Input value={form.position || ""} onChange={e => setForm({ ...form, position: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">القسم</label><Input value={form.department || ""} onChange={e => setForm({ ...form, department: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">المسمى الوظيفي</label><Input value={form.job_title || ""} onChange={e => setForm({ ...form, job_title: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">تاريخ البداية</label><Input type="date" value={form.start_date || ""} onChange={e => setForm({ ...form, start_date: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">نوع العقد</label>
              <Select value={form.contract_type || "permanent"} onValueChange={v => setForm({ ...form, contract_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="permanent">دائم</SelectItem><SelectItem value="temporary">مؤقت</SelectItem><SelectItem value="parttime">دوام جزئي</SelectItem></SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground">نوع الراتب</label>
              <Select value={form.salary_type || "شهري"} onValueChange={v => setForm({ ...form, salary_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="شهري">شهري</SelectItem><SelectItem value="يومي">يومي</SelectItem><SelectItem value="بالساعة">بالساعة</SelectItem></SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground">الراتب الأساسي</label><Input type="number" value={form.base_salary || 0} onChange={e => setForm({ ...form, base_salary: Number(e.target.value) })} /></div>
            <div><label className="text-xs text-muted-foreground">معدل الساعة</label><Input type="number" value={form.hourly_rate || 0} onChange={e => setForm({ ...form, hourly_rate: Number(e.target.value) })} /></div>
            <div><label className="text-xs text-muted-foreground">أيام العمل/أسبوع</label><Input type="number" value={form.work_days_per_week || 6} onChange={e => setForm({ ...form, work_days_per_week: Number(e.target.value) })} /></div>
            <div><label className="text-xs text-muted-foreground">ساعات العمل/يوم</label><Input type="number" value={form.work_hours_per_day || 8} onChange={e => setForm({ ...form, work_hours_per_day: Number(e.target.value) })} /></div>
            <div className="col-span-2 border-t border-border pt-3 mt-2">
              <h4 className="text-sm font-bold text-foreground mb-2">البدلات اليومية والعائلية</h4>
            </div>
            <div><label className="text-xs text-muted-foreground">بدل مواصلات/يوم (₪)</label><Input type="number" value={form.transportation_allowance_per_day || 0} onChange={e => setForm({ ...form, transportation_allowance_per_day: Number(e.target.value) })} /></div>
            <div><label className="text-xs text-muted-foreground">بدل وجبات/يوم (₪)</label><Input type="number" value={form.meal_allowance_per_day || 0} onChange={e => setForm({ ...form, meal_allowance_per_day: Number(e.target.value) })} /></div>
            <div><label className="text-xs text-muted-foreground">الحالة الاجتماعية</label>
              <Select value={form.marital_status || "single"} onValueChange={v => setForm({ ...form, marital_status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="single">أعزب</SelectItem><SelectItem value="married">متزوج</SelectItem><SelectItem value="divorced">مطلق</SelectItem></SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground">عدد الأبناء</label><Input type="number" value={form.children_count || 0} onChange={e => setForm({ ...form, children_count: Number(e.target.value) })} /></div>
            <div><label className="text-xs text-muted-foreground">علاوة زوجة (₪/شهر)</label><Input type="number" value={form.spouse_allowance_amount || 0} onChange={e => setForm({ ...form, spouse_allowance_amount: Number(e.target.value) })} /></div>
            <div><label className="text-xs text-muted-foreground">علاوة أبناء/طفل (₪/شهر)</label><Input type="number" value={form.child_allowance_per_child || 0} onChange={e => setForm({ ...form, child_allowance_per_child: Number(e.target.value) })} /></div>
            <div className="col-span-2 border-t border-border pt-3 mt-2">
              <h4 className="text-sm font-bold text-foreground mb-2">الإجازات والبنك</h4>
            </div>
            <div><label className="text-xs text-muted-foreground">إجازات سنوية (يوم)</label><Input type="number" value={form.annual_leave_days || 14} onChange={e => setForm({ ...form, annual_leave_days: Number(e.target.value) })} /></div>
            <div><label className="text-xs text-muted-foreground">إجازات مرضية (يوم)</label><Input type="number" value={form.sick_leave_days || 14} onChange={e => setForm({ ...form, sick_leave_days: Number(e.target.value) })} /></div>
            <div><label className="text-xs text-muted-foreground">البنك</label><Input value={form.bank_name || ""} onChange={e => setForm({ ...form, bank_name: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">رقم الحساب البنكي</label><Input value={form.bank_account || ""} onChange={e => setForm({ ...form, bank_account: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">جهة اتصال طوارئ</label><Input value={form.emergency_contact || ""} onChange={e => setForm({ ...form, emergency_contact: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">هاتف الطوارئ</label><Input value={form.emergency_phone || ""} onChange={e => setForm({ ...form, emergency_phone: e.target.value })} /></div>
            <div className="col-span-2"><label className="text-xs text-muted-foreground">العنوان</label><Input value={form.address || ""} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="col-span-2"><label className="text-xs text-muted-foreground">ملاحظات</label><Input value={form.notes || ""} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowForm(false)}>إلغاء</Button>
            <Button onClick={handleSave}>{editingId ? "تحديث" : "حفظ"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Deduction Dialog */}
      <Dialog open={showDeductionForm} onOpenChange={setShowDeductionForm}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إضافة مسحوبات / خصم</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-muted-foreground">النوع</label>
              <Select value={deductionForm.deduction_type} onValueChange={v => setDeductionForm({ ...deductionForm, deduction_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["سلفة", "أكل", "مشتريات", "مخالفات", "توصيل", "عجز", "فائض", "غياب", "أخرى"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground">المبلغ</label><Input type="number" value={deductionForm.amount} onChange={e => setDeductionForm({ ...deductionForm, amount: Number(e.target.value) })} /></div>
            <div><label className="text-xs text-muted-foreground">التاريخ</label><Input type="date" value={deductionForm.deduction_date} onChange={e => setDeductionForm({ ...deductionForm, deduction_date: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">الوصف</label><Input value={deductionForm.description} onChange={e => setDeductionForm({ ...deductionForm, description: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => setShowDeductionForm(false)}>إلغاء</Button><Button onClick={handleAddDeduction}>حفظ</Button></div>
        </DialogContent>
      </Dialog>

      {/* Add Allowance Dialog */}
      <Dialog open={showAllowanceForm} onOpenChange={setShowAllowanceForm}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إضافة بدل</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs text-muted-foreground">اسم البدل</label><Input value={allowanceForm.allowance_name} onChange={e => setAllowanceForm({ ...allowanceForm, allowance_name: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">النوع</label>
              <Select value={allowanceForm.allowance_type} onValueChange={v => setAllowanceForm({ ...allowanceForm, allowance_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["ثابت", "نسبة من الراتب", "بالساعة", "باليوم"].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><label className="text-xs text-muted-foreground">المبلغ</label><Input type="number" value={allowanceForm.amount} onChange={e => setAllowanceForm({ ...allowanceForm, amount: Number(e.target.value) })} /></div>
            <div><label className="text-xs text-muted-foreground">النسبة (%)</label><Input type="number" value={allowanceForm.percentage} onChange={e => setAllowanceForm({ ...allowanceForm, percentage: Number(e.target.value) })} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4"><Button variant="outline" onClick={() => setShowAllowanceForm(false)}>إلغاء</Button><Button onClick={handleAddAllowance}>حفظ</Button></div>
        </DialogContent>
      </Dialog>

      {/* Create Account Dialog */}
      <Dialog open={showCreateAccount} onOpenChange={setShowCreateAccount}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إنشاء حساب للموظف: {selectedEmployee?.full_name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">سيتم إنشاء حساب دخول للموظف وربطه تلقائياً.</p>
          <div className="space-y-3 mt-2">
            <div><label className="text-xs text-muted-foreground">البريد الإلكتروني</label><Input type="email" placeholder="employee@example.com" value={accountForm.email} onChange={e => setAccountForm({ ...accountForm, email: e.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">كلمة المرور (6 أحرف على الأقل)</label><Input type="text" placeholder="كلمة المرور" value={accountForm.password} onChange={e => setAccountForm({ ...accountForm, password: e.target.value })} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowCreateAccount(false)}>إلغاء</Button>
            <Button onClick={handleCreateAccount} disabled={creatingAccount} className="gap-2">
              {creatingAccount && <Loader2 className="h-4 w-4 animate-spin" />}
              إنشاء الحساب
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      {user && <EmployeeImportDialog open={showImport} onClose={() => setShowImport(false)} userId={user.id} onSuccess={fetchEmployees} />}

      {/* Official Holidays Dialog */}
      {user && <OfficialHolidaysDialog open={showHolidays} onClose={() => setShowHolidays(false)} userId={user.id} />}

      {/* Termination Dialog */}
      {user && <TerminationDialog open={showTermination} onClose={() => setShowTermination(false)} employee={selectedEmployee} userId={user.id} onSuccess={() => { fetchEmployees(); setSelectedEmployee(null); setDrawerOpen(false); }} />}

      {/* Salary Slip Dialog */}
      <SalarySlipDialog
        open={showSalarySlip}
        onClose={() => setShowSalarySlip(false)}
        slip={salarySlip}
        employeeName={selectedEmployee?.full_name || ""}
        department={selectedEmployee?.department || ""}
        startDate={selectedEmployee?.start_date || ""}
        month={new Date().getMonth() + 1}
        year={new Date().getFullYear()}
        employee={selectedEmployee ? {
          id: selectedEmployee.id, id_number: selectedEmployee.id_number, job_title: selectedEmployee.job_title,
          base_salary: selectedEmployee.base_salary, salary_type: selectedEmployee.salary_type,
          bank_name: selectedEmployee.bank_name, bank_account: selectedEmployee.bank_account,
          annual_leave_balance: selectedEmployee.annual_leave_balance, annual_leave_days: selectedEmployee.annual_leave_days,
          previous_year_balance: selectedEmployee.previous_year_balance,
          transportation_allowance_per_day: selectedEmployee.transportation_allowance_per_day,
          meal_allowance_per_day: selectedEmployee.meal_allowance_per_day,
          spouse_allowance_amount: selectedEmployee.spouse_allowance_amount,
          children_count: selectedEmployee.children_count,
          child_allowance_per_child: selectedEmployee.child_allowance_per_child,
        } : undefined}
        userId={user?.id}
      />

      {/* Deductions Export Dialog */}
      {user && (
        <DeductionsExportDialog
          open={showDeductionsExport}
          onClose={() => setShowDeductionsExport(false)}
          userId={user.id}
          employees={employees.map(e => ({ id: e.id, full_name: e.full_name, department: e.department, job_title: e.job_title }))}
        />
      )}
    </div>
  );
};

export default EmployeesPage;
