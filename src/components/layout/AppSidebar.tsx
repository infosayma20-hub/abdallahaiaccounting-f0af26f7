import React, { useState, useRef, useCallback, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, X, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import ModuleIcon from "@/components/ModuleIcon";
import { useCompany } from "@/hooks/useCompanyContext";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { FinixLogo } from "@/components/ui/FinixLogo";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface NavItem {
  label: string;
  module: string;
  path?: string;
  children?: { label: string; path: string }[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    title: "المحاسبة الأساسية",
    items: [
      { label: "التطبيقات", module: "home", path: "/apps" },
      { label: "لوحة المعلومات", module: "dashboard", path: "/dashboard" },
      { label: "المحاسب الذكي", module: "ai", path: "/smart-accountant" },
      {
        label: "المحاسبة",
        module: "accounting",
        children: [
          { label: "شجرة الحسابات", path: "/accounts" },
          { label: "تقرير الحركات المحاسبية", path: "/transactions" },
          { label: "ميزان المراجعة", path: "/trial-balance" },
          { label: "كشف حساب", path: "/account-statement" },
        ],
      },
      {
        label: "الشيكات",
        module: "cheques",
        children: [
          { label: "شيكات واردة", path: "/cheques?type=incoming" },
          { label: "شيكات صادرة", path: "/cheques?type=outgoing" },
          { label: "حالات الشيكات", path: "/cheques" },
        ],
      },
    ],
  },
  {
    title: "المبيعات والمشتريات",
    items: [
      {
        label: "المبيعات",
        module: "sales",
        children: [
          { label: "العملاء", path: "/contacts?type=customer" },
          { label: "سياسات التصنيف", path: "/contacts/policies" },
          { label: "الفواتير", path: "/invoices" },
          { label: "سندات القبض", path: "/receipts" },
          { label: "الطلبيات", path: "/orders" },
        ],
      },
      {
        label: "المشتريات",
        module: "purchases",
        children: [
          { label: "الموردين", path: "/contacts?type=supplier" },
          { label: "فواتير مشتريات", path: "/bills" },
          { label: "سندات الصرف", path: "/payments" },
        ],
      },
      {
        label: "الاستيراد",
        module: "purchases",
        children: [
          { label: "ملفات الاستيراد", path: "/purchases/import" },
          { label: "استيراد جديد", path: "/purchases/import/new" },
        ],
      },
      {
        label: "المندوبين",
        module: "sales",
        children: [
          { label: "إدارة المندوبين", path: "/sales-reps" },
        ],
      },
      {
        label: "المخزون",
        module: "inventory",
        children: [
          { label: "المنتجات", path: "/inventory" },
          { label: "حركات المخزون", path: "/inventory-movements" },
          { label: "تقييم المخزون", path: "/inventory-valuation" },
        ],
      },
    ],
  },
  {
    title: "الذكاء والتقارير",
    items: [
      {
        label: "التقارير",
        module: "reports",
        children: [
          { label: "مركز التقارير", path: "/reports" },
          { label: "قائمة الدخل", path: "/profit-loss" },
          { label: "المركز المالي", path: "/balance-sheet" },
          { label: "ميزان المراجعة", path: "/trial-balance" },
        ],
      },
      { label: "الذكاء المالي", module: "ai", path: "/smart-report" },
      {
        label: "الأصول الثابتة",
        module: "accounting",
        children: [
          { label: "سجل الأصول", path: "/fixed-assets" },
        ],
      },
      {
        label: "الموارد البشرية",
        module: "hr",
        children: [
          { label: "الموظفون", path: "/employees" },
          { label: "بصمتي", path: "/my-attendance" },
          { label: "لوحة الحضور (HR)", path: "/hr-attendance" },
          { label: "الرواتب", path: "/payroll" },
          { label: "الإجازات", path: "/leaves" },
        ],
      },
    ],
  },
];

const AppSidebar = ({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { company } = useCompany();
  const [openItem, setOpenItem] = useState<string | null>(null);

  const isActive = (path?: string) => {
    if (!path) return false;
    const [basePath, queryString] = path.split("?");
    if (location.pathname !== basePath) return false;
    if (!queryString) return true;
    const params = new URLSearchParams(queryString);
    const currentParams = new URLSearchParams(location.search);
    for (const [key, value] of params.entries()) {
      if (currentParams.get(key) !== value) return false;
    }
    return true;
  };

  const isGroupActive = (item: NavItem) => item.children?.some((c) => isActive(c.path));

  React.useEffect(() => {
    for (const section of navSections) {
      for (const item of section.items) {
        if (item.children?.some((c) => isActive(c.path))) {
          setOpenItem(item.label);
          return;
        }
      }
    }
  }, [location.pathname, location.search]);

  const handleNavigate = (path: string) => {
    navigate(path);
    onMobileClose();
  };

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.path);
    const groupActive = isGroupActive(item);
    const expanded = openItem === item.label;
    const hasChildren = item.children && item.children.length > 0;

    const navButton = (
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (hasChildren) {
            if (collapsed) {
              onToggle();
              setOpenItem(item.label);
            } else {
              setOpenItem(prev => prev === item.label ? null : item.label);
            }
          } else if (item.path) {
            handleNavigate(item.path);
          }
        }}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all group relative",
          active || groupActive
            ? "text-sidebar-primary font-bold"
            : "text-sidebar-foreground hover:text-sidebar-accent-foreground",
          collapsed && "justify-center px-2"
        )}
        style={
          active || groupActive
            ? { background: "rgba(232,160,32,0.12)", borderRight: "3px solid #E8A020" }
            : undefined
        }
      >
        <ModuleIcon
          module={item.module}
          size="sm"
          active={active || !!groupActive}
        />
        {!collapsed && (
          <>
            <span className="flex-1 text-right truncate">{item.label}</span>
            {hasChildren && (
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 opacity-40 transition-transform duration-200",
                  expanded && "rotate-180"
                )}
              />
            )}
          </>
        )}
      </button>
    );

    return (
      <div key={item.label} ref={(el) => { if (el && hasChildren && expanded) { setTimeout(() => { const button = el.querySelector('button'); if (button) button.scrollIntoView({ behavior: "smooth", block: "start" }); }, 50); } }}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{navButton}</TooltipTrigger>
            <TooltipContent side="left"><p>{item.label}</p></TooltipContent>
          </Tooltip>
        ) : navButton}

        {hasChildren && expanded && !collapsed && (
          <div className="mr-5 mt-0.5 space-y-0.5 pr-3" style={{ borderRight: "1px solid #1E3A5F" }}>
            {item.children!.map((child) => {
              const childActive = isActive(child.path);
              return (
                <button
                  key={child.path}
                  onClick={() => handleNavigate(child.path)}
                  className={cn(
                    "w-full text-right px-3 py-1.5 rounded-lg text-[12px] transition-all",
                    childActive
                      ? "text-sidebar-primary font-medium"
                      : "text-sidebar-foreground hover:text-sidebar-accent-foreground"
                  )}
                  style={childActive ? { background: "rgba(232,160,32,0.08)" } : undefined}
                >
                  {child.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className={cn(
        "h-16 flex items-center px-4 flex-shrink-0 border-b",
        collapsed && "justify-center px-2"
      )}
      style={{ borderColor: "#1E3A5F" }}
      >
        {!collapsed ? (
          <div className="flex items-center gap-3 flex-1">
            {company.logo_url ? (
              <img
                src={company.logo_url}
                alt={company.name}
                className="w-[44px] h-[44px] rounded-[10px] object-contain bg-white p-1 flex-shrink-0"
                style={{ boxShadow: "0 2px 8px rgba(13,27,42,0.10)" }}
              />
            ) : (
              <FinixLogo variant="icon" size="sm" />
            )}
            <div className="min-w-0">
              <h1 className="text-[13px] leading-tight font-bold text-white line-clamp-2" style={{ fontFamily: "Tajawal, sans-serif" }}>
                {company.name || "FINIX"}
              </h1>
              <p className="text-[10px] text-sidebar-foreground leading-none truncate">
                {company.industry || "نظام إدارة الأعمال"}
              </p>
            </div>
          </div>
        ) : (
          company.logo_url ? (
            <img
              src={company.logo_url}
              alt={company.name}
              className="w-9 h-9 rounded-lg object-contain bg-white p-0.5"
              style={{ boxShadow: "0 2px 8px rgba(13,27,42,0.10)" }}
            />
          ) : (
            <FinixLogo variant="icon" size="sm" />
          )
        )}
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-5">
        {navSections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-[0.12em] px-3 mb-2">
                {section.title}
              </p>
            )}
            {collapsed && <div className="h-px mx-1 mb-2" style={{ background: "#1E3A5F" }} />}
            <div className="space-y-0.5">
              {section.items.map(renderNavItem)}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="py-3 px-3 space-y-0.5" style={{ borderTop: "1px solid #1E3A5F" }}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleNavigate("/settings")}
                className="w-full flex items-center gap-3 px-2 py-2.5 rounded-lg text-[13px] font-medium text-sidebar-foreground hover:text-sidebar-accent-foreground transition-all justify-center"
              >
                <ModuleIcon module="settings" size="sm" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>الإعدادات</p></TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={() => handleNavigate("/settings")}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium text-sidebar-foreground hover:text-sidebar-accent-foreground transition-all"
          >
            <ModuleIcon module="settings" size="sm" />
            <span className="flex-1 text-right truncate">الإعدادات</span>
          </button>
        )}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggle}
                className="hidden lg:flex w-full items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-sidebar-foreground/60 hover:text-sidebar-foreground transition-all justify-center"
              >
                <PanelLeftOpen className="h-5 w-5 mx-auto" strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>فتح القائمة</p></TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggle}
                className="hidden lg:flex w-full items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-sidebar-foreground/60 hover:text-sidebar-foreground transition-all"
              >
                <PanelLeftClose className="h-5 w-5" strokeWidth={1.8} />
                <span>طي القائمة</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>طي القائمة</p></TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-[280px] bg-sidebar transform transition-transform duration-300 lg:hidden"
        )}
        style={{ transform: mobileOpen ? "translateX(0)" : "translateX(100%)" }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onMobileClose}
              className="absolute top-4 left-4 w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-foreground hover:text-white transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>إغلاق القائمة</p></TooltipContent>
        </Tooltip>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col bg-sidebar flex-shrink-0 transition-all duration-300",
          collapsed ? "w-[68px]" : "w-[240px]"
        )}
        style={{ borderLeft: "1px solid rgba(255,255,255,0.06)" }}
      >
        {sidebarContent}
      </aside>
    </>
  );
};

export default AppSidebar;
