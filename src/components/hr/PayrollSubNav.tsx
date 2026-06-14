import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/payroll/preview-all", label: "معاينة الرواتب" },
  { to: "/payroll", label: "احتساب الرواتب", exact: true },
  { to: "/payroll/approval", label: "اعتماد الرواتب" },
  { to: "/payroll-settings", label: "إعدادات الرواتب", exact: true },
  { to: "/payroll-settings/policies", label: "السياسات المتعددة" },
];

export default function PayrollSubNav() {
  const { pathname } = useLocation();
  return (
    <div dir="rtl" className="border-t border-border/60 bg-muted/30">
      <div className="container max-w-7xl mx-auto px-3 md:px-6">
        <nav className="flex items-center gap-1 overflow-x-auto no-scrollbar">
          {TABS.map((t) => {
            const active = t.exact ? pathname === t.to : pathname === t.to || pathname.startsWith(t.to + "/");
            return (
              <NavLink
                key={t.to}
                to={t.to}
                className={cn(
                  "whitespace-nowrap px-3 py-2 text-sm border-b-2 -mb-px transition-colors",
                  active
                    ? "border-primary text-primary font-semibold"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                {t.label}
              </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
