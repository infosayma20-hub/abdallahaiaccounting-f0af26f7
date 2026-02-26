import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, X, PanelLeftClose, PanelLeftOpen, Settings, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import ModuleIcon from "@/components/ModuleIcon";

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
      { label: "الرئيسية", module: "home", path: "/" },
      {
        label: "المحاسبة",
        module: "accounting",
        children: [
          { label: "شجرة الحسابات", path: "/accounts" },
          { label: "دفتر اليومية", path: "/transactions" },
          { label: "القيود", path: "/journal-entries" },
          { label: "ميزان المراجعة", path: "/trial-balance" },
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
          { label: "الفواتير", path: "/invoices" },
          { label: "سندات القبض", path: "/receipts" },
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
      { label: "التقارير", module: "reports", path: "/reports" },
      { label: "الذكاء المالي", module: "ai", path: "/smart-report" },
      {
        label: "الموارد البشرية",
        module: "hr",
        children: [
          { label: "الموظفون", path: "/contacts?type=employee" },
        ],
      },
    ],
  },
];

const AppSidebar = ({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["المحاسبة"]);

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

  const toggleGroup = (label: string) => {
    setExpandedGroups((prev) =>
      prev.includes(label) ? prev.filter((g) => g !== label) : [...prev, label]
    );
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    onMobileClose();
  };

  const renderNavItem = (item: NavItem) => {
    const active = isActive(item.path);
    const groupActive = isGroupActive(item);
    const expanded = expandedGroups.includes(item.label);
    const hasChildren = item.children && item.children.length > 0;

    return (
      <div key={item.label}>
        <button
          onClick={() => {
            if (hasChildren) {
              if (collapsed) {
                onToggle();
                setExpandedGroups((prev) => [...prev, item.label]);
              } else {
                toggleGroup(item.label);
              }
            } else if (item.path) {
              handleNavigate(item.path);
            }
          }}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all group",
            active || groupActive
              ? "bg-primary/10 text-primary"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? item.label : undefined}
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
                    "h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-200",
                    expanded && "rotate-180"
                  )}
                />
              )}
            </>
          )}
        </button>

        {hasChildren && expanded && !collapsed && (
          <div className="mr-5 mt-0.5 space-y-0.5 border-r border-border/40 pr-3">
            {item.children!.map((child) => {
              const childActive = isActive(child.path);
              return (
                <button
                  key={child.path}
                  onClick={() => handleNavigate(child.path)}
                  className={cn(
                    "w-full text-right px-3 py-1.5 rounded-lg text-[12px] transition-all",
                    childActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent/60"
                  )}
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
      {/* Logo */}
      <div className={cn(
        "h-16 flex items-center px-4 flex-shrink-0",
        collapsed && "justify-center px-2"
      )}>
        {!collapsed ? (
          <div className="flex items-center gap-3 flex-1">
            <ModuleIcon module="ai" size="md" active />
            <div className="min-w-0">
              <h1 className="text-[14px] font-bold text-foreground truncate">عبدالله AI</h1>
              <p className="text-[10px] text-muted-foreground leading-none">المحاسبة الذكية</p>
            </div>
          </div>
        ) : (
          <ModuleIcon module="ai" size="md" active />
        )}
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-5">
        {navSections.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider px-3 mb-2">
                {section.title}
              </p>
            )}
            {collapsed && <div className="h-px bg-border/30 mx-1 mb-2" />}
            <div className="space-y-0.5">
              {section.items.map(renderNavItem)}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-sidebar-border/50 py-3 px-3 space-y-0.5">
        <button
          onClick={() => handleNavigate("/settings")}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-all"
          title={collapsed ? "الإعدادات" : undefined}
        >
          <ModuleIcon module="settings" size="sm" />
          {!collapsed && <span className="flex-1 text-right truncate">الإعدادات</span>}
        </button>
        <button
          onClick={onToggle}
          className="hidden lg:flex w-full items-center gap-3 px-3 py-2 rounded-xl text-[13px] text-muted-foreground hover:bg-sidebar-accent transition-all"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5 mx-auto" strokeWidth={1.8} />
          ) : (
            <>
              <PanelLeftClose className="h-5 w-5" strokeWidth={1.8} />
              <span>طي القائمة</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-[280px] bg-sidebar transform transition-transform duration-300 lg:hidden",
          mobileOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <button
          onClick={onMobileClose}
          className="absolute top-4 left-4 w-8 h-8 rounded-xl flex items-center justify-center hover:bg-secondary transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col border-l border-sidebar-border/50 bg-sidebar flex-shrink-0 transition-all duration-300",
          collapsed ? "w-[68px]" : "w-[252px]"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
};

export default AppSidebar;
