import { NavLink, useLocation } from "react-router-dom";
import { useMemo, useState } from "react";
import { useHRManagerPermissions, type HRPermKey } from "@/hooks/useHRManagerPermissions";
import {
  LayoutDashboard,
  Users,
  Clock,
  CalendarDays,
  ClipboardList,
  FileCheck,
  Banknote,
  HandCoins,
  Settings,
  BarChart3,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  { to: "/attendance/roster", label: "جدول الدوام", Icon: CalendarDays, perms: ["can_view_roster", "can_manage_schedule"], matchPrefixes: ["/attendance/roster", "/manager/roster", "/hr/shifts"] },
  { to: "/employee-forms-management", label: "طلبات الموظفين", Icon: ClipboardList, perms: ["can_manage_forms", "can_approve_requests", "can_view_employee_requests"], matchPrefixes: ["/employee-forms-management", "/leaves"] },
  { to: "/hr/form-access", label: "إسناد النماذج", Icon: FileCheck, perms: ["can_manage_forms"], matchPrefixes: ["/hr/form-access"] },
  { to: "/payroll", label: "الرواتب", Icon: Banknote, perms: ["can_view_payroll", "can_process_payroll"], matchPrefixes: ["/payroll", "/payroll-settings"] },
  { to: "/loans", label: "القروض", Icon: HandCoins, perms: ["can_manage_loans", "can_manage_advances"], matchPrefixes: ["/loans", "/advances"] },
  { to: "/hr/reports", label: "تقارير HR", Icon: BarChart3, perms: ["can_view_hr_reports", "can_view_hr_attendance_reports"], matchPrefixes: ["/hr/reports"] },
  { to: "/hr/settings", label: "إعدادات HR", Icon: Settings, perms: ["can_manage_hr_settings"], matchPrefixes: ["/hr/settings", "/hr/definitions", "/hr/day-types", "/hr/shifts", "/hr/policy-assignment", "/payroll-settings", "/hr-deductions"] },
];

const VISIBLE_DESKTOP = 9; // all fit on a typical desktop; collapse to "more" only when needed.

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
      <div className="container max-w-7xl mx-auto px-3 md:px-6">
        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar py-2">
          {items.slice(0, VISIBLE_DESKTOP).map((i) => {
            const active = isActive(i);
            return (
              <NavLink
                key={i.to}
                to={i.to}
                className={cn(
                  "flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm rounded-md transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                )}
              >
                <i.Icon className="h-4 w-4" />
                <span>{i.label}</span>
              </NavLink>
            );
          })}
          {items.length > VISIBLE_DESKTOP && (
            <DropdownMenu>
              <DropdownMenuTrigger className="flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-sm rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60">
                المزيد <ChevronDown className="h-4 w-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {items.slice(VISIBLE_DESKTOP).map((i) => (
                  <DropdownMenuItem key={i.to} asChild>
                    <NavLink to={i.to} className="flex items-center gap-2">
                      <i.Icon className="h-4 w-4" />
                      <span>{i.label}</span>
                    </NavLink>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </nav>
      </div>
    </div>
  );
}

export default HRTopNav;
