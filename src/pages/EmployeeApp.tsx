import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, AlertTriangle } from "lucide-react";
import EmployeeBottomNav from "@/components/employee/EmployeeBottomNav";
import EmployeeHomeTab from "@/components/employee/EmployeeHomeTab";
import QRScannerDialog from "@/components/employee/QRScannerDialog";
import AttendanceCalendarTab from "@/components/employee/AttendanceCalendarTab";
import AlertsTab from "@/components/employee/AlertsTab";
import EmployeeProfileTab from "@/components/employee/EmployeeProfileTab";

type Tab = "home" | "scan" | "history" | "alerts" | "profile";

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
};

export default function EmployeeApp() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [todayRecord, setTodayRecord] = useState<AttendanceDay | null>(null);
  const [history, setHistory] = useState<AttendanceDay[]>([]);
  const [corrections, setCorrections] = useState<CorrectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchName, setBranchName] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const [scanAction, setScanAction] = useState<"checkin" | "checkout">("checkin");

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: emp } = await supabase
        .from("employees")
        .select("id, full_name, branch_id, position, department, phone, email")
        .eq("auth_user_id", user.id)
        .eq("is_active", true)
        .single();
      setEmployee(emp);
      if (!emp) { setLoading(false); return; }

      // Branch name
      if (emp.branch_id) {
        const { data: br } = await supabase.from("branches").select("name").eq("id", emp.branch_id).single();
        setBranchName(br?.name || "");
      }

      const today = new Date().toISOString().split("T")[0];

      const [todayRes, histRes, corrRes] = await Promise.all([
        supabase.from("attendance_days").select("*").eq("employee_id", emp.id).eq("attendance_date", today).single(),
        supabase.from("attendance_days").select("*").eq("employee_id", emp.id).order("attendance_date", { ascending: false }).limit(60),
        supabase.from("correction_requests").select("*").eq("employee_id", emp.id).order("created_at", { ascending: false }).limit(20),
      ]);

      setTodayRecord(todayRes.data);
      setHistory(histRes.data || []);
      setCorrections(corrRes.data || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleNavigate = (tab: Tab) => {
    if (tab === "scan") {
      const canCheckOut = todayRecord?.first_check_in && !todayRecord?.last_check_out;
      setScanAction(canCheckOut ? "checkout" : "checkin");
      setScanOpen(true);
    } else {
      setActiveTab(tab);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6" dir="rtl" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
        <div className="text-center space-y-4 max-w-xs">
          <AlertTriangle className="h-16 w-16 text-warning mx-auto" />
          <h2 className="text-lg font-bold">لم يتم ربط حسابك بسجل موظف</h2>
          <p className="text-sm text-muted-foreground">تواصل مع مسؤول الموارد البشرية لربط حسابك.</p>
        </div>
      </div>
    );
  }

  const incompleteDays = history.filter((d) => d.status === "incomplete");

  return (
    <div className="min-h-screen bg-background" style={{ fontFamily: "'IBM Plex Sans Arabic', sans-serif" }}>
      {/* Safe area top padding */}
      <div className="h-[env(safe-area-inset-top,0px)]" />

      {activeTab === "home" && (
        <EmployeeHomeTab
          employeeName={employee.full_name}
          todayRecord={todayRecord}
          onScanTap={() => handleNavigate("scan")}
        />
      )}

      {activeTab === "history" && (
        <AttendanceCalendarTab history={history} />
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

      {activeTab === "profile" && (
        <EmployeeProfileTab employee={employee} branchName={branchName} />
      )}

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
