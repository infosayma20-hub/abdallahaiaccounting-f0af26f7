import { useState, useEffect, useMemo } from "react";
import DateRangeFilter from "@/components/ui/DateRangeFilter";
import PageHeader from "@/components/layout/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useDataOwnerId } from "@/hooks/useDataOwnerId";
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
import { Plus, Search, Users, DollarSign, Calendar, FileText, Trash2, UserPlus, Loader2, Upload, CalendarDays, LogOut as LogOutIcon, Download, FileBarChart, ArrowUpDown, Filter, Layers, Pencil, ChevronLeft, ChevronRight, X, Edit, Building2, Shield } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import SalesRepToggleSection from "@/components/employees/SalesRepToggleSection";
import CashierToggleSection from "@/components/employees/CashierToggleSection";
import FeedbackToggleSection from "@/components/employees/FeedbackToggleSection";
import { useNavigate, useSearchParams } from "react-router-dom";
import BackButton from "@/components/BackButton";
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
import EmployeeOpeningBalance from "@/components/hr/EmployeeOpeningBalance";
import { calculateSalarySlip, calculateLeaveBalance, getWorkDaysInMonth, getWeeklyDaysOffInMonth, formatCurrency, type SalarySlip } from "@/lib/hr-utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { multiWordMatchAny } from "@/lib/utils";
import ManagerBranchesPicker from "@/components/employee/ManagerBranchesPicker";
import ManagerTeamPicker from "@/components/employee/ManagerTeamPicker";

interface Branch {
  id: string;
  name: string;
}

interface Employee {
  id: string;
  full_name: string;
  id_number: string;
  employee_number?: string;
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
  shift_start?: string;
  shift_end?: string;
  shift_id?: string | null;
  annual_leave_days: number;
  sick_leave_days: number;
  bank_name: string;
  bank_account: string;
  emergency_contact: string;
  emergency_phone: string;
  address: string;
  notes: string;
  branch_id?: string;
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
  is_manager?: boolean;
  is_hr_manager?: boolean;
  department_id?: string | null;
  job_title_id?: string | null;
  manager_employee_id?: string | null;
  can_view_team?: boolean;
  can_manage_schedule?: boolean;
  can_manage_attendance?: boolean;
  show_in_employee_team_schedule?: boolean;
}

const emptyEmployee: Partial<Employee> = {
  full_name: "", id_number: "", employee_number: "", phone: "", email: "", position: "", department: "",
  job_title: "", start_date: new Date().toISOString().split("T")[0], salary_type: "شهري",
  base_salary: 0, hourly_rate: 0, work_days_per_week: 6, work_hours_per_day: 8,
  annual_leave_days: 14, sick_leave_days: 14, bank_name: "", bank_account: "",
  emergency_contact: "", emergency_phone: "", address: "", notes: "", is_active: true,
  marital_status: "single", children_count: 0, spouse_allowance_amount: 0,
  child_allowance_per_child: 0, gender: "male", nationality: "", contract_type: "permanent",
  transportation_allowance_per_day: 0, meal_allowance_per_day: 0,
  department_id: null, job_title_id: null,
};

type SortField = "full_name" | "department" | "job_title" | "start_date" | "base_salary" | "is_active";
type SortDir = "asc" | "desc";

const EmployeesPage = () => {
  const { user } = useAuth();
  const { dataOwnerId } = useDataOwnerId();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const isMobile = useIsMobile();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [allowedBranchesMap, setAllowedBranchesMap] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<Partial<Employee>>(emptyEmployee);
  const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(null);
  const [activeTab, setActiveTab] = useState("info");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [branchesList, setBranchesList] = useState<Branch[]>([]);
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [newBranchName, setNewBranchName] = useState("");
  const [departmentsList, setDepartmentsList] = useState<Array<{ id: string; name: string }>>([]);
  const [jobTitlesList, setJobTitlesList] = useState<Array<{ id: string; name: string; department_id: string | null }>>([]);
  const [shiftsList, setShiftsList] = useState<Array<{ id: string; name: string; start_time: string; end_time: string }>>([]);

  // Filters
  const [filterBranch, setFilterBranch] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterJob, setFilterJob] = useState<string>("all");
  const [groupByBranch, setGroupByBranch] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

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

  // Reset password
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [allowedExtraBranchIds, setAllowedExtraBranchIds] = useState<string[]>([]);
  const [resettingPassword, setResettingPassword] = useState(false);

  const handleResetPassword = async () => {
    if (!selectedEmployee || !resetPasswordValue) {
      toast.error("أدخل كلمة المرور الجديدة");
      return;
    }
    if (resetPasswordValue.length < 3) {
      toast.error("كلمة المرور يجب أن تكون 3 أحرف على الأقل");
      return;
    }
    setResettingPassword(true);
    try {
      const { data, error } = await supabase.functions.invoke("create-employee-account", {
        body: { action: "reset-password", employee_id: selectedEmployee.id, new_password: resetPasswordValue },
      });
      if (error || data?.error) toast.error(data?.error || error?.message || "فشل إعادة تعيين كلمة المرور");
      else { toast.success(data.message || "تم إعادة تعيين كلمة المرور بنجاح"); setShowResetPassword(false); setResetPasswordValue(""); }
    } catch (err: any) { toast.error(err.message || "خطأ غير متوقع"); }
    finally { setResettingPassword(false); }
  };

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
    if (accountForm.password.length < 3) {
      toast.error("كلمة المرور يجب أن تكون 3 أحرف على الأقل");
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
    if (!user || !dataOwnerId) return;
    setLoading(true);
    const { data, error } = await supabase.from("employees").select("*").eq("user_id", dataOwnerId);
    if (error) { toast.error("خطأ في جلب الموظفين"); console.error(error); }
    else {
      const sorted = ((data as any[]) || []).sort((a, b) => {
        const numA = parseInt(a.employee_number || "999999", 10);
        const numB = parseInt(b.employee_number || "999999", 10);
        return (isNaN(numA) ? 999999 : numA) - (isNaN(numB) ? 999999 : numB);
      });
      setEmployees(sorted);
    }
    // Bulk load allowed extra branches for all employees in this tenant
    try {
      const { data: ab } = await supabase
        .from("employee_allowed_branches")
        .select("employee_id, branch_id")
        .eq("user_id", dataOwnerId);
      const map: Record<string, string[]> = {};
      ((ab as any[]) || []).forEach((r) => {
        if (!map[r.employee_id]) map[r.employee_id] = [];
        map[r.employee_id].push(r.branch_id);
      });
      setAllowedBranchesMap(map);
    } catch (e) { console.error("allowed branches bulk load failed", e); }
    setLoading(false);
  };

  const fetchBranches = async () => {
    if (!user || !dataOwnerId) return;
    const { data } = await supabase.from("branches").select("id, name").eq("user_id", dataOwnerId).eq("is_active", true).order("name");
    setBranchesList((data as Branch[]) || []);
  };

  const fetchDefinitions = async () => {
    if (!user || !dataOwnerId) return;
    const [dRes, jRes, sRes] = await Promise.all([
      supabase.from("departments").select("id,name,name_ar,is_active,is_deleted").eq("user_id", dataOwnerId).eq("is_deleted", false).eq("is_active", true).order("name"),
      supabase.from("job_titles").select("id,name,name_ar,department_id,is_active,is_deleted").eq("user_id", dataOwnerId).eq("is_deleted", false).eq("is_active", true).order("name"),
      supabase.from("work_shifts").select("id,name,start_time,end_time").eq("user_id", dataOwnerId).eq("is_active", true).order("start_time"),
    ]);
    setDepartmentsList(((dRes.data as any[]) || []).map((d) => ({ id: d.id, name: d.name_ar || d.name })));
    setJobTitlesList(((jRes.data as any[]) || []).map((j) => ({ id: j.id, name: j.name_ar || j.name, department_id: j.department_id })));
    setShiftsList(((sRes.data as any[]) || []).map((s) => ({ id: s.id, name: s.name, start_time: s.start_time, end_time: s.end_time })));
  };

  const handleAddBranch = async () => {
    if (!user || !newBranchName.trim()) return;
    const { error } = await supabase.from("branches").insert({
      user_id: dataOwnerId, name: newBranchName.trim(),
      latitude: 0, longitude: 0, radius_meters: 100,
    } as any);
    if (error) { toast.error("خطأ في إضافة الفرع"); return; }
    toast.success("تم إضافة الفرع");
    setNewBranchName("");
    setShowAddBranch(false);
    fetchBranches();
  };

  useEffect(() => { fetchEmployees(); fetchBranches(); fetchDefinitions(); }, [user, dataOwnerId]);

  // Deep-link: open employee drawer + (optionally) create-account dialog
  // when navigated with ?openAccount=<employeeId> from Employee360 / elsewhere.
  useEffect(() => {
    const openAccountId = searchParams.get("openAccount");
    if (!openAccountId || employees.length === 0) return;
    const emp = employees.find((e) => e.id === openAccountId);
    if (!emp) return;
    setSelectedEmployee(emp);
    fetchEmployeeDetails(emp.id);
    setActiveTab("info");
    setDrawerOpen(true);
    if (!(emp as any).auth_user_id) {
      setAccountForm({ email: emp.email || "", password: "" });
      setShowCreateAccount(true);
    }
    // clear the param so the dialog doesn't reopen on re-renders
    const next = new URLSearchParams(searchParams);
    next.delete("openAccount");
    setSearchParams(next, { replace: true });
  }, [employees, searchParams, setSearchParams]);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user!.id).then(({ data }) => {
      setUserRoles((data || []).map((r: any) => r.role));
    });
  }, [user]);

  const canSeeHR = userRoles.includes("admin") || userRoles.includes("hr_manager") || userRoles.includes("super_admin");

  const fetchEmployeeDetails = async (empId: string) => {
    if (!user) return;
    const [dedRes, allRes, levRes, advRes] = await Promise.all([
      supabase.from("employee_deductions").select("*").eq("employee_id", empId).eq("user_id", dataOwnerId!).order("deduction_date", { ascending: false }),
      supabase.from("employee_allowances").select("*").eq("employee_id", empId).eq("user_id", dataOwnerId!),
      supabase.from("employee_leaves").select("*").eq("employee_id", empId).eq("user_id", dataOwnerId!).order("start_date", { ascending: false }),
      supabase.from("employee_advances").select("*").eq("employee_id", empId).eq("user_id", dataOwnerId!).in("status", ["approved", "active"]),
    ]);
    setDeductions((dedRes.data as any[]) || []);
    setAllowances((allRes.data as any[]) || []);
    setLeaves((levRes.data as any[]) || []);
    setAdvances((advRes.data as any[]) || []);
  };

  const ensureEmployeeAccount = async (employeeName: string) => {
    if (!user) return;
    try {
      const { data: parentExists } = await supabase.from("accounts").select("id").eq("user_id", dataOwnerId!).eq("account_code", "2180").maybeSingle();
      if (!parentExists) {
        await supabase.from("accounts").insert({ user_id: dataOwnerId, account_code: "2180", account_name: "ذمم موظفين", account_type: "التزامات", parent_code: "2100", is_system: true, is_active: true });
      }
      const { data: existingSubs } = await supabase.from("accounts").select("account_code").eq("user_id", dataOwnerId!).eq("parent_code", "2180").order("account_code", { ascending: false }).limit(1);
      const lastCode = existingSubs?.[0]?.account_code;
      const nextCode = lastCode ? String(Number(lastCode) + 1) : "21801";
      const { data: alreadyExists } = await supabase.from("accounts").select("id").eq("user_id", dataOwnerId!).eq("account_name", `ذمم موظف - ${employeeName}`).maybeSingle();
      if (!alreadyExists) {
        await supabase.from("accounts").insert({ user_id: dataOwnerId, account_code: nextCode, account_name: `ذمم موظف - ${employeeName}`, account_type: "التزامات", parent_code: "2180", is_system: false, is_active: true });
      }
    } catch (err) { console.error("Error creating employee account:", err); }
  };

  const loadAllowedBranches = async (empId: string) => {
    const { data } = await supabase
      .from("employee_allowed_branches")
      .select("branch_id")
      .eq("employee_id", empId);
    setAllowedExtraBranchIds((data || []).map((r: any) => r.branch_id));
  };

  const handleSave = async () => {
    if (!user || !form.full_name) { toast.error("اسم الموظف مطلوب"); return; }
    const payload = { ...form, user_id: dataOwnerId };
    let savedId: string | null = editingId;
    if (editingId) {
      const { error } = await supabase.from("employees").update(payload as any).eq("id", editingId);
      if (error) toast.error("خطأ في التحديث"); else { toast.success("تم التحديث"); setShowForm(false); setEditingId(null); fetchEmployees(); }
    } else {
      const { data: inserted, error } = await supabase.from("employees").insert(payload as any).select("id").single();
      if (error) toast.error("خطأ في الإضافة");
      else {
        savedId = inserted?.id || null;
        toast.success("تمت الإضافة"); setShowForm(false); fetchEmployees(); await ensureEmployeeAccount(form.full_name!);
      }
    }
    // Sync allowed extra branches
    if (savedId) {
      try {
        await supabase.from("employee_allowed_branches").delete().eq("employee_id", savedId);
        const rows = allowedExtraBranchIds
          .filter(bId => bId && bId !== form.branch_id)
          .map(bId => ({ employee_id: savedId!, branch_id: bId, user_id: dataOwnerId }));
        if (rows.length) {
          await supabase.from("employee_allowed_branches").insert(rows);
        }
      } catch (e) { console.error("allowed branches sync failed", e); }
    }
    setForm(emptyEmployee);
    setAllowedExtraBranchIds([]);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("هل أنت متأكد من حذف هذا الموظف؟")) return;
    const employeeToDelete = employees.find(e => e.id === id);
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) { toast.error("خطأ في الحذف"); return; }
    if (employeeToDelete && user) {
      const accountName = `ذمم موظف - ${employeeToDelete.full_name}`;
      const { data: empAccount } = await supabase.from("accounts").select("account_code").eq("user_id", dataOwnerId!).eq("account_name", accountName).maybeSingle();
      if (empAccount) {
        const { count } = await supabase.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", dataOwnerId!).or(`debit_account_code.eq.${empAccount.account_code},credit_account_code.eq.${empAccount.account_code}`);
        if (!count || count === 0) await supabase.from("accounts").delete().eq("user_id", dataOwnerId!).eq("account_name", accountName);
        else await supabase.from("accounts").update({ is_active: false }).eq("user_id", dataOwnerId!).eq("account_name", accountName);
      }
    }
    toast.success("تم الحذف");
    fetchEmployees();
    if (selectedEmployee?.id === id) { setSelectedEmployee(null); setDrawerOpen(false); }
  };

  const handleAddDeduction = async () => {
    if (!user || !selectedEmployee) return;
    const { error } = await supabase.from("employee_deductions").insert({ ...deductionForm, employee_id: selectedEmployee.id, user_id: dataOwnerId } as any);
    if (error) toast.error("خطأ"); else { toast.success("تمت الإضافة"); setShowDeductionForm(false); setDeductionForm({ deduction_type: "سلفة", amount: 0, deduction_date: new Date().toISOString().split("T")[0], description: "", notes: "" }); fetchEmployeeDetails(selectedEmployee.id); }
  };

  const handleAddAllowance = async () => {
    if (!user || !selectedEmployee) return;
    const { error } = await supabase.from("employee_allowances").insert({ ...allowanceForm, employee_id: selectedEmployee.id, user_id: dataOwnerId, is_active: true } as any);
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
    const { data: movementsData } = await supabase.from("employee_financial_movements").select("*").eq("employee_id", selectedEmployee.id).eq("user_id", dataOwnerId!).eq("salary_month", month).eq("salary_year", year).eq("status", "approved").eq("movement_type", "debit");
    const movementsTotal = (movementsData || []).reduce((s: number, m: any) => s + Number(m.amount || 0), 0);
    const legacyDeductions = deductions.filter(d => !d.is_repaid).reduce((s: number, d: any) => s + Number(d.amount || 0), 0);
    const slip = calculateSalarySlip({
      baseSalary: Number(selectedEmployee.base_salary) || 0, hourlyRate: Number(selectedEmployee.hourly_rate) || 0,
      workDaysPerWeek: selectedEmployee.work_days_per_week || 6, workHoursPerDay: selectedEmployee.work_hours_per_day || 10,
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
    loadAllowedBranches(emp.id);
    setActiveTab("info");
    setDrawerOpen(true);
  };

  // Derived data
  const branchMap = useMemo(() => {
    const m: Record<string, string> = {};
    branchesList.forEach(b => { m[b.id] = b.name; });
    return m;
  }, [branchesList]);
  const deptIdMap = useMemo(() => {
    const m: Record<string, string> = {};
    departmentsList.forEach((d) => { m[d.id] = d.name; });
    return m;
  }, [departmentsList]);
  const jobIdMap = useMemo(() => {
    const m: Record<string, string> = {};
    jobTitlesList.forEach((j) => { m[j.id] = j.name; });
    return m;
  }, [jobTitlesList]);
  /** الاسم المعروض للمسمى الوظيفي: relation أولاً ثم النص القديم */
  const displayJobTitle = (e: Employee) => (e.job_title_id && jobIdMap[e.job_title_id]) || e.job_title || e.position || "—";
  /** الاسم المعروض للقسم */
  const displayDepartment = (e: Employee) => (e.department_id && deptIdMap[e.department_id]) || e.department || "—";
  const getBranchName = (emp: Employee) => emp.branch_id ? (branchMap[emp.branch_id] || emp.department || "—") : (emp.department || "—");
  const jobs = useMemo(() => [...new Set(employees.filter(e => e.job_title).map(e => e.job_title))], [employees]);

  const filtered = useMemo(() => {
    let list = employees.filter(e =>
      (e.full_name?.includes(search) || e.id_number?.includes(search) || e.job_title?.includes(search) || e.position?.includes(search))
    );
    if (filterBranch !== "all") list = list.filter(e => (e.branch_id || "") === filterBranch);
    if (filterStatus === "active") list = list.filter(e => e.is_active);
    else if (filterStatus === "inactive") list = list.filter(e => !e.is_active);
    if (filterJob !== "all") list = list.filter(e => e.job_title === filterJob);
    if (dateFrom) list = list.filter(e => (e.start_date || "") >= dateFrom);
    if (dateTo) list = list.filter(e => (e.start_date || "") <= dateTo);

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
  }, [employees, search, filterBranch, filterStatus, filterJob, dateFrom, dateTo, sortField, sortDir]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / perPage);
  const paged = useMemo(() => {
    if (groupByBranch) return filtered; // no pagination when grouped
    const start = (page - 1) * perPage;
    return filtered.slice(start, start + perPage);
  }, [filtered, page, perPage, groupByBranch]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [search, filterBranch, filterStatus, filterJob, perPage]);

  const activeCount = employees.filter(e => e.is_active).length;
  const totalSalaries = employees.filter(e => e.is_active).reduce((s, e) => s + Number(e.base_salary || 0), 0);

  // Group by branch
  const groupedData = useMemo(() => {
    if (!groupByBranch) return null;
    const groups: Record<string, Employee[]> = {};
    filtered.forEach(e => {
      const key = getBranchName(e);
      if (!groups[key]) groups[key] = [];
      groups[key].push(e);
    });
    return groups;
  }, [filtered, groupByBranch]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("asc"); }
  };

  const SortHeader = ({ label, field }: { label: string; field: SortField }) => (
    <button onClick={() => toggleSort(field)} className="flex items-center gap-1 hover:text-primary-foreground/80 transition-colors w-full">
      {label}
      <ArrowUpDown className={`h-3 w-3 ${sortField === field ? "opacity-100" : "opacity-30"}`} />
    </button>
  );

  const leaveBalance = selectedEmployee ? calculateLeaveBalance(
    selectedEmployee.start_date,
    Number((selectedEmployee as any).previous_year_balance) || 0,
    leaves.filter(l => (l.status === "موافق عليها" || l.status === "موافقة" || l.status === "معتمدة") && new Date(l.start_date).getFullYear() === new Date().getFullYear()).reduce((s: number, l: any) => s + Number(l.days_count || 0), 0)
  ) : null;

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
          <p className="text-xs text-muted-foreground truncate">{displayJobTitle(emp)}</p>
        </div>
        <Badge
          variant={emp.is_active ? "default" : "secondary"}
          className={`text-[10px] ${emp.is_active ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" : ""}`}
        >
          {emp.is_active ? "نشط" : "متوقف"}
        </Badge>
      </CardContent>
    </Card>
  );

  const renderEmployeeRow = (emp: Employee, idx: number) => {
    const stLabel = emp.is_active ? "نشط" : (emp as any).is_terminated ? "منتهي" : "موقوف";
    const stStyles = {
      "نشط": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
      "موقوف": "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
      "منتهي": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    }[stLabel] || "";
    const dotColor = {
      "نشط": "bg-green-500",
      "موقوف": "bg-yellow-500",
      "منتهي": "bg-red-500",
    }[stLabel] || "bg-muted";

    return (
      <tr
        key={emp.id}
        className={`border-b border-border/50 transition-colors cursor-pointer ${
          idx % 2 === 0 ? "bg-background" : "bg-muted/20"
        } hover:bg-primary/5`}
        onClick={() => openEmployeeDrawer(emp)}
      >
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-xs flex-shrink-0">
              {emp.full_name?.charAt(0)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{emp.full_name}</p>
              <p className="text-[10px] text-muted-foreground">{(emp as any).employee_number || emp.id_number || "—"}</p>
            </div>
          </div>
        </td>
        <td className="px-3 py-3 text-xs text-muted-foreground">
          <div className="flex flex-col gap-1">
            <span>{getBranchName(emp)}</span>
            {(allowedBranchesMap[emp.id]?.length ?? 0) > 0 && (
              <div className="flex flex-wrap gap-1">
                {allowedBranchesMap[emp.id].map((bId) => (
                  <span
                    key={bId}
                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] bg-primary/10 text-primary border border-primary/20"
                    title="فرع إضافي مسموح للحضور"
                  >
                    + {branchMap[bId] || "—"}
                  </span>
                ))}
              </div>
            )}
          </div>
        </td>
        <td className="px-3 py-3 text-xs text-muted-foreground">{displayJobTitle(emp)}</td>
        <td className="px-3 py-3 text-xs text-muted-foreground tabular-nums">{emp.start_date || "—"}</td>
        <td className="px-3 py-3 text-sm font-bold tabular-nums text-foreground">{formatCurrency(Number(emp.base_salary || 0))}</td>
        <td className="px-3 py-3">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${stStyles}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
            {stLabel}
          </span>
        </td>
        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(`/hr/employee/${emp.id}`)} className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors" title="ملف 360">
              <Users className="h-3.5 w-3.5 text-primary" />
            </button>
            <button onClick={() => { setForm(emp); setEditingId(emp.id); setShowForm(true); loadAllowedBranches(emp.id); }} className="p-1.5 rounded-lg hover:bg-primary/10 transition-colors" title="تعديل">
              <Pencil className="h-3.5 w-3.5 text-primary" />
            </button>
            <button onClick={() => navigate(`/account-statement?employee_name=${encodeURIComponent(emp.full_name)}`)} className="p-1.5 rounded-lg hover:bg-accent/50 transition-colors" title="كشف حساب">
              <FileBarChart className="h-3.5 w-3.5 text-accent-foreground" />
            </button>
            <button onClick={() => handleDelete(emp.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="حذف">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </button>
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-full mx-auto hr-themed" dir="rtl">
      <PageHeader title="إدارة الموظفين" breadcrumb={["الموارد البشرية", "الموظفين"]} />
      {/* Actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowHolidays(true)} className="gap-1 rounded-xl">
            <CalendarDays className="h-4 w-4" /> العطل الرسمية
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-1 rounded-xl">
            <Upload className="h-4 w-4" /> استيراد Excel
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDeductionsExport(true)} className="gap-1 rounded-xl">
            <Download className="h-4 w-4" /> تصدير المسحوبات
          </Button>
          <Button onClick={() => { setForm(emptyEmployee); setEditingId(null); setAllowedExtraBranchIds([]); setShowForm(true); }} className="gap-1.5 rounded-xl shadow-md shadow-primary/20">
            <Plus className="h-4 w-4" /> إضافة موظف
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "إجمالي الموظفين", value: employees.length, icon: Users, color: "text-muted-foreground", bg: "bg-muted/50 border-border" },
          { label: "موظف نشط", value: activeCount, icon: Users, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
          { label: "غير نشط", value: employees.length - activeCount, icon: Calendar, color: "text-yellow-600", bg: "bg-yellow-50 border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-800" },
          { label: "إجمالي الرواتب", value: `₪${totalSalaries.toLocaleString()}`, icon: DollarSign, color: "text-primary", bg: "bg-primary/5 border-primary/10" },
        ].map((k, i) => (
          <div key={i} className={`rounded-2xl border p-4 ${k.bg}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] text-muted-foreground font-medium mb-1">{k.label}</p>
                <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
              </div>
              <k.icon className={`h-5 w-5 ${k.color} opacity-50`} />
            </div>
          </div>
        ))}
      </div>

      <Card className="border-0 shadow-sm rounded-2xl overflow-hidden">
        <CardContent className="p-3 space-y-3">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50 pointer-events-none" />
            <Input
              placeholder="بحث بالاسم، رقم الهوية، الوظيفة..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pr-10 rounded-xl bg-muted/30 border-0 focus-visible:ring-2 focus-visible:ring-primary/20"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {!isMobile && (
            <div className="flex items-center gap-3 flex-wrap">
              <Select value={filterBranch} onValueChange={setFilterBranch}>
                <SelectTrigger className="w-[140px] rounded-xl text-xs h-9">
                  <Filter className="h-3 w-3 ml-1" />
                  <SelectValue placeholder="الفرع" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع</SelectItem>
                  {branchesList.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>

              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[120px] rounded-xl text-xs h-9">
                  <SelectValue placeholder="الحالة" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">الكل</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="inactive">غير نشط</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterJob} onValueChange={setFilterJob}>
                <SelectTrigger className="w-[140px] rounded-xl text-xs h-9">
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
                className="gap-1 text-xs rounded-xl h-9"
              >
                <Layers className="h-3 w-3" /> تجميع بالفرع
              </Button>
              <DateRangeFilter
                dateFrom={dateFrom}
                dateTo={dateTo}
                onDateFromChange={setDateFrom}
                onDateToChange={setDateTo}
                onClear={() => { setDateFrom(""); setDateTo(""); }}
                compact
              />

              <span className="text-[11px] text-muted-foreground mr-auto">{filtered.length} موظف</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : isMobile ? (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">لا يوجد موظفون</p>
          ) : (
            filtered.map(emp => renderMobileCard(emp))
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 space-y-2">
          <Search className="h-10 w-10 text-muted-foreground/20 mx-auto" />
          <p className="text-sm text-muted-foreground">لا يوجد موظفون يطابقون البحث</p>
          <Button variant="ghost" size="sm" onClick={() => { setSearch(""); setFilterBranch("all"); setFilterStatus("all"); setFilterJob("all"); }}>مسح الفلاتر</Button>
        </div>
      ) : (
         <div className="rounded-xl border border-border overflow-hidden shadow-sm">
           <div className="overflow-x-auto" dir="rtl">
             <table className="w-full text-sm border-collapse" dir="rtl">
              <thead>
                <tr className="bg-primary text-primary-foreground">
                  <th className="px-3 py-3 text-right text-xs font-semibold min-w-[200px]"><SortHeader label="الموظف" field="full_name" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الفرع" field="department" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الوظيفة" field="job_title" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="تاريخ التعيين" field="start_date" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الراتب الأساسي" field="base_salary" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold"><SortHeader label="الحالة" field="is_active" /></th>
                  <th className="px-3 py-3 text-right text-xs font-semibold">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {groupByBranch && groupedData ? (
                  Object.entries(groupedData).map(([branch, emps]) => (
                    <>
                      <tr key={`group-${branch}`} className="bg-muted/50">
                        <td colSpan={7} className="px-3 py-2 font-bold text-sm">
                          <div className="flex items-center gap-2">
                            <Layers className="h-4 w-4 text-primary" />
                            {branch}
                            <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-semibold">{emps.length}</span>
                          </div>
                        </td>
                      </tr>
                      {emps.map((emp, i) => renderEmployeeRow(emp, i))}
                    </>
                  ))
                ) : (
                  paged.map((emp, i) => renderEmployeeRow(emp, i))
                )}
              </tbody>
              <tfoot>
                <tr className="bg-primary/5 border-t-2 border-primary/20 font-bold text-sm">
                  <td className="px-3 py-3 text-right text-foreground">المجموع ({filtered.length} موظف)</td>
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 tabular-nums text-foreground">₪{filtered.reduce((s, e) => s + Number(e.base_salary || 0), 0).toLocaleString()}</td>
                  <td className="px-3 py-3 text-xs text-green-600 font-semibold">{filtered.filter(e => e.is_active).length} نشط</td>
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {!groupByBranch && filtered.length > perPage && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-border/50 bg-muted/20">
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  عرض {Math.min((page - 1) * perPage + 1, filtered.length)}–{Math.min(page * perPage, filtered.length)} من {filtered.length}
                </p>
                <Select value={String(perPage)} onValueChange={v => { setPerPage(Number(v)); setPage(1); }}>
                  <SelectTrigger className="h-7 w-[70px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZE_OPTIONS.map(n => <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                  <ChevronRight className="h-3.5 w-3.5 ml-1" /> السابق
                </Button>
                {Array.from({ length: totalPages }, (_, i) => i + 1).slice(
                  Math.max(0, page - 3), Math.min(totalPages, page + 2)
                ).map(n => (
                  <Button key={n} variant={page === n ? "default" : "outline"} size="sm" className="rounded-lg h-8 w-8 text-xs p-0" onClick={() => setPage(n)}>
                    {n}
                  </Button>
                ))}
                <Button variant="outline" size="sm" className="rounded-lg h-8 text-xs" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                  التالي <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">صفحة {page} من {totalPages}</p>
            </div>
          )}
        </div>
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
                      <p className="text-sm text-muted-foreground">{displayJobTitle(selectedEmployee)}</p>
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
                {selectedEmployee.auth_user_id && (
                  <>
                    <Badge variant="secondary" className="text-[10px]">لديه حساب ✓</Badge>
                    <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => { setResetPasswordValue(""); setShowResetPassword(true); }}>
                      <Shield className="h-3 w-3" /> إعادة كلمة المرور
                    </Button>
                  </>
                )}
                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={generateSalarySlip}>
                  <DollarSign className="h-3 w-3" /> قسيمة راتب
                </Button>
                {selectedEmployee.is_active && (
                  <Button size="sm" variant="outline" className="gap-1 text-xs text-destructive" onClick={() => setShowTermination(true)}>
                    <LogOutIcon className="h-3 w-3" /> إنهاء خدمة
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => { setForm(selectedEmployee); setEditingId(selectedEmployee.id); setShowForm(true); loadAllowedBranches(selectedEmployee.id); }}><Edit className="h-3 w-3" /></Button>
                <Button size="sm" variant="destructive" onClick={() => handleDelete(selectedEmployee.id)}><Trash2 className="h-3 w-3" /></Button>
              </div>

              {/* Manager Role Toggles */}
              <div className="flex flex-wrap items-center gap-4 mb-4 p-3 bg-muted/30 rounded-xl border border-border">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!(selectedEmployee as any).is_manager}
                    onCheckedChange={async (checked) => {
                      await supabase.from("employees").update({ is_manager: checked } as any).eq("id", selectedEmployee.id);
                      setSelectedEmployee({ ...selectedEmployee, is_manager: checked } as any);
                      fetchEmployees();
                      toast.success(checked ? "تم تعيينه كمدير" : "تم إلغاء صفة المدير");
                    }}
                  />
                  <label className="text-xs font-medium flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5 text-primary" /> مدير فرع
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!(selectedEmployee as any).is_hr_manager}
                    onCheckedChange={async (checked) => {
                      await supabase.from("employees").update({ is_hr_manager: checked } as any).eq("id", selectedEmployee.id);
                      setSelectedEmployee({ ...selectedEmployee, is_hr_manager: checked } as any);
                      fetchEmployees();
                      toast.success(checked ? "تم تعيينه كمدير HR" : "تم إلغاء صفة مدير HR");
                    }}
                  />
                  <label className="text-xs font-medium flex items-center gap-1">
                    <Shield className="h-3.5 w-3.5 text-amber-500" /> مدير HR
                  </label>
                </div>
                <SalesRepToggleSection
                  employeeId={selectedEmployee.id}
                  employeeName={selectedEmployee.full_name}
                  authUserId={(selectedEmployee as any).auth_user_id || null}
                />
                <CashierToggleSection
                  employeeId={selectedEmployee.id}
                  employeeName={selectedEmployee.full_name}
                  authUserId={(selectedEmployee as any).auth_user_id || null}
                />
                <FeedbackToggleSection
                  employeeName={selectedEmployee.full_name}
                  authUserId={(selectedEmployee as any).auth_user_id || null}
                />
              </div>

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
                      ["الرقم الوظيفي", (selectedEmployee as any).employee_number || "—"],
                      ["رقم الهوية", selectedEmployee.id_number],
                      ["الهاتف", selectedEmployee.phone],
                      ["البريد", selectedEmployee.email],
                      ["الجنس", (selectedEmployee as any).gender === "female" ? "أنثى" : "ذكر"],
                      ["الحالة الاجتماعية", (selectedEmployee as any).marital_status === "married" ? "متزوج" : (selectedEmployee as any).marital_status === "divorced" ? "مطلق" : "أعزب"],
                      ["عدد الأبناء", (selectedEmployee as any).children_count || 0],
                      ["المنصب", selectedEmployee.position],
                      ["الفرع", getBranchName(selectedEmployee)],
                      ["الفروع الفرعية", allowedExtraBranchIds.length
                        ? allowedExtraBranchIds.map(id => branchMap[id]).filter(Boolean).join("، ")
                        : "—"],
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

                  {/* ── Opening Balance Section ── */}
                  <EmployeeOpeningBalance
                    employee={selectedEmployee}
                    userId={dataOwnerId || user?.id || ""}
                    onSaved={() => fetchEmployeeDetails(selectedEmployee.id)}
                  />
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
                      userId={dataOwnerId || user.id}
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
                      userId={dataOwnerId || user.id}
                    />
                  )}
                </TabsContent>

                <TabsContent value="leaves">
                  {user && selectedEmployee && (
                    <EmployeeLeavesTab
                      employeeId={selectedEmployee.id}
                      userId={dataOwnerId || user.id}
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
                        userId={dataOwnerId || user.id}
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
            <div><label className="text-xs text-muted-foreground">الرقم الوظيفي</label><Input value={(form as any).employee_number || ""} onChange={e => setForm({ ...form, employee_number: e.target.value } as any)} /></div>
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
            <div>
              <label className="text-xs text-muted-foreground">القسم (اختياري)</label>
              <Select
                value={form.department_id || "_none"}
                onValueChange={(v) => {
                  const id = v === "_none" ? null : v;
                  const label = id ? (departmentsList.find((d) => d.id === id)?.name || form.department || "") : (form.department || "");
                  setForm({ ...form, department_id: id, department: label });
                }}
              >
                <SelectTrigger><SelectValue placeholder="اختر القسم" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">بدون</SelectItem>
                  {departmentsList.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">الفرع</label>
              <Select value={form.branch_id || "_none"} onValueChange={v => setForm({ ...form, branch_id: v === "_none" ? undefined : v })}>
                <SelectTrigger><SelectValue placeholder="اختر الفرع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">بدون فرع</SelectItem>
                  {branchesList.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  <div className="border-t border-border mt-1 pt-1 px-2 pb-1">
                    {showAddBranch ? (
                      <div className="flex gap-1">
                        <Input
                          value={newBranchName}
                          onChange={e => setNewBranchName(e.target.value)}
                          placeholder="اسم الفرع الجديد"
                          className="h-7 text-xs"
                          onClick={e => e.stopPropagation()}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddBranch(); } }}
                        />
                        <Button size="sm" className="h-7 text-xs px-2" onClick={e => { e.preventDefault(); handleAddBranch(); }}>إضافة</Button>
                      </div>
                    ) : (
                      <button onClick={e => { e.preventDefault(); e.stopPropagation(); setShowAddBranch(true); }} className="text-xs text-primary hover:underline flex items-center gap-1 w-full py-1">
                        <Plus className="h-3 w-3" /> إضافة فرع جديد
                      </button>
                    )}
                  </div>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">الفروع الفرعية (يستطيع الموظف تسجيل الحضور فيها أيضاً)</label>
              <div className="flex flex-wrap gap-2 mt-1 p-2 border border-border rounded-lg bg-muted/20">
                {branchesList.filter(b => b.id !== form.branch_id).length === 0 ? (
                  <span className="text-xs text-muted-foreground">لا توجد فروع أخرى</span>
                ) : branchesList.filter(b => b.id !== form.branch_id).map(b => {
                  const checked = allowedExtraBranchIds.includes(b.id);
                  return (
                    <label key={b.id} className={`text-xs px-2 py-1 rounded-md border cursor-pointer transition-colors ${checked ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}>
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={checked}
                        onChange={() => {
                          setAllowedExtraBranchIds(prev =>
                            prev.includes(b.id) ? prev.filter(x => x !== b.id) : [...prev, b.id]
                          );
                        }}
                      />
                      {b.name}
                    </label>
                  );
                })}
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">يستطيع الموظف تسجيل الحضور في فرعه الأساسي + الفروع المحددة هنا.</p>
            </div>
            <div><label className="text-xs text-muted-foreground">المسمى الوظيفي</label><Input value={form.job_title || ""} onChange={e => setForm({ ...form, job_title: e.target.value })} /></div>
            <div>
              <label className="text-xs text-muted-foreground">المسمى الوظيفي (مسجَّل)</label>
              <Select
                value={form.job_title_id || "_none"}
                onValueChange={(v) => {
                  const id = v === "_none" ? null : v;
                  const job = id ? jobTitlesList.find((j) => j.id === id) : null;
                  setForm({
                    ...form,
                    job_title_id: id,
                    job_title: job?.name || form.job_title || "",
                    // إذا للمسمى قسم مرتبط، عَبِّ القسم لو فاضي
                    department_id: job?.department_id ?? form.department_id ?? null,
                    department:
                      job?.department_id
                        ? (departmentsList.find((d) => d.id === job.department_id)?.name || form.department || "")
                        : (form.department || ""),
                  });
                }}
              >
                <SelectTrigger><SelectValue placeholder="اختر من القائمة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">بدون</SelectItem>
                  {jobTitlesList
                    .filter((j) => !form.department_id || !j.department_id || j.department_id === form.department_id)
                    .map((j) => <SelectItem key={j.id} value={j.id}>{j.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
            <div><label className="text-xs text-muted-foreground">ساعات العمل/يوم</label><Input type="number" value={form.work_hours_per_day || 10} onChange={e => setForm({ ...form, work_hours_per_day: Number(e.target.value) })} /></div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">الشفت</label>
              <Select
                value={form.shift_id || "__none__"}
                onValueChange={v => {
                  if (v === "__none__") {
                    setForm({ ...form, shift_id: null });
                  } else {
                    const s = shiftsList.find(x => x.id === v);
                    setForm({
                      ...form,
                      shift_id: v,
                      // Mirror to legacy shift_start/end so existing reports/UI keep working
                      shift_start: s?.start_time?.slice(0, 5) || form.shift_start,
                      shift_end: s?.end_time?.slice(0, 5) || form.shift_end,
                    });
                  }
                }}
              >
                <SelectTrigger><SelectValue placeholder="اختر الشفت" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— بدون شفت —</SelectItem>
                  {shiftsList.map(s => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} ({s.start_time?.slice(0,5)} - {s.end_time?.slice(0,5)})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {shiftsList.length === 0 && (
                <p className="text-[10px] text-amber-600 mt-1">
                  لا توجد شفتات معرّفة. أضف من <a href="/hr/shifts" className="underline">إدارة الشفتات</a>.
                </p>
              )}
            </div>
            <div><label className="text-xs text-muted-foreground">بداية الوردية (يدوي - يُستبدل بالشفت)</label><Input type="time" value={(form as any).shift_start || "08:00"} onChange={e => setForm({ ...form, shift_start: e.target.value })} dir="ltr" /></div>
            <div><label className="text-xs text-muted-foreground">نهاية الوردية (يدوي - يُستبدل بالشفت)</label><Input type="time" value={(form as any).shift_end || "16:00"} onChange={e => setForm({ ...form, shift_end: e.target.value })} dir="ltr" /></div>
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
            <div className="col-span-2 border-t border-border pt-3 mt-2">
              <h4 className="text-sm font-bold text-foreground mb-2">إدارة الفريق</h4>
              <p className="text-[11px] text-muted-foreground mb-3">حدّد المدير المباشر لهذا الموظف، أو امنحه صلاحية إدارة فريق إذا كان مديراً/مشرف شفت.</p>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">المدير المباشر</label>
              <Select
                value={form.manager_employee_id || "__none__"}
                onValueChange={v => setForm({ ...form, manager_employee_id: v === "__none__" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="بدون" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— بدون —</SelectItem>
                  {employees
                    .filter((e) => e.id !== editingId)
                    .map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.full_name}{e.position ? ` — ${e.position}` : ""}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 grid grid-cols-1 gap-2 bg-muted/30 rounded-md p-3">
              <label className="flex items-center justify-between gap-2 text-sm border-b pb-2 mb-1">
                <span className="font-medium">هذا الموظف مدير فرع</span>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={!!(form as any).is_manager}
                  onChange={e => setForm({ ...form, is_manager: e.target.checked } as any)}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>يستطيع رؤية فريقه</span>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={!!form.can_view_team}
                  onChange={e => setForm({ ...form, can_view_team: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>يستطيع إدارة جدول الدوام</span>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={!!form.can_manage_schedule}
                  onChange={e => setForm({ ...form, can_manage_schedule: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm">
                <span>يستطيع اعتماد الحضور</span>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={!!form.can_manage_attendance}
                  onChange={e => setForm({ ...form, can_manage_attendance: e.target.checked })}
                />
              </label>
              <label className="flex items-center justify-between gap-2 text-sm border-t pt-2 mt-1">
                <span>إظهار دوام هذا الموظف للزملاء</span>
                <input
                  type="checkbox"
                  className="h-4 w-4"
                  checked={!!form.show_in_employee_team_schedule}
                  onChange={e => setForm({ ...form, show_in_employee_team_schedule: e.target.checked })}
                />
              </label>
            </div>
            {(form as any).is_manager && (
              <div className="col-span-2">
                <ManagerBranchesPicker
                  authUserId={(form as any).auth_user_id || null}
                  companyId={dataOwnerId || null}
                  branches={branchesList as any}
                />
              </div>
            )}
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
            <div><label className="text-xs text-muted-foreground">كلمة المرور (3 أحرف على الأقل)</label><Input type="text" placeholder="كلمة المرور" value={accountForm.password} onChange={e => setAccountForm({ ...accountForm, password: e.target.value })} /></div>
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

      {/* Reset Password Dialog */}
      <Dialog open={showResetPassword} onOpenChange={setShowResetPassword}>
        <DialogContent dir="rtl">
          <DialogHeader><DialogTitle>إعادة تعيين كلمة المرور: {selectedEmployee?.full_name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">أدخل كلمة المرور الجديدة للموظف.</p>
          <div className="space-y-3 mt-2">
            <div><label className="text-xs text-muted-foreground">كلمة المرور الجديدة (3 أحرف على الأقل)</label><Input type="text" placeholder="كلمة المرور الجديدة" value={resetPasswordValue} onChange={e => setResetPasswordValue(e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowResetPassword(false)}>إلغاء</Button>
            <Button onClick={handleResetPassword} disabled={resettingPassword} className="gap-2">
              {resettingPassword && <Loader2 className="h-4 w-4 animate-spin" />}
              تحديث كلمة المرور
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      {user && <EmployeeImportDialog open={showImport} onClose={() => setShowImport(false)} userId={dataOwnerId || user.id} onSuccess={fetchEmployees} />}

      {/* Official Holidays Dialog */}
      {user && <OfficialHolidaysDialog open={showHolidays} onClose={() => setShowHolidays(false)} userId={dataOwnerId || user.id} />}

      {/* Termination Dialog */}
      {user && <TerminationDialog open={showTermination} onClose={() => setShowTermination(false)} employee={selectedEmployee} userId={dataOwnerId || user.id} onSuccess={() => { fetchEmployees(); setSelectedEmployee(null); setDrawerOpen(false); }} />}

      {/* Salary Slip Dialog */}
      <SalarySlipDialog
        open={showSalarySlip}
        onClose={() => setShowSalarySlip(false)}
        slip={salarySlip}
        employeeName={selectedEmployee?.full_name || ""}
        department={selectedEmployee ? getBranchName(selectedEmployee) : ""}
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
        userId={dataOwnerId || user?.id}
      />

      {/* Deductions Export Dialog */}
      {user && (
        <DeductionsExportDialog
          open={showDeductionsExport}
          onClose={() => setShowDeductionsExport(false)}
          userId={dataOwnerId || user.id}
          employees={employees.map(e => ({ id: e.id, full_name: e.full_name, department: e.department, job_title: e.job_title }))}
        />
      )}
    </div>
  );
};

export default EmployeesPage;
