import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useMemo, useState } from "react";
import ComposeInternalMessage from "@/components/messages/ComposeInternalMessage";
import HRAlertsBell from "@/components/hr/HRAlertsBell";
import { useHRManagerPermissions, type HRPermKey } from "@/hooks/useHRManagerPermissions";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
  /** Colored icon chip classes. */
  chip: string;
};

const ITEMS: Item[] = [
  { to: "/hr", label: "لوحة HR", Icon: LayoutDashboard, matchPrefixes: [], group: "عام", chip: "text-sky-600 bg-sky-500/10" },
  { to: "/employees", label: "الموظفون", Icon: Users, perms: ["can_view_employees", "can_edit_employees", "can_add_employees"], matchPrefixes: ["/employees", "/hr/employee", "/hr/people"], group: "عام", chip: "text-blue-600 bg-blue-500/10" },
  { to: "/hr-attendance", label: "الحضور", Icon: Clock, perms: ["can_view_attendance", "can_manage_attendance"], matchPrefixes: ["/hr-attendance"], group: "الدوام والإجازات", chip: "text-amber-600 bg-amber-500/10" },
  { to: "/hr/leaves-balances", label: "الإجازات", Icon: Palmtree, perms: ["can_view_hr_reports", "can_manage_hr_settings"], matchPrefixes: ["/hr/leaves-balances"], group: "الدوام والإجازات", chip: "text-emerald-600 bg-emerald-500/10" },
  { to: "/attendance/roster", label: "جدول الدوام", Icon: CalendarDays, perms: ["can_view_roster", "can_manage_schedule"], matchPrefixes: ["/attendance/roster", "/manager/roster", "/hr/shifts"], group: "الدوام والإجازات", chip: "text-cyan-600 bg-cyan-500/10" },
  { to: "/employee-forms-management", label: "طلبات الموظفين", Icon: ClipboardList, perms: ["can_manage_forms", "can_approve_requests", "can_view_employee_requests"], matchPrefixes: ["/employee-forms-management", "/leaves"], group: "الطلبات والمراسلة", chip: "text-violet-600 bg-violet-500/10" },
  { to: "/hr/messages-inbox", label: "الرسائل والإجراءات", Icon: Inbox, matchPrefixes: ["/hr/messages-inbox"], group: "الطلبات والمراسلة", chip: "text-rose-600 bg-rose-500/10" },
  { to: "/hr/chat", label: "المراسلة", Icon: MessagesSquare, matchPrefixes: ["/hr/chat"], group: "الطلبات والمراسلة", chip: "text-fuchsia-600 bg-fuchsia-500/10" },
  { to: "/hr/job-applications", label: "طلبات التوظيف", Icon: UserPlus, matchPrefixes: ["/hr/job-applications"], group: "الطلبات والمراسلة", chip: "text-teal-600 bg-teal-500/10" },
  { to: "/hr/form-access", label: "إسناد النماذج", Icon: FileCheck, perms: ["can_manage_forms"], matchPrefixes: ["/hr/form-access"], group: "الطلبات والمراسلة", chip: "text-lime-600 bg-lime-500/10" },
  { to: "/payroll", label: "الرواتب", Icon: Banknote, perms: ["can_view_payroll", "can_process_payroll"], matchPrefixes: ["/payroll", "/payroll-settings"], group: "الرواتب والمالية", chip: "text-green-600 bg-green-500/10" },
  { to: "/hr-deductions", label: "الخصومات", Icon: Percent, perms: ["can_manage_deductions"], matchPrefixes: ["/hr-deductions"], group: "الرواتب والمالية", chip: "text-orange-600 bg-orange-500/10" },
  { to: "/loans", label: "القروض", Icon: HandCoins, perms: ["can_manage_loans", "can_manage_advances"], matchPrefixes: ["/loans", "/advances"], group: "الرواتب والمالية", chip: "text-purple-600 bg-purple-500/10" },
  { to: "/hr/settlements", label: "المخالصات", Icon: Wallet, perms: ["can_manage_hr_settings", "can_process_payroll"], matchPrefixes: ["/hr/settlements"], group: "الرواتب والمالية", chip: "text-indigo-600 bg-indigo-500/10" },
  { to: "/hr/reports", label: "تقارير HR", Icon: BarChart3, perms: ["can_view_hr_reports", "can_view_hr_attendance_reports"], matchPrefixes: ["/hr/reports"], group: "تقارير وإعدادات", chip: "text-blue-700 bg-blue-500/10" },
  { to: "/hr/settings", label: "إعدادات HR", Icon: Settings, perms: ["can_manage_hr_settings"], matchPrefixes: ["/hr/settings", "/hr/definitions", "/hr/day-types", "/hr/policy-assignment", "/payroll-settings"], group: "تقارير وإعدادات", chip: "text-slate-600 bg-slate-500/10" },
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
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button
                type="button"
                size="sm"
                className={cn(
                  "h-8 gap-1.5 px-3 text-[13px] transition-transform active:scale-95",
                  current && !open && "bg-primary/90"
                )}
              >
                <LayoutGrid className={cn("h-4 w-4 transition-transform duration-300", open && "rotate-90")} />
                <span>تطبيقات HR</span>
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              dir="rtl"
              className="w-[280px] sm:w-[300px] p-0 flex flex-col gap-0"
            >
              <SheetHeader className="px-4 py-3 border-b border-border text-right space-y-0">
                <SheetTitle className="flex items-center gap-2 text-[14px]">
                  <LayoutGrid className="h-4 w-4 text-primary" />
                  تطبيقات HR
                </SheetTitle>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto py-2">
                {grouped.map((g, gi) => (
                  <div key={g.group} className="mb-1.5">
                    <div className="text-[10px] font-medium text-muted-foreground/80 px-4 py-1.5">{g.group}</div>
                    <div className="px-2 space-y-0.5">
                      {g.list.map((i, ii) => {
                        const active = isActive(i);
                        return (
                          <button
                            key={i.to}
                            type="button"
                            onClick={() => {
                              setOpen(false);
                              navigate(i.to);
                            }}
                            style={{ animationDelay: `${(gi * 4 + ii) * 22}ms` }}
                            className={cn(
                              "group relative w-full flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-right",
                              "animate-fade-in transition-all duration-200 hover:bg-muted/70 hover:-translate-x-0.5 active:scale-[0.98]",
                              active && "bg-primary/10 hover:bg-primary/15"
                            )}
                          >
                            <span
                              className={cn(
                                "absolute right-0 top-1/2 -translate-y-1/2 w-[3px] rounded-full bg-primary transition-all duration-300",
                                active ? "h-6 opacity-100" : "h-0 opacity-0"
                              )}
                            />
                            <span
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110",
                                i.chip,
                                active && "ring-1 ring-primary/40"
                              )}
                            >
                              <i.Icon className="h-4 w-4" />
                            </span>
                            <span
                              className={cn(
                                "flex-1 truncate text-[12.5px] leading-tight",
                                active ? "text-primary font-semibold" : "text-foreground/85"
                              )}
                            >
                              {i.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </SheetContent>
          </Sheet>

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
    </div>
  );
}

export default HRTopNav;
