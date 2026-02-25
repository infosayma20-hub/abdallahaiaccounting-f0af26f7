import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  BookOpen,
  ShoppingCart,
  CreditCard,
  Package,
  FileText,
  BarChart3,
  Users2,
  Settings,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Sparkles,
  Receipt,
  Landmark,
  FileSpreadsheet,
  UserPlus,
  Wallet,
  ClipboardList,
  Scale,
  AlertTriangle,
  PanelLeftClose,
  PanelLeftOpen,
  Grid3X3,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

interface NavItem {
  label: string;
  icon: React.ElementType;
  path?: string;
  children?: { label: string; path: string }[];
}

const mainNav: NavItem[] = [
  { label: "الرئيسية", icon: Home, path: "/" },
  {
    label: "المحاسبة",
    icon: BookOpen,
    children: [
      { label: "شجرة الحسابات", path: "/accounts" },
      { label: "دفتر اليومية", path: "/transactions" },
      { label: "القيود", path: "/journal-entries" },
      { label: "ميزان المراجعة", path: "/trial-balance" },
    ],
  },
  {
    label: "المبيعات والتحصيل",
    icon: ShoppingCart,
    children: [
      { label: "العملاء", path: "/contacts?type=customer" },
      { label: "الفواتير", path: "/invoices" },
      { label: "سندات القبض", path: "/receipts" },
    ],
  },
  {
    label: "المشتريات والمدفوعات",
    icon: CreditCard,
    children: [
      { label: "الموردين", path: "/contacts?type=supplier" },
      { label: "فواتير مشتريات", path: "/bills" },
      { label: "سندات الصرف", path: "/payments" },
    ],
  },
  {
    label: "المخزون",
    icon: Package,
    children: [
      { label: "المنتجات", path: "/inventory" },
      { label: "حركات المخزون", path: "/inventory-movements" },
      { label: "تقييم المخزون", path: "/inventory-valuation" },
    ],
  },
  {
    label: "الشيكات",
    icon: Receipt,
    children: [
      { label: "شيكات واردة", path: "/cheques?type=incoming" },
      { label: "شيكات صادرة", path: "/cheques?type=outgoing" },
      { label: "حالات الشيكات", path: "/cheques" },
    ],
  },
  { label: "التقارير", icon: BarChart3, path: "/reports" },
  {
    label: "الذكاء المالي",
    icon: Sparkles,
    path: "/smart-report",
  },
];

const bottomNav: NavItem[] = [
  { label: "الإعدادات", icon: Settings, path: "/settings" },
];

const AppSidebar = ({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const [expandedGroups, setExpandedGroups] = useState<string[]>(["المحاسبة"]);

  const isActive = (path?: string) => {
    if (!path) return false;
    const basePath = path.split("?")[0];
    return location.pathname === basePath;
  };

  const isGroupActive = (item: NavItem) => {
    return item.children?.some((c) => isActive(c.path));
  };

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
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all group",
            active || groupActive
              ? "bg-primary/10 text-primary"
              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed && "justify-center px-2"
          )}
          title={collapsed ? item.label : undefined}
        >
          <item.icon className={cn("h-[18px] w-[18px] flex-shrink-0", active || groupActive ? "text-primary" : "")} />
          {!collapsed && (
            <>
              <span className="flex-1 text-right truncate">{item.label}</span>
              {hasChildren && (
                <ChevronDown
                  className={cn(
                    "h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
                    expanded && "rotate-180"
                  )}
                />
              )}
            </>
          )}
        </button>

        {/* Children */}
        {hasChildren && expanded && !collapsed && (
          <div className="mr-4 mt-0.5 space-y-0.5 border-r border-border/50 pr-3">
            {item.children!.map((child) => {
              const childActive = isActive(child.path);
              return (
                <button
                  key={child.path}
                  onClick={() => handleNavigate(child.path)}
                  className={cn(
                    "w-full text-right px-3 py-1.5 rounded-md text-[13px] transition-all",
                    childActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
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
      {/* Logo / Brand */}
      <div className={cn("h-14 flex items-center border-b border-sidebar-border px-4 flex-shrink-0", collapsed && "justify-center px-2")}>
        {!collapsed ? (
          <div className="flex items-center gap-2.5 flex-1">
            <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">ع</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-foreground truncate">عبدالله AI</h1>
              <p className="text-[10px] text-muted-foreground">المحاسبة الذكية</p>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
            <span className="text-sm font-bold text-primary">ع</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {mainNav.map(renderNavItem)}
      </nav>

      {/* Bottom */}
      <div className="border-t border-sidebar-border py-2 px-2 space-y-0.5">
        {bottomNav.map(renderNavItem)}
        {/* Collapse toggle - desktop only */}
        <button
          onClick={onToggle}
          className="hidden lg:flex w-full items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-sidebar-accent transition-all"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-[18px] w-[18px] mx-auto" />
          ) : (
            <>
              <PanelLeftClose className="h-[18px] w-[18px]" />
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
          className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* Mobile sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 right-0 z-50 w-64 bg-sidebar border-l border-sidebar-border transform transition-transform duration-300 lg:hidden",
          mobileOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <button
          onClick={onMobileClose}
          className="absolute top-3 left-3 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-secondary transition-colors"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>
        {sidebarContent}
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden lg:flex flex-col border-l border-sidebar-border bg-sidebar flex-shrink-0 transition-all duration-300",
          collapsed ? "w-[60px]" : "w-[240px]"
        )}
      >
        {sidebarContent}
      </aside>
    </>
  );
};

export default AppSidebar;
