import { NavLink, useLocation } from "react-router-dom";
import { useMemo } from "react";
import ComposeInternalMessage from "@/components/messages/ComposeInternalMessage";
import HRAlertsBell from "@/components/hr/HRAlertsBell";
import { useHRManagerPermissions, type HRPermKey } from "@/hooks/useHRManagerPermissions";
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
};

const ITEMS: Item[] = [
  { to: "/hr", label: "لوحة HR", Icon: LayoutDashboard, matchPrefixes: [] },
  { to: "/employees", label: "الموظفون", Icon: Users, perms: ["can_view_employees", "can_edit_employees", "can_add_employees"], matchPrefixes: ["/employees", "/hr/employee", "/hr/people"] },
  { to: "/hr-attendance", label: "الحضور", Icon: Clock, perms: ["can_view_attendance", "can_manage_attendance"], matchPrefixes: ["/hr-attendance"] },
  { to: "/hr/leaves-balances", label: "الإجازات", Icon: Palmtree, perms: ["can_view_hr_reports", "can_manage_hr_settings"], matchPrefixes: ["/hr/leaves-balances"] },
  { to: "/attendance/roster", label: "جدول الدوام", Icon: CalendarDays, perms: ["can_view_roster", "can_manage_schedule"], matchPrefixes: ["/attendance/roster", "/manager/roster", "/hr/shifts"] },
  { to: "/employee-forms-management", label: "طلبات الموظفين", Icon: ClipboardList, perms: ["can_manage_forms", "can_approve_requests", "can_view_employee_requests"], matchPrefixes: ["/employee-forms-management", "/leaves"] },
  { to: "/hr/messages-inbox", label: "الرسائل والإجراءات", Icon: Inbox, matchPrefixes: ["/hr/messages-inbox"] },
  { to: "/hr/chat", label: "المراسلة", Icon: MessagesSquare, matchPrefixes: ["/hr/chat"] },
  { to: "/hr/job-applications", label: "طلبات التوظيف", Icon: UserPlus, matchPrefixes: ["/hr/job-applications"] },
  { to: "/hr/form-access", label: "إسناد النماذج", Icon: FileCheck, perms: ["can_manage_forms"], matchPrefixes: ["/hr/form-access"] },
  { to: "/payroll", label: "الرواتب", Icon: Banknote, perms: ["can_view_payroll", "can_process_payroll"], matchPrefixes: ["/payroll", "/payroll-settings"] },
  { to: "/hr-deductions", label: "الخصومات", Icon: Percent, perms: ["can_manage_deductions"], matchPrefixes: ["/hr-deductions"] },
  { to: "/loans", label: "القروض", Icon: HandCoins, perms: ["can_manage_loans", "can_manage_advances"], matchPrefixes: ["/loans", "/advances"] },
  { to: "/hr/settlements", label: "المخالصات", Icon: Wallet, perms: ["can_manage_hr_settings", "can_process_payroll"], matchPrefixes: ["/hr/settlements"] },
  { to: "/hr/reports", label: "تقارير HR", Icon: BarChart3, perms: ["can_view_hr_reports", "can_view_hr_attendance_reports"], matchPrefixes: ["/hr/reports"] },
  { to: "/hr/settings", label: "إعدادات HR", Icon: Settings, perms: ["can_manage_hr_settings"], matchPrefixes: ["/hr/settings", "/hr/definitions", "/hr/day-types", "/hr/shifts", "/hr/policy-assignment", "/payroll-settings"] },
];

export function HRTopNav() {
  const { isAdmin, isHRManager, can } = useHRManagerPermissions();
  const { pathname } = useLocation();

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

  return (
    <div dir="rtl" className="bg-transparent">
      <div className="w-full px-2 md:px-4">
        <nav className="flex items-center flex-wrap gap-1 py-2">
          {items.map((i) => {
            const active = isActive(i);
            const node = (
              <NavLink
                key={i.to}
                to={i.to}
                title={i.label}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-[13px] rounded-md transition-colors shrink-0",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <i.Icon className="h-4 w-4 shrink-0" />
                <span className="hidden lg:inline">{i.label}</span>
              </NavLink>
            );
            if (i.to === "/hr/settlements") {
              return (
                <div key={i.to} className="contents">
                  {node}
                  <ComposeInternalMessage
                    key="__compose_msg__"
                    buttonLabel="إرسال رسالة"
                    variant="ghost"
                    size="sm"
                    buttonClassName="flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-[13px] rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 shrink-0 h-auto"
                  />
                </div>
              );
            }
            return node;
          })}
          {/* تنبيهات الموظفين + مركز الإشعارات — متاح للأدمن ومدير الموارد البشرية */}
          {(isAdmin || isHRManager) && <div className="mr-auto shrink-0"><HRAlertsBell /></div>}
          {(isAdmin || isHRManager) && (
            <NavLink
              to="/admin/notifications"
              title="مركز الإشعارات — إرسال إشعارات للموظفين"
              className={({ isActive: na }) =>
                cn(
                  "flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-[13px] rounded-md transition-colors shrink-0",
                  na
                    ? "bg-primary text-primary-foreground"
                    : "text-rose-600 hover:bg-rose-500/10"
                )
              }
            >
              <Bell className="h-4 w-4 shrink-0" />
              <span className="hidden lg:inline">الإشعارات</span>
            </NavLink>
          )}
        </nav>
      </div>
    </div>
  );
}

export default HRTopNav;
