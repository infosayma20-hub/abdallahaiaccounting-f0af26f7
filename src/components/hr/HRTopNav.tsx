import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import ComposeInternalMessage from "@/components/messages/ComposeInternalMessage";
import HRAlertsBell from "@/components/hr/HRAlertsBell";
import { useHRManagerPermissions, type HRPermKey } from "@/hooks/useHRManagerPermissions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  Palmtree,
  ClipboardList,
  FileCheck,
  Banknote,
  HandCoins,
  Wallet,
  Percent,
  Settings,
  BarChart3,
  Bell,
  Inbox,
  MessagesSquare,
  UserPlus,
  LayoutGrid,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = {
  to: string;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** Show only if user has at least one of these perms (admin always passes). */
  perms?: HRPermKey[];
  /** Match prefixes that should keep this tab "active". */
  matchPrefixes?: string[];
  /** Group inside the apps launcher. */
  group: string;
};

const ITEMS: Item[] = [
  { to: "/hr", label: "لوحة HR", Icon: LayoutDashboard, matchPrefixes: [], group: "عام" },
  { to: "/employees", label: "الموظفون", Icon: Users, perms: ["can_view_employees", "can_edit_employees", "can_add_employees"], matchPrefixes: ["/employees", "/hr/employee", "/hr/people"], group: "عام" },
  { to: "/hr-attendance", label: "الحضور", Icon: Clock, perms: ["can_view_attendance", "can_manage_attendance"], matchPrefixes: ["/hr-attendance"], group: "الدوام والإجازات" },
  { to: "/hr/leaves-balances", label: "الإجازات", Icon: Palmtree, perms: ["can_view_hr_reports", "can_manage_hr_settings"], matchPrefixes: ["/hr/leaves-balances"], group: "الدوام والإجازات" },
  { to: "/attendance/roster", label: "جدول الدوام", Icon: CalendarDays, perms: ["can_view_roster", "can_manage_schedule"], matchPrefixes: ["/attendance/roster", "/manager/roster", "/hr/shifts"], group: "الدوام والإجازات" },
  { to: "/employee-forms-management", label: "طلبات الموظفين", Icon: ClipboardList, perms: ["can_manage_forms", "can_approve_requests", "can_view_employee_requests"], matchPrefixes: ["/employee-forms-management", "/leaves"], group: "الطلبات والمراسلة" },
  { to: "/hr/messages-inbox", label: "الرسائل والإجراءات", Icon: Inbox, matchPrefixes: ["/hr/messages-inbox"], group: "الطلبات والمراسلة" },
  { to: "/hr/chat", label: "المراسلة", Icon: MessagesSquare, matchPrefixes: ["/hr/chat"], group: "الطلبات والمراسلة" },
  { to: "/hr/job-applications", label: "طلبات التوظيف", Icon: UserPlus, matchPrefixes: ["/hr/job-applications"], group: "الطلبات والمراسلة" },
  { to: "/hr/form-access", label: "إسناد النماذج", Icon: FileCheck, perms: ["can_manage_forms"], matchPrefixes: ["/hr/form-access"], group: "الطلبات والمراسلة" },
  { to: "/payroll", label: "الرواتب", Icon: Banknote, perms: ["can_view_payroll", "can_process_payroll"], matchPrefixes: ["/payroll", "/payroll-settings"], group: "الرواتب والمالية" },
  { to: "/hr-deductions", label: "الخصومات", Icon: Percent, perms: ["can_manage_deductions"], matchPrefixes: ["/hr-deductions"], group: "الرواتب والمالية" },
  { to: "/loans", label: "القروض", Icon: HandCoins, perms: ["can_manage_loans", "can_manage_advances"], matchPrefixes: ["/loans", "/advances"], group: "الرواتب والمالية" },
  { to: "/hr/settlements", label: "المخالصات", Icon: Wallet, perms: ["can_manage_hr_settings", "can_process_payroll"], matchPrefixes: ["/hr/settlements"], group: "الرواتب والمالية" },
  { to: "/hr/reports", label: "تقارير HR", Icon: BarChart3, perms: ["can_view_hr_reports", "can_view_hr_attendance_reports"], matchPrefixes: ["/hr/reports"], group: "تقارير وإعدادات" },
  { to: "/hr/settings", label: "إعدادات HR", Icon: Settings, perms: ["can_manage_hr_settings"], matchPrefixes: ["/hr/settings", "/hr/definitions", "/hr/day-types", "/hr/policy-assignment", "/payroll-settings"], group: "تقارير وإعدادات" },
];

const GROUP_ORDER = ["عام", "الدوام والإجازات", "الطلبات والمراسلة", "الرواتب والمالية", "تقارير وإعدادات"];

export function HRTopNav() {
  const { isAdmin, isHRManager, can } = useHRManagerPermissions();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    return ITEMS.filter((i) => {
      if (!i.perms || i.perms.length === 0) return true;
      if (isAdmin) return true;
      if (isHRManager && can(...i.perms)) return true;
      return false;
    });
  }, [isAdmin, isHRManager, can]);

  const isActive = (i: Item) => {
    // "/hr" is reserved for the dashboard only — exact match, never prefix.
    if (i.to === "/hr") return pathname === "/hr";
    const prefixes = i.matchPrefixes && i.matchPrefixes.length > 0 ? i.matchPrefixes : [i.to];
    return prefixes.some((p) => pathname === p || pathname.startsWith(p + "/"));
  };

  const current = items.find(isActive);

  const grouped = useMemo(
    () =>
      GROUP_ORDER.map((g) => ({ group: g, list: items.filter((i) => i.group === g) })).filter(
        (g) => g.list.length > 0
      ),
    [items]
  );

  return (
    <div dir="rtl" className="bg-transparent">
      <div className="w-full px-2 md:px-4">
        <nav className="flex items-center gap-2 py-1.5">
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={() => setOpen(true)}
            className="h-8 gap-1.5 px-3 text-[13px]"
          >
            <LayoutGrid className="h-4 w-4" />
            <span>تطبيقات HR</span>
          </Button>

          {current && (
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-foreground truncate">
              <current.Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
              {current.label}
            </span>
          )}

          <div className="mr-auto flex items-center gap-1 shrink-0">
            <ComposeInternalMessage
              buttonLabel="إرسال رسالة"
              variant="ghost"
              size="sm"
              buttonClassName="hidden md:flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-[13px] rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 h-auto"
            />
            {(isAdmin || isHRManager) && <HRAlertsBell />}
            {(isAdmin || isHRManager) && (
              <NavLink
                to="/admin/notifications"
                title="مركز الإشعارات — إرسال إشعارات للموظفين"
                aria-label="مركز الإشعارات"
                className={({ isActive: na }) =>
                  cn(
                    "flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-[13px] rounded-md transition-colors shrink-0",
                    na ? "bg-primary text-primary-foreground" : "text-rose-600 hover:bg-rose-500/10"
                  )
                }
              >
                <Bell className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline">الإشعارات</span>
              </NavLink>
            )}
          </div>
        </nav>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent dir="rtl" className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-right">تطبيقات الموارد البشرية</DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto space-y-4 pt-1">
            {grouped.map((g) => (
              <div key={g.group}>
                <div className="text-[12px] text-muted-foreground mb-2">{g.group}</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {g.list.map((i) => {
                    const active = isActive(i);
                    return (
                      <button
                        key={i.to}
                        type="button"
                        onClick={() => {
                          setOpen(false);
                          navigate(i.to);
                        }}
                        className={cn(
                          "flex items-center gap-2 rounded-lg border p-2.5 text-[13px] text-right transition-colors",
                          active
                            ? "border-primary bg-primary/10 text-primary font-semibold"
                            : "border-border hover:bg-muted/60"
                        )}
                      >
                        <i.Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{i.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default HRTopNav;
