import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
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
import DisciplinaryNotificationGate from "@/components/employee/DisciplinaryNotificationGate";
import BranchRosterPage from "@/pages/manager/BranchRosterPage";
import MyTeamTab from "@/components/employee/manager/MyTeamTab";
import TeamAttendanceTab from "@/components/employee/manager/TeamAttendanceTab";
import TeamRequestsTab from "@/components/employee/manager/TeamRequestsTab";
import ShiftSwapsTab from "@/components/employee/manager/ShiftSwapsTab";
import ManagerHeader from "@/components/employee/manager/ManagerHeader";
import { getOpenAttendanceSession } from "@/lib/attendance-session";

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
  is_manually_adjusted?: boolean | null;
  updated_at?: string | null;
  created_at?: string | null;
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
  job_title_id?: string | null;
  job_title?: string | null;
};

export default function EmployeeApp({ initialTab }: { initialTab?: Tab } = {}) {
  const { user } = useAuth();
  const { roles: sharedRoles } = useUserRoles();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<Tab>(initialTab || "home");
  const [pendingFormId, setPendingFormId] = useState<string | null>(null);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [todayRecord, setTodayRecord] = useState<AttendanceDay | null>(null);
  const [todayEvents, setTodayEvents] = useState<{ event_type: string; event_time: string }[]>([]);
  const [recentEvents, setRecentEvents] = useState<{ event_type: string; event_time: string }[]>([]);
  const [history, setHistory] = useState<AttendanceDay[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchName, setBranchName] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [scanAction, setScanAction] = useState<"checkin" | "checkout">("checkin");
  const [isCashier, setIsCashier] = useState(false);

  // Keep isCashier in sync with the shared user_roles cache.
  useEffect(() => {
    setIsCashier(sharedRoles.includes("cashier"));
  }, [sharedRoles]);

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
      // Roles are now read from the shared React Query cache
      // (useUserRoles) populated once per session, so we don't refetch
      // user_roles here. `isCashier` is derived in an effect below.
      const { data: emp } = await supabase
        .from("employees")
        .select("id, full_name, branch_id, position, department, phone, email, is_manager, is_hr_manager, can_view_team, can_manage_schedule, can_manage_attendance, user_id, company_id, date_of_birth, id_number, marital_status, children_count, start_date, photo_url, address, notes, shift_id, shift_start, shift_end, job_title_id, job_title")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();
      setEmployee(emp as Employee | null);
      if (!emp) { setLoading(false); return; }

      // Use Asia/Hebron local date for "today"
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Hebron", year: "numeric", month: "2-digit", day: "2-digit",
      }).format(new Date());
      // 60-day window for recent events (covers stats + last-5 days)
      const since = new Date(Date.now() - 60 * 86400_000).toISOString();

      // 🚀 Perf: run every remaining query in a single parallel wave instead of
      // 6 sequential awaits. Nothing here depends on anything else — they all
      // just need emp.id / emp.branch_id / emp.job_title_id which we already
      // have. Cuts ~6 round trips off the initial load.
      const [jtRes, brRes, logoRes, infoFormRes, todayRes, histRes, corrRes, eventsRes, recentEvRes] = await Promise.all([
        (emp as any).job_title_id
          ? supabase.from("job_titles").select("name, name_ar").eq("id", (emp as any).job_title_id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        emp.branch_id
          ? supabase.from("branches_safe").select("name").eq("id", emp.branch_id).maybeSingle()
          : Promise.resolve({ data: null, error: null } as any),
        supabase.rpc("get_tenant_company_logo").then(
          (r: any) => r,
          () => ({ data: null, error: null } as any),
        ),
        supabase.from("employee_forms").select("form_data, status, created_at")
          .eq("employee_id", emp.id).eq("form_type", "employee_info")
          .order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("attendance_days").select("*").eq("employee_id", emp.id).eq("attendance_date", today).maybeSingle(),
        supabase.from("attendance_days").select("*").eq("employee_id", emp.id).order("attendance_date", { ascending: false }).limit(60),
        supabase.from("correction_requests").select("*").eq("employee_id", emp.id).order("created_at", { ascending: false }).limit(20),
        supabase.from("attendance_events").select("event_type, event_time").eq("employee_id", emp.id)
          .gte("event_time", `${today}T00:00:00+03:00`).lte("event_time", `${today}T23:59:59+03:00`)
          .eq("status", "valid").order("event_time", { ascending: true }),
        supabase.from("attendance_events").select("event_type, event_time").eq("employee_id", emp.id)
          .gte("event_time", since)
          .eq("status", "valid").order("event_time", { ascending: true }),
      ]);

      // Merge resolved job title name back onto the employee object
      if (jtRes?.data) {
        (emp as any).job_title_name_resolved = (jtRes.data as any).name_ar || (jtRes.data as any).name;
      }
      setEmployee(emp as Employee | null);
      setBranchName((brRes?.data as any)?.name || "");
      setCompanyLogo((logoRes?.data as string) || null);
      setLatestInfoForm((infoFormRes?.data as any)?.form_data || null);

      setTodayRecord(todayRes.data);
      setHistory(histRes.data || []);
      setCorrections(corrRes.data || []);
      setTodayEvents(eventsRes.data || []);
      setRecentEvents(recentEvRes.data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 🔴 Realtime: refetch portal state when HR (or any source) modifies this
  // employee's attendance_events / attendance_days / correction_requests, so
  // a check-out added by HR closes the open session and removes the
  // "تسجيل خروج" button on the employee's home screen instantly — no reload.
  useEffect(() => {
    if (!employee?.id) return;
    const empId = employee.id;
    const channel = supabase
      .channel(`employee-app-sync-${empId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_events", filter: `employee_id=eq.${empId}` },
        () => fetchData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "attendance_days", filter: `employee_id=eq.${empId}` },
        () => fetchData()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "correction_requests", filter: `employee_id=eq.${empId}` },
        () => fetchData()
      )
      .subscribe();

    // Safety net for when Realtime is blocked (corporate Wi-Fi, etc.)
    const onFocus = () => {
      if (document.visibilityState === "visible") fetchData();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [employee?.id, fetchData]);

  const handleNavigate = (tab: Tab) => {
    if (tab === "scan") {
      const eventsForState = recentEvents.length ? recentEvents : todayEvents;
      const lastEvent = eventsForState.length > 0 ? eventsForState[eventsForState.length - 1] : null;
      const canCheckOut = !!getOpenAttendanceSession(eventsForState, 24 * 7) || lastEvent?.event_type === "check_in";
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
      <DisciplinaryNotificationGate employeeId={employee.id} authUserId={user!.id} />
      <div className="max-w-lg mx-auto">
        {activeTab === "home" && (
          <EmployeeHomeTab
            employeeName={employee.full_name}
            todayRecord={todayRecord}
            todayEvents={todayEvents}
            recentEvents={recentEvents}
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
          shellEnabled ? (
            <EmployeeShell
              title="الحضور"
              subtitle="سجل حضورك وانصرافك"
              breadcrumb={[
                { label: "الرئيسية", onClick: () => setActiveTab("home") },
                { label: "الحضور" },
              ]}
            >
              <AttendanceCalendarTab history={history} />
            </EmployeeShell>
          ) : (
            <AttendanceCalendarTab history={history} />
          )
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
          shellEnabled ? (
            <EmployeeShell
              title="سجل دوامي"
              subtitle="جدول دوامك والشفتات المسجلة لك"
              breadcrumb={[
                { label: "الرئيسية", onClick: () => setActiveTab("home") },
                { label: "سجل دوامي" },
              ]}
            >
              <MyScheduleTab employeeId={employee.id} companyId={employee.company_id} />
            </EmployeeShell>
          ) : (
            <MyScheduleTab employeeId={employee.id} companyId={employee.company_id} />
          )
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
          shellEnabled ? (
            <EmployeeShell
              title="قسائم الراتب"
              subtitle="قسائم راتبك وسجلك المالي الشهري"
              breadcrumb={[
                { label: "الرئيسية", onClick: () => setActiveTab("home") },
                { label: "قسائم الراتب" },
              ]}
            >
              <EmployeePayslipsTab employeeId={employee.id} />
            </EmployeeShell>
          ) : (
            <EmployeePayslipsTab employeeId={employee.id} />
          )
        )}

        {activeTab === "financials" && (
          shellEnabled ? (
            <EmployeeShell
              title="محفظتي"
              subtitle="ملخصك المالي والحركات المرتبطة بك"
              breadcrumb={[
                { label: "الرئيسية", onClick: () => setActiveTab("home") },
                { label: "محفظتي" },
              ]}
            >
              <EmployeeFinancialSummaryTab employeeId={employee.id} />
            </EmployeeShell>
          ) : (
            <EmployeeFinancialSummaryTab employeeId={employee.id} />
          )
        )}

        {activeTab === "attendance" && (
          shellEnabled ? (
            <EmployeeShell
              title="سجل دوامي"
              subtitle="حضورك وانصرافك وسجل الأيام"
              breadcrumb={[
                { label: "الرئيسية", onClick: () => setActiveTab("home") },
                { label: "سجل دوامي" },
              ]}
            >
              <EmployeeAttendanceTab employeeId={employee.id} />
            </EmployeeShell>
          ) : (
            <EmployeeAttendanceTab employeeId={employee.id} />
          )
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
            jobTitle={employee.position || employee.job_title || null}
            jobTitleName={(employee as any).job_title_name_resolved || null}
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
        employeeBranchId={employee?.branch_id ?? null}
      />
    </div>
  );
}
