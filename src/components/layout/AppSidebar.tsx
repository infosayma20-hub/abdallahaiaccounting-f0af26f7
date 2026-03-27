import React, { useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, X, PanelLeftClose, PanelLeftOpen, Lock, LogOut, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import ModuleIcon from "@/components/ModuleIcon";
import { useCompany } from "@/hooks/useCompanyContext";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useSubscription } from "@/hooks/useSubscription";

/** Quick-add routes keyed by nav item id */
const quickAddRoutes: Record<string, { label: string; path: string }> = {
  finance: { label: "سند جديد", path: "/finance/receipt/new" },
  sales: { label: "فاتورة جديدة", path: "/invoices/new" },
  purchases: { label: "طلب شراء", path: "/procurement/orders/new" },
  inventory: { label: "منتج جديد", path: "/inventory?action=add" },
  hr: { label: "موظف جديد", path: "/employees?action=add" },
  workshops: { label: "ورشة جديدة", path: "/workshops?action=add" },
};

import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { navigationSections, getAllChildren, type NavItem } from "@/config/navigationConfig";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const SIDEBAR_BG = "#1b2b4b";
const GOLD = "#4A9EE8";
const SEPARATOR = "rgba(255,255,255,0.06)";
const SEPARATOR_HEADER = "rgba(255,255,255,0.08)";

const AppSidebar = ({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { company } = useCompany();
  const { settings } = useCompanySettings();
  const { subscription } = useSubscription();
  const [openItem, setOpenItem] = useState<string | null>(null);

  const isTrial = subscription?.isTrial ?? true;

  const enabledSettings = useMemo(() => ({
    has_pos: !!settings.has_pos,
    has_employees: !!settings.has_employees,
    has_inventory: ["تجارة", "مطعم", "متجر إلكتروني"].includes(settings.business_type || ""),
    has_contractor: settings.business_type === "مقاولات",
    has_ecommerce: settings.business_type === "متجر إلكتروني",
    has_travel: settings.business_type === "سياحة",
    has_workshops: ["ورش ومناجر", "مقاولات"].includes(settings.business_type || ""),
    has_tasks: false,
  }), [settings]);

  const hiddenApps: string[] = useMemo(() => {
    return (settings as any)?.hidden_apps || [];
  }, [settings]);

  const isItemHidden = (item: NavItem) => hiddenApps.includes(item.id);

  const isItemDisabled = (item: NavItem) => {
    if (isItemHidden(item)) return true;
    if (!item.enableSetting) return false;
    if (isTrial) return false;
    return !enabledSettings[item.enableSetting as keyof typeof enabledSettings];
  };

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

  const isGroupActive = (item: NavItem) => getAllChildren(item).some(c => isActive(c.path));

  React.useEffect(() => {
    for (const section of navigationSections) {
      for (const item of section.items) {
        if (getAllChildren(item).some(c => isActive(c.path))) {
          setOpenItem(item.label);
          return;
        }
      }
    }
  }, [location.pathname, location.search]);

  const handleNavigate = (path: string) => {
    setOpenItem(null);
    navigate(path);
    onMobileClose();
  };

  const renderNavItem = (item: NavItem) => {
    const locked = isItemHidden(item);
    const disabled = isItemDisabled(item);
    const active = !disabled && isActive(item.path);
    const groupActive = !disabled && isGroupActive(item);
    const isHighlighted = active || groupActive;
    const expanded = openItem === item.label;
    const hasChildren = !item.isDirect && item.groups && item.groups.length > 0;
    const quickAdd = quickAddRoutes[item.id];

    const navButton = (
      <button
        onClick={(e) => {
          e.stopPropagation();
          if (disabled) return;
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
          "w-full flex items-center rounded-[10px] transition-all duration-150 group relative",
          collapsed ? "justify-center px-2 py-2.5" : "px-4 py-2.5 gap-3",
          disabled && "opacity-40 cursor-not-allowed",
        )}
        style={{
          margin: "2px 8px",
          width: "calc(100% - 16px)",
          fontSize: 14,
          fontWeight: isHighlighted && !disabled ? 500 : 400,
          color: disabled
            ? "rgba(255,255,255,0.35)"
            : isHighlighted
              ? "#FFFFFF"
              : "rgba(255,255,255,0.75)",
          background: disabled
            ? "transparent"
            : isHighlighted
              ? "rgba(255,255,255,0.08)"
              : "transparent",
          borderRight: isHighlighted && !disabled ? "3px solid #FFFFFF" : "3px solid transparent",
        }}
        onMouseEnter={(e) => {
          if (disabled || isHighlighted) return;
          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
          e.currentTarget.style.color = "#FFFFFF";
        }}
        onMouseLeave={(e) => {
          if (disabled || isHighlighted) return;
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "rgba(255,255,255,0.75)";
        }}
      >
        <ModuleIcon module={item.module} size="sm" active={!disabled && !!isHighlighted} />
        {!collapsed && (
          <>
            <span className="flex-1 text-right whitespace-nowrap">{item.label}</span>
            {disabled && <Lock className="h-3 w-3 opacity-60" />}
            {hasChildren && (
              <ChevronDown
                className={cn("h-3.5 w-3.5 transition-transform duration-200")}
                style={{ opacity: 0.4, transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
              />
            )}
          </>
        )}
      </button>
    );

    return (
      <div key={item.id}>
        <div className="flex items-center">
          <div className="flex-1 min-w-0">
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{navButton}</TooltipTrigger>
                <TooltipContent side="left"><p>{item.label}</p></TooltipContent>
              </Tooltip>
            ) : navButton}
          </div>
          {/* Quick-add "+" button */}
          {!collapsed && !disabled && quickAdd && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={(e) => { e.stopPropagation(); handleNavigate(quickAdd.path); }}
                  className="flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    width: 20, height: 20,
                    color: "rgba(255,255,255,0.35)",
                    background: "transparent",
                    borderRadius: 4,
                    marginLeft: 4,
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="left"><p>{quickAdd.label}</p></TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Sub-items with animation */}
        {!disabled && hasChildren && !collapsed && (
          <div
            style={{
              overflow: "hidden",
              maxHeight: expanded ? 1000 : 0,
              opacity: expanded ? 1 : 0,
              transition: "max-height 0.2s ease, opacity 0.15s ease",
            }}
          >
            <div style={{ paddingTop: 2 }}>
              {item.groups!.map((group) => (
                <div key={group.groupLabel || "default"}>
                  {group.groupLabel && (
                    <p
                      style={{
                        fontSize: 11,
                        fontWeight: 500,
                        color: "rgba(255,255,255,0.35)",
                        letterSpacing: "0.04em",
                        padding: "16px 16px 6px",
                        margin: 0,
                      }}
                    >
                      {group.groupLabel}
                    </p>
                  )}
                  {group.children.map((child) => {
                    const childActive = isActive(child.path);
                    return (
                      <button
                        key={child.path + child.label}
                        onClick={() => handleNavigate(child.path)}
                        className="w-full flex items-center gap-2 text-right transition-all duration-150"
                        style={{
                          padding: "8px 16px 8px 16px",
                          paddingRight: 44,
                          fontSize: 13,
                          fontWeight: 400,
                          color: childActive ? "#FFFFFF" : "rgba(255,255,255,0.65)",
                          background: childActive ? "rgba(74,158,232,0.1)" : "transparent",
                          borderRadius: 8,
                          margin: "1px 8px",
                          width: "calc(100% - 16px)",
                        }}
                        onMouseEnter={(e) => {
                          if (childActive) return;
                          e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                          e.currentTarget.style.color = "rgba(255,255,255,0.9)";
                          const dot = e.currentTarget.querySelector<HTMLSpanElement>('[data-dot]');
                          if (dot) dot.style.background = GOLD;
                        }}
                        onMouseLeave={(e) => {
                          if (childActive) return;
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "rgba(255,255,255,0.65)";
                          const dot = e.currentTarget.querySelector<HTMLSpanElement>('[data-dot]');
                          if (dot) dot.style.background = "rgba(255,255,255,0.25)";
                        }}
                      >
                        <span
                          data-dot
                          className="flex-shrink-0 rounded-full"
                          style={{
                            width: 4,
                            height: 4,
                            background: childActive ? GOLD : "rgba(255,255,255,0.25)",
                            transition: "background 0.15s ease",
                          }}
                        />
                        <span className="flex-1">{child.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full" style={{ background: SIDEBAR_BG }}>
      {/* ═══ Header ═══ */}
      <div
        className={cn("flex items-center flex-shrink-0", collapsed ? "justify-center px-2" : "px-4")}
        style={{
          padding: collapsed ? "16px 8px" : "20px 16px",
          borderBottom: `1px solid ${SEPARATOR_HEADER}`,
        }}
      >
        {!collapsed ? (
          <div className="flex items-center gap-3 flex-1">
            <button
              onClick={() => navigate("/profile")}
              className="flex-shrink-0 rounded-[10px] hover:ring-2 hover:ring-white/20 transition-all cursor-pointer"
              title="الملف الشخصي"
            >
              {company.logo_url ? (
                <img
                  src={company.logo_url}
                  alt={company.name}
                  className="w-[44px] h-[44px] rounded-[10px] object-contain bg-white p-1"
                  style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
                />
              ) : (
                <img src="/logo-white.png" alt="قيود" width={36} height={36} />
              )}
            </button>
            <div className="min-w-0">
              <h1
                className="leading-tight line-clamp-2"
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "#FFFFFF",
                  fontFamily: "Tajawal, sans-serif",
                }}
              >
                {company.name || "QOYOD"}
              </h1>
              <p
                className="leading-none truncate"
                style={{
                  fontSize: 11,
                  color: "rgba(255,255,255,0.45)",
                  marginTop: 2,
                }}
              >
                {company.industry || "نظام إدارة الأعمال"}
              </p>
            </div>
          </div>
        ) : (
          <button
            onClick={() => navigate("/profile")}
            className="rounded-[10px] hover:ring-2 hover:ring-white/20 transition-all cursor-pointer"
            title="الملف الشخصي"
          >
            {company.logo_url ? (
              <img
                src={company.logo_url}
                alt={company.name}
                className="w-9 h-9 rounded-[10px] object-contain bg-white p-0.5"
                style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}
              />
            ) : (
              <img src="/logo-white.png" alt="قيود" width={32} height={32} />
            )}
          </button>
        )}
      </div>

      {/* ═══ Navigation ═══ */}
      <nav className="flex-1 overflow-y-auto py-3 scrollbar-thin" style={{ scrollbarColor: "rgba(255,255,255,0.1) transparent" }}>
        {navigationSections.map((section, sectionIdx) => (
          <div key={section.sectionTitle || "top"}>
            {/* Section separator */}
            {sectionIdx > 0 && (
              <div style={{ height: 1, background: SEPARATOR, margin: "8px 16px" }} />
            )}
            {!collapsed && section.sectionTitle && (
              <p
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  color: "rgba(255,255,255,0.35)",
                  letterSpacing: "0.04em",
                  padding: "16px 16px 6px",
                  margin: 0,
                }}
              >
                {section.sectionTitle}
              </p>
            )}
            {collapsed && section.sectionTitle && (
              <div style={{ height: 1, background: SEPARATOR, margin: "8px 4px" }} />
            )}
            <div>
              {[...section.items].sort((a, b) => {
                const aD = isItemDisabled(a) ? 1 : 0;
                const bD = isItemDisabled(b) ? 1 : 0;
                return aD - bD;
              }).map(renderNavItem)}
            </div>
          </div>
        ))}
      </nav>

      {/* ═══ Footer ═══ */}
      <div style={{ borderTop: `1px solid ${SEPARATOR_HEADER}`, padding: "12px 16px" }}>
        {/* Logout */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { supabase.auth.signOut(); navigate("/auth"); }}
                className="w-full flex items-center justify-center py-2 rounded-[10px] transition-all duration-150"
                style={{ color: "#FF6B6B" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,107,107,0.1)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <LogOut className="h-5 w-5" strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>تسجيل الخروج</p></TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={() => { supabase.auth.signOut(); navigate("/auth"); }}
            className="w-full flex items-center gap-3 py-2 px-3 rounded-[10px] transition-all duration-150"
            style={{ fontSize: 13, color: "#FF6B6B" }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,107,107,0.1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <LogOut className="h-5 w-5" strokeWidth={1.8} />
            <span>تسجيل الخروج</span>
          </button>
        )}

        {/* Collapse toggle */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggle}
                className="hidden lg:flex w-full items-center justify-center py-2 rounded-[10px] transition-all duration-150 mt-1"
                style={{ color: "rgba(255,255,255,0.45)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.45)"; e.currentTarget.style.background = "transparent"; }}
              >
                <PanelLeftClose className="h-5 w-5" strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>فتح القائمة</p></TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={onToggle}
            className="hidden lg:flex w-full items-center gap-3 py-2 px-3 rounded-[10px] transition-all duration-150 mt-1"
            style={{ fontSize: 13, color: "rgba(255,255,255,0.45)" }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.45)"; e.currentTarget.style.background = "transparent"; }}
          >
            <PanelLeftOpen className="h-5 w-5" strokeWidth={1.8} />
            <span>طي القائمة</span>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden" onClick={onMobileClose} />
      )}

      {/* Mobile sidebar */}
      <aside
        className="fixed inset-y-0 right-0 z-50 lg:hidden"
        style={{
          width: 280,
          background: SIDEBAR_BG,
          transform: mobileOpen ? "translateX(0)" : "translateX(100%)",
          transition: "transform 0.3s ease",
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onMobileClose}
              className="absolute top-4 left-4 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
              style={{ color: "rgba(255,255,255,0.45)" }}
              onMouseEnter={(e) => { e.currentTarget.style.color = "#FFFFFF"; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.45)"; }}
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
        className={cn("hidden lg:flex flex-col flex-shrink-0 transition-all duration-300")}
        style={{
          width: collapsed ? 68 : 260,
          background: SIDEBAR_BG,
          borderLeft: `1px solid ${SEPARATOR}`,
        }}
      >
        {sidebarContent}
      </aside>
    </>
  );
};

export default AppSidebar;
