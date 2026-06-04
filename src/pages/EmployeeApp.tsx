import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import EmployeeBottomNav from "@/components/employee/EmployeeBottomNav";
import EmployeeHomeTab from "@/components/employee/EmployeeHomeTab";
import { EmployeeShell } from "@/components/employee/shell/EmployeeShell";
import QRScannerDialog from "@/components/employee/QRScannerDialog";
import AttendanceCalendarTab from "@/components/employee/AttendanceCalendarTab";
import AlertsTab from "@/components/employee/AlertsTab";
import EmployeeProfileTab from "@/components/employee/EmployeeProfileTab";
import EmployeeRequestsTab from "@/components/employee/EmployeeRequestsTab";
import EmployeeFormsTab from "@/components/employee/EmployeeFormsTab";
import EmployeeMyRequestsTab from "@/components/employee/EmployeeMyRequestsTab";
import MyScheduleTab from "@/components/employee/MyScheduleTab";
import EmployeePayslipsTab from "@/components/employee/EmployeePayslipsTab";
import EmployeeFinancialSummaryTab from "@/components/employee/EmployeeFinancialSummaryTab";
import EmployeeAttendanceTab from "@/components/employee/EmployeeAttendanceTab";
import EmployeeDisciplinaryActionsTab from "@/components/employee/EmployeeDisciplinaryActionsTab";
import BranchRosterPage from "@/pages/manager/BranchRosterPage";
import MyTeamTab from "@/components/employee/manager/MyTeamTab";
import TeamAttendanceTab from "@/components/employee/manager/TeamAttendanceTab";
import TeamRequestsTab from "@/components/employee/manager/TeamRequestsTab";
import ShiftSwapsTab from "@/components/employee/manager/ShiftSwapsTab";
import ManagerHeader from "@/components/employee/manager/ManagerHeader";

function NoPerm({ onBack, text }: { onBack: () => void; text: string }) {
  return (
    <div className="pb-24">
      <ManagerHeader title="غير مصرح" onBack={onBack} />
      <div className="p-8 text-center text-muted-foreground text-sm">{text}</div>
    </div>
  );
}

type Tab = "home" | "scan" | "history" | "alerts" | "requests" | "profile" | "forms" | "schedule"
  | "payslips" | "financials" | "attendance" | "actions"
  | "manager-roster" | "manager-team" | "manager-attendance" | "manager-requests" | "manager-swaps";

type AttendanceDay = {
  id: string;
  attendance_date: string;
  first_check_in: string | null;
  last_check_out: string | null;
  total_hours: number;
  overtime_hours: number;
  status: string;
  branch_id: string | null;
  notes: string | null;
};

type CorrectionRequest = {
  id: string;
  attendance_date: string;
  request_type: string;
  reason: string;
  status: string;
  review_notes: string | null;
  created_at: string;
};

type Employee = {
  id: string;
  full_name: string;
  branch_id: string | null;
  position: string | null;
  department: string | null;
  phone: string | null;
  email: string | null;
  is_manager: boolean;
  is_hr_manager: boolean;
  can_view_team?: boolean;
  can_manage_schedule?: boolean;
  can_manage_attendance?: boolean;
  user_id: string;
  company_id?: string;
  date_of_birth?: string | null;
  id_number?: string | null;
  marital_status?: string | null;
  children_count?: number | null;
  start_date?: string | null;
  photo_url?: string | null;
  address?: string | null;
  notes?: string | null;
  shift_id?: string | null;
  shift_start?: string | null;
  shift_end?: string | null;
};

export default function EmployeeApp({ initialTab }: { initialTab?: Tab } = {}) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab || "home");
  const [pendingFormId, setPendingFormId] = useState<string | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [todayRecord, setTodayRecord] = useState<AttendanceDay | null>(null);
  const [todayEvents, setTodayEvents] = useState<{ event_type: string; event_time: string }[]>([]);
  const [history, setHistory] = useState<AttendanceDay[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchName, setBranchName] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [scanAction, setScanAction] = useState<"checkin" | "checkout">("checkin");
  const [isCashier, setIsCashier] = useState(false);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [latestInfoForm, setLatestInfoForm] = useState<Record<string, any> | null>(null);

  // Preview-only opt-in for the new D365-style shell. Default OFF.
  // Activate with ?employeeShell=1 (persists in sessionStorage for the tab).
  // Disable with ?employeeShell=0.
  const [shellEnabled] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const sp = new URLSearchParams(window.location.search);
      const q = sp.get("employeeShell");
      if (q === "1") sessionStorage.setItem("employeeShell", "1");
      if (q === "0") sessionStorage.removeItem("employeeShell");
      return sessionStorage.getItem("employeeShell") === "1";
    } catch {
      return false;
    }
  });

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      const userRoles = (roles || []).map(r => r.role);
      setIsCashier(userRoles.includes("cashier"));

      const { data: emp } = await supabase
        .from("employees")
        .select("id, full_name, branch_id, position, department, phone, email, is_manager, is_hr_manager, can_view_team, can_manage_schedule, can_manage_attendance, user_id, company_id, date_of_birth, id_number, marital_status, children_count, start_date, photo_url, address, notes, shift_id, shift_start, shift_end")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .single();
      setEmployee(emp as Employee | null);
      if (!emp) { setLoading(false); return; }

      if (emp.branch_id) {
        const { data: br } = await supabase.from("branches_safe").select("name").eq("id", emp.branch_id).single();
        setBranchName(br?.name || "");
      }

      // Company logo — fetched via SECURITY DEFINER RPC so employees can see
      // their tenant's logo even when RLS blocks direct reads on companies.
      try {
        const { data: logo } = await supabase.rpc("get_tenant_company_logo");
        setCompanyLogo((logo as string) || null);
      } catch {
        setCompanyLogo(null);
      }

      // Latest employee_info submission (for fields not yet on employees row)
      const { data: infoForm } = await supabase
        .from("employee_forms")
        .select("form_data, status, created_at")
        .eq("employee_id", emp.id)
        .eq("form_type", "employee_info")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setLatestInfoForm((infoForm as any)?.form_data || null);

      const today = new Date().toISOString().split("T")[0];

      const [todayRes, histRes, corrRes, eventsRes] = await Promise.all([
        supabase.from("attendance_days").select("*").eq("employee_id", emp.id).eq("attendance_date", today).single(),
        supabase.from("attendance_days").select("*").eq("employee_id", emp.id).order("attendance_date", { ascending: false }).limit(60),
        supabase.from("correction_requests").select("*").eq("employee_id", emp.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("attendance_events").select("event_type, event_time").eq("employee_id", emp.id)
          .gte("event_time", `${today}T00:00:00`).lte("event_time", `${today}T23:59:59`)
          .eq("status", "valid").order("event_time", { ascending: true }),
      ]);

      setTodayRecord(todayRes.data);
      setHistory(histRes.data || []);
      setCorrections(corrRes.data || []);
      setTodayEvents(eventsRes.data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleNavigate = (tab: Tab) => {
    if (tab === "scan") {
      const lastEvt = todayEvents.length > 0 ? todayEvents[todayEvents.length - 1] : null;
      const canCheckOut = lastEvt?.event_type === "check_in";
      setScanAction(canCheckOut ? "checkout" : "checkin");
      setScanOpen(true);
    } else {
      setActiveTab(tab);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background" style={{ fontFamily: "Tajawal, sans-serif" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 rounded-full border-[3px] border-muted animate-spin" style={{ borderTopColor: "hsl(var(--primary))" }} />
          <p className="text-xs text-muted-foreground">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6" dir="rtl" style={{ fontFamily: "Tajawal, sans-serif" }}>
        <div className="text-center space-y-4 max-w-xs">
          <div className="w-16 h-16 rounded-2xl bg-warning/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="h-8 w-8 text-warning" />
          </div>
          <h2 className="text-lg font-bold text-foreground">لم يتم ربط حسابك بسجل موظف</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">تواصل مع مسؤول الموارد البشرية لربط حسابك بسجل الموظف الخاص بك.</p>
          <Button variant="outline" onClick={() => navigate("/auth")} className="rounded-xl">
            العودة لتسجيل الدخول
          </Button>
        </div>
      </div>
    );
  }

  const incompleteDays = history.filter((d) => d.status === "incomplete");

  return (
    <div
      className="min-h-[100dvh] bg-background overscroll-none"
      style={{ fontFamily: "Tajawal, sans-serif", paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="max-w-lg mx-auto">
        {activeTab === "home" && (
          <EmployeeHomeTab
            employeeName={employee.full_name}
            todayRecord={todayRecord}
            todayEvents={todayEvents}
            history={history}
            onScanTap={() => handleNavigate("scan")}
            onNavigate={(tab) => setActiveTab(tab as Tab)}
            isCashier={isCashier}
            onOpenPOS={() => navigate("/pos")}
            canViewTeam={!!employee.can_view_team}
            canManageSchedule={!!employee.can_manage_schedule}
            canManageAttendance={!!employee.can_manage_attendance}
            isManager={!!employee.is_manager}
            branchName={branchName}
            companyLogo={companyLogo}
            onOpenManagerRoute={(path) => {
              if (path.startsWith("/employee/roster") || path.startsWith("/manager/roster")) setActiveTab("manager-roster");
              else if (path.startsWith("/employee/team-attendance")) setActiveTab("manager-attendance");
              else if (path.startsWith("/employee/team-requests")) setActiveTab("manager-requests");
              else if (path.startsWith("/employee/shift-swaps")) setActiveTab("manager-swaps");
              else if (path.startsWith("/employee/team")) setActiveTab("manager-team");
              else navigate(path);
            }}
          />
        )}

        {activeTab === "history" && (
          <AttendanceCalendarTab history={history} />
        )}

        {activeTab === "manager-roster" && (
          <div className="pb-24">
            {(employee.can_manage_schedule || employee.is_manager) ? (
              <>
                <ManagerHeader title="جدول الدوام" subtitle={branchName} onBack={() => setActiveTab("home")} />
                <BranchRosterPage />
              </>
            ) : (
              <NoPerm onBack={() => setActiveTab("home")} text="لا تملك صلاحية إدارة جدول الدوام" />
            )}
          </div>
        )}

        {activeTab === "manager-team" && (
          employee.can_view_team || employee.is_manager
            ? <MyTeamTab branchId={employee.branch_id} branchName={branchName} onBack={() => setActiveTab("home")} />
            : <NoPerm onBack={() => setActiveTab("home")} text="لا تملك صلاحية عرض الفريق" />
        )}

        {activeTab === "manager-attendance" && (
          employee.can_manage_attendance || employee.is_manager
            ? <TeamAttendanceTab branchId={employee.branch_id} branchName={branchName} onBack={() => setActiveTab("home")} />
            : <NoPerm onBack={() => setActiveTab("home")} text="لا تملك صلاحية إدارة الحضور" />
        )}

        {activeTab === "manager-requests" && (
          employee.can_manage_attendance || employee.can_manage_schedule || employee.is_manager
            ? <TeamRequestsTab branchId={employee.branch_id} branchName={branchName} onBack={() => setActiveTab("home")} />
            : <NoPerm onBack={() => setActiveTab("home")} text="لا تملك صلاحية اعتماد الطلبات" />
        )}

        {activeTab === "manager-swaps" && (
          employee.can_manage_schedule || employee.is_manager
            ? <ShiftSwapsTab branchId={employee.branch_id} branchName={branchName} onBack={() => setActiveTab("home")} />
            : <NoPerm onBack={() => setActiveTab("home")} text="لا تملك صلاحية تبديل الورديات" />
        )}

        {activeTab === "schedule" && (
          <MyScheduleTab employeeId={employee.id} companyId={employee.company_id} />
        )}

        {activeTab === "requests" && (
          shellEnabled ? (
            <EmployeeShell
              title="طلباتي"
              subtitle="طلباتك السابقة وحالة كل طلب"
              breadcrumb={[
                { label: "الرئيسية", onClick: () => setActiveTab("home") },
                { label: "طلباتي" },
              ]}
            >
              <EmployeeMyRequestsTab employeeId={employee.id} />
            </EmployeeShell>
          ) : (
            <EmployeeMyRequestsTab employeeId={employee.id} />
          )
        )}

        {activeTab === "payslips" && (
          <EmployeePayslipsTab employeeId={employee.id} />
        )}

        {activeTab === "financials" && (
          <EmployeeFinancialSummaryTab employeeId={employee.id} />
        )}

        {activeTab === "attendance" && (
          <EmployeeAttendanceTab employeeId={employee.id} />
        )}

        {activeTab === "actions" && (
          <EmployeeDisciplinaryActionsTab employeeId={employee.id} />
        )}

        {activeTab === "alerts" && (
          <AlertsTab
            incompleteDays={incompleteDays}
            corrections={corrections}
            employeeId={employee.id}
            userId={user!.id}
            onRefresh={fetchData}
          />
        )}

        {activeTab === "forms" && (
          <EmployeeFormsTab
            employeeId={employee.id}
            userId={employee.user_id}
            isManager={employee.is_manager || false}
            isHrManager={employee.is_hr_manager || false}
            onRefresh={fetchData}
            initialFormId={pendingFormId}
            onInitialFormConsumed={() => setPendingFormId(null)}
          />
        )}

        {activeTab === "profile" && (
          shellEnabled ? (
            <EmployeeShell
              title="ملفي الشخصي"
              subtitle={employee.full_name}
              breadcrumb={[
                { label: "الرئيسية", onClick: () => setActiveTab("home") },
                { label: "ملفي" },
              ]}
            >
              <EmployeeProfileTab
                employee={employee}
                branchName={branchName}
                latestInfoForm={latestInfoForm}
                onUpdateInfo={() => { setPendingFormId("employee_info"); setActiveTab("forms"); }}
              />
            </EmployeeShell>
          ) : (
            <EmployeeProfileTab
              employee={employee}
              branchName={branchName}
              latestInfoForm={latestInfoForm}
              onUpdateInfo={() => { setPendingFormId("employee_info"); setActiveTab("forms"); }}
            />
          )
        )}
      </div>

      <EmployeeBottomNav
        active={activeTab}
        onNavigate={handleNavigate}
        alertCount={incompleteDays.length}
      />

      <QRScannerDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        action={scanAction}
        onSuccess={fetchData}
      />
    </div>
  );
}
