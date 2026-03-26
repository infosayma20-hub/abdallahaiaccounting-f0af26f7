import React, { useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, X, PanelLeftClose, PanelLeftOpen, Lock, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import ModuleIcon from "@/components/ModuleIcon";
import { useCompany } from "@/hooks/useCompanyContext";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useSubscription } from "@/hooks/useSubscription";

import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { FinixLogo } from "@/components/ui/FinixLogo";
import { navigationSections, getAllChildren, type NavItem } from "@/config/navigationConfig";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

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

  const isItemDisabled = (item: NavItem) => {
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
    const disabled = isItemDisabled(item);
    const active = !disabled && isActive(item.path);
    const groupActive = !disabled && isGroupActive(item);
    const expanded = openItem === item.label;
    const hasChildren = !item.isDirect && item.groups && item.groups.length > 0;

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
          "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all group relative",
          disabled
            ? "opacity-40 cursor-not-allowed"
            : active || groupActive
              ? "text-sidebar-primary font-bold"
              : "text-sidebar-foreground hover:text-sidebar-accent-foreground",
          collapsed && "justify-center px-2"
        )}
        style={
          !disabled && (active || groupActive)
            ? { background: "rgba(232,160,32,0.12)", borderRight: "3px solid #E8A020" }
            : undefined
        }
      >
        <ModuleIcon module={item.module} size="sm" active={!disabled && (active || !!groupActive)} />
        {!collapsed && (
          <>
            <span className="flex-1 text-right whitespace-nowrap">{item.label}</span>
            {disabled && <Lock className="h-3 w-3 opacity-60" />}
            {hasChildren && (
              <ChevronDown className={cn("h-3.5 w-3.5 opacity-40 transition-transform duration-200", expanded && "rotate-180")} />
            )}
          </>
        )}
      </button>
    );

    return (
      <div
        key={item.id}
        ref={(el) => {
          if (el && hasChildren && expanded) {
            setTimeout(() => {
              const button = el.querySelector("button");
              if (button) button.scrollIntoView({ behavior: "smooth", block: "start" });
            }, 50);
          }
        }}
      >
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>{navButton}</TooltipTrigger>
            <TooltipContent side="left"><p>{item.label}</p></TooltipContent>
          </Tooltip>
        ) : navButton}

        {!disabled && hasChildren && expanded && !collapsed && (
          <div className="mr-5 mt-0.5 space-y-1 pr-3" style={{ borderRight: "1px solid #1E3A5F" }}>
            {item.groups!.map((group) => (
              <div key={group.groupLabel || "default"}>
                {group.groupLabel && (
                  <p className="text-[10px] font-semibold text-sidebar-foreground/30 px-3 pt-2 pb-0.5">{group.groupLabel}</p>
                )}
                {group.children.map((child) => {
                  const childActive = isActive(child.path);
                  return (
                    <button
                      key={child.path + child.label}
                      onClick={() => handleNavigate(child.path)}
                      className={cn(
                        "w-full text-right px-3 py-1.5 rounded-lg text-[12px] transition-all",
                        childActive ? "text-sidebar-primary font-medium" : "text-sidebar-foreground hover:text-sidebar-accent-foreground"
                      )}
                      style={childActive ? { background: "rgba(232,160,32,0.08)" } : undefined}
                    >
                      {child.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo / Brand */}
      <div className={cn("h-16 flex items-center px-4 flex-shrink-0 border-b", collapsed && "justify-center px-2")} style={{ borderColor: "#1E3A5F" }}>
        {!collapsed ? (
          <div className="flex items-center gap-3 flex-1">
            <button onClick={() => navigate("/profile")} className="flex-shrink-0 rounded-[10px] hover:ring-2 hover:ring-white/30 transition-all cursor-pointer" title="الملف الشخصي">
              {company.logo_url ? (
                <img src={company.logo_url} alt={company.name} className="w-[44px] h-[44px] rounded-[10px] object-contain bg-white p-1" style={{ boxShadow: "0 2px 8px rgba(13,27,42,0.10)" }} />
              ) : (
                <img src="/logo-white.png" alt="قيود" width={32} height={32} />
              )}
            </button>
            <div className="min-w-0">
              <h1 className="text-[13px] leading-tight font-bold text-white line-clamp-2" style={{ fontFamily: "Tajawal, sans-serif" }}>{company.name || "QOYOD"}</h1>
              <p className="text-[10px] text-sidebar-foreground leading-none truncate">{company.industry || "نظام إدارة الأعمال"}</p>
            </div>
          </div>
        ) : (
          <button onClick={() => navigate("/profile")} className="rounded-lg hover:ring-2 hover:ring-white/30 transition-all cursor-pointer" title="الملف الشخصي">
            {company.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="w-9 h-9 rounded-lg object-contain bg-white p-0.5" style={{ boxShadow: "0 2px 8px rgba(13,27,42,0.10)" }} />
            ) : (
              <img src="/logo-white.png" alt="قيود" width={32} height={32} />
            )}
          </button>
        )}
      </div>


      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto py-2 px-3 space-y-5">
        {navigationSections.map((section) => (
          <div key={section.sectionTitle || "top"}>
            {!collapsed && section.sectionTitle && (
              <p className="text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-[0.12em] px-3 mb-2">{section.sectionTitle}</p>
            )}
            {collapsed && section.sectionTitle && <div className="h-px mx-1 mb-2" style={{ background: "#1E3A5F" }} />}
            <div className="space-y-0.5">
              {[...section.items].sort((a, b) => {
                const aD = isItemDisabled(a) ? 1 : 0;
                const bD = isItemDisabled(b) ? 1 : 0;
                return aD - bD;
              }).map(renderNavItem)}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom — collapse toggle */}
      <div className="py-3 px-3 space-y-0.5" style={{ borderTop: "1px solid #1E3A5F" }}>
        {/* Logout button */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={() => { supabase.auth.signOut(); navigate("/auth"); }} className="w-full flex items-center justify-center px-3 py-2 rounded-lg text-[13px] text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-all">
                <LogOut className="h-5 w-5" strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>تسجيل الخروج</p></TooltipContent>
          </Tooltip>
        ) : (
          <button onClick={() => { supabase.auth.signOut(); navigate("/auth"); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-red-400/80 hover:text-red-400 hover:bg-red-500/10 transition-all">
            <LogOut className="h-5 w-5" strokeWidth={1.8} />
            <span>تسجيل الخروج</span>
          </button>
        )}

        {/* Collapse toggle */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={onToggle} className="hidden lg:flex w-full items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-sidebar-foreground/60 hover:text-sidebar-foreground transition-all justify-center">
                <PanelLeftOpen className="h-5 w-5 mx-auto" strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>فتح القائمة</p></TooltipContent>
          </Tooltip>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={onToggle} className="hidden lg:flex w-full items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-sidebar-foreground/60 hover:text-sidebar-foreground transition-all">
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
      {mobileOpen && <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm lg:hidden" onClick={onMobileClose} />}
      <aside className={cn("fixed inset-y-0 right-0 z-50 w-[280px] bg-sidebar transform transition-transform duration-300 lg:hidden")} style={{ transform: mobileOpen ? "translateX(0)" : "translateX(100%)" }}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button onClick={onMobileClose} className="absolute top-4 left-4 w-8 h-8 rounded-lg flex items-center justify-center text-sidebar-foreground hover:text-white transition-colors">
              <X className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom"><p>إغلاق القائمة</p></TooltipContent>
        </Tooltip>
        {sidebarContent}
      </aside>
      <aside className={cn("hidden lg:flex flex-col bg-sidebar flex-shrink-0 transition-all duration-300", collapsed ? "w-[68px]" : "w-[240px]")} style={{ borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
        {sidebarContent}
      </aside>
    </>
  );
};

export default AppSidebar;
