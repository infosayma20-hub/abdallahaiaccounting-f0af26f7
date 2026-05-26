import React, { useState, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, X, PanelLeftClose, PanelLeftOpen, Lock, LogOut, Plus, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import ModuleIcon from "@/components/ModuleIcon";
import { useCompany } from "@/hooks/useCompanyContext";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useSubscription } from "@/hooks/useSubscription";
import { usePermission } from "@/hooks/usePermission";

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
import { useMyAppOverrides } from "@/hooks/useMyAppOverrides";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

const SIDEBAR_BG = "#0D1B2E";
const GOLD = "#4A9EE8";
const SEPARATOR = "rgba(255,255,255,0.08)";
const SEPARATOR_HEADER = "rgba(255,255,255,0.08)";

const AppSidebar = ({ collapsed, onToggle, mobileOpen, onMobileClose }: SidebarProps) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { company } = useCompany();
  const { settings } = useCompanySettings();
  const { subscription } = useSubscription();
  const [openItem, setOpenItem] = useState<string | null>(null);
  const navRef = React.useRef<HTMLElement>(null);
  const itemRefs = React.useRef<Map<string, HTMLDivElement>>(new Map());

  const isTrial = subscription?.isTrial ?? true;

  const hiddenApps: string[] = useMemo(() => {
    return (settings as any)?.hidden_apps || [];
  }, [settings]);
  const { allow: allowOverrides, deny: denyOverrides } = useMyAppOverrides();

  const isItemHidden = (item: NavItem) => {
    if (denyOverrides.has(item.id)) return true;
    if (allowOverrides.has(item.id)) return false;
    return hiddenApps.includes(item.id);
  };

  // Item is locked by super admin — show with lock
  const isItemDisabled = (item: NavItem) => {
    if (isItemHidden(item)) return true;
    return false;
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
              // Preserve scroll position + keep clicked item visible after toggle
              const navEl = navRef.current;
              const itemEl = itemRefs.current.get(item.label);
              const prevScroll = navEl?.scrollTop ?? 0;
              const itemTopBefore = itemEl?.offsetTop ?? 0;
              setOpenItem(prev => prev === item.label ? null : item.label);
              requestAnimationFrame(() => {
                if (!navEl || !itemEl) return;
                const itemTopAfter = itemEl.offsetTop;
                const delta = itemTopAfter - itemTopBefore;
                navEl.scrollTop = prevScroll + delta;
              });
            }
          } else if (item.path) {
            handleNavigate(item.path);
          }
        }}
        className={cn(
          "w-full flex flex-row flex-nowrap items-center rounded-lg transition-all duration-150 group relative overflow-hidden",
          collapsed ? "justify-center px-0 py-2" : "gap-3",
          disabled && "opacity-40 cursor-not-allowed",
        )}
        style={{
          margin: collapsed ? "2px 4px" : "2px 8px",
          width: collapsed ? "calc(100% - 8px)" : "calc(100% - 16px)",
          padding: collapsed ? "8px 0" : "10px 12px",
          fontSize: 14,
          fontWeight: isHighlighted && !disabled ? 500 : 400,
          color: disabled
            ? "rgba(255,255,255,0.35)"
            : isHighlighted
              ? "#FFFFFF"
              : "rgba(255,255,255,0.6)",
          background: disabled
            ? "transparent"
            : isHighlighted
              ? "rgba(255,255,255,0.12)"
              : "transparent",
          borderRight: isHighlighted && !disabled ? "3px solid #FFFFFF" : "3px solid transparent",
          borderRadius: 8,
        }}
        onMouseEnter={(e) => {
          if (disabled || isHighlighted) return;
          e.currentTarget.style.background = "rgba(255,255,255,0.06)";
          e.currentTarget.style.color = "rgba(255,255,255,0.9)";
        }}
        onMouseLeave={(e) => {
          if (disabled || isHighlighted) return;
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.color = "rgba(255,255,255,0.6)";
        }}
      >
        <div className={cn(
          "flex items-center justify-center flex-shrink-0 transition-all",
          collapsed ? "w-[28px] h-[28px] rounded-lg" : "w-[36px] h-[36px] rounded-[10px]",
          disabled ? "bg-white/5" : isHighlighted ? `${item.bgColor || "bg-primary/10"}` : "bg-white/5"
        )}>
          <item.icon className={cn(
            "transition-colors",
            collapsed ? "h-[16px] w-[16px]" : "h-[18px] w-[18px]",
            disabled ? "text-white/30" : isHighlighted ? (item.color || "text-primary") : ""
          )} style={!disabled && !isHighlighted ? { color: "rgba(255,255,255,0.4)" } : undefined} />
        </div>
        {!collapsed && (
          <>
            <span className="flex-1 text-right whitespace-nowrap">{item.label}</span>
            {locked && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Lock className="h-3 w-3 opacity-60 text-amber-400" />
                </TooltipTrigger>
                <TooltipContent side="left"><p>🔒 غير متاح — تواصل مع الإدارة</p></TooltipContent>
              </Tooltip>
            )}
            {disabled && !locked && <Lock className="h-3 w-3 opacity-60" />}
            {hasChildren && (
              <ChevronDown
                className="h-3.5 w-3.5 transition-transform duration-200"
                style={{ color: "rgba(255,255,255,0.3)", transform: expanded ? "rotate(180deg)" : "rotate(0)" }}
              />
            )}
          </>
        )}
      </button>
    );

    return (
      <div
        key={item.id}
        ref={(el) => {
          if (el) itemRefs.current.set(item.label, el);
          else itemRefs.current.delete(item.label);
        }}
      >
        <div className="flex items-center">
          <div className="flex-1 min-w-0">
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>{navButton}</TooltipTrigger>
                <TooltipContent side="left"><p>{item.label}</p></TooltipContent>
              </Tooltip>
            ) : navButton}
          </div>
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
                          paddingRight: 28,
                          fontSize: 13,
                          fontWeight: 400,
                          color: childActive ? "#FFFFFF" : "rgba(255,255,255,0.55)",
                          background: childActive ? "rgba(74,158,232,0.1)" : "transparent",
                          borderRadius: 8,
                          margin: "1px 8px",
                          width: "calc(100% - 16px)",
                        }}
                        onMouseEnter={(e) => {
                          if (childActive) return;
                          e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                          e.currentTarget.style.color = "rgba(255,255,255,0.8)";
                          const dot = e.currentTarget.querySelector<HTMLSpanElement>('[data-dot]');
                          if (dot) dot.style.background = GOLD;
                        }}
                        onMouseLeave={(e) => {
                          if (childActive) return;
                          e.currentTarget.style.background = "transparent";
                          e.currentTarget.style.color = "rgba(255,255,255,0.55)";
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
                <img src="/logos/amwali-mark-white.png" alt="أموالي" width={36} height={36} />
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
                {company.name || "AMWALI"}
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
              <img src="/logos/amwali-mark-white.png" alt="أموالي" width={32} height={32} />
            )}
          </button>
        )}
      </div>

      {/* ═══ Navigation ═══ */}
      <nav ref={navRef} className="flex-1 overflow-y-auto py-2" style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) rgba(255,255,255,0.05)", padding: 8 }}>
        {/* Enabled items per section */}
        {navigationSections.map((section, sectionIdx) => {
          const enabledItems = section.items.filter(item => !isItemDisabled(item));
          if (enabledItems.length === 0 && sectionIdx > 0) return null;
          return (
            <div key={section.sectionTitle || "top"}>
              {sectionIdx > 0 && enabledItems.length > 0 && (
                <div style={{ height: 1, background: SEPARATOR, margin: "8px 16px" }} />
              )}
              {!collapsed && section.sectionTitle && enabledItems.length > 0 && (
                <p style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.3)", padding: "16px 12px 6px", margin: 0 }}>
                  {section.sectionTitle}
                </p>
              )}
              {collapsed && section.sectionTitle && enabledItems.length > 0 && (
                <div style={{ height: 1, background: SEPARATOR, margin: "8px 4px" }} />
              )}
              <div>{enabledItems.map(renderNavItem)}</div>
            </div>
          );
        })}

        {/* Disabled/locked items at the very end */}
        {(() => {
          const disabledItems = navigationSections.flatMap(s => s.items).filter(item => isItemDisabled(item));
          if (disabledItems.length === 0) return null;
          return (
            <div>
              <div style={{ height: 1, background: SEPARATOR, margin: "8px 16px" }} />
              {!collapsed && (
                <p style={{ fontSize: 11, fontWeight: 500, color: "rgba(255,255,255,0.25)", letterSpacing: "0.04em", padding: "16px 16px 6px", margin: 0 }}>
                  غير مفعّل
                </p>
              )}
              {collapsed && (
                <div style={{ height: 1, background: SEPARATOR, margin: "8px 4px" }} />
              )}
              <div>{disabledItems.map(renderNavItem)}</div>
            </div>
          );
        })()}
      </nav>

      {/* ═══ Footer ═══ */}
      <div style={{ borderTop: `1px solid ${SEPARATOR}`, padding: 8 }}>
        {/* Help Center */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => navigate("/help")}
                className="w-full flex items-center justify-center py-2 rounded-lg transition-all duration-150"
                style={{ color: "hsl(var(--muted-foreground))" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "hsl(var(--accent))"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <HelpCircle className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>مركز المساعدة</p></TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={() => navigate("/help")}
            className="w-full flex items-center gap-3 rounded-lg transition-all duration-150"
            style={{ fontSize: 14, color: "hsl(var(--muted-foreground))", padding: "10px 12px", borderRadius: 8 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "hsl(var(--accent))"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <HelpCircle className="h-[18px] w-[18px]" strokeWidth={1.8} />
            <span>مركز المساعدة</span>
          </button>
        )}
        {/* Logout */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { supabase.auth.signOut(); navigate("/auth"); }}
                className="w-full flex items-center justify-center py-2 rounded-lg transition-all duration-150"
                style={{ color: "#f87171" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>تسجيل الخروج</p></TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={() => { supabase.auth.signOut(); navigate("/auth"); }}
            className="w-full flex items-center gap-3 rounded-lg transition-all duration-150"
            style={{ fontSize: 14, color: "#f87171", padding: "10px 12px", borderRadius: 8 }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(239,68,68,0.12)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
          >
            <LogOut className="h-[18px] w-[18px]" strokeWidth={1.8} />
            <span>تسجيل الخروج</span>
          </button>
        )}

        {/* Collapse toggle */}
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={onToggle}
                className="hidden lg:flex w-full items-center justify-center py-2 rounded-lg transition-all duration-150 mt-1"
                style={{ color: "rgba(255,255,255,0.4)" }}
                onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.background = "transparent"; }}
              >
                <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.8} />
              </button>
            </TooltipTrigger>
            <TooltipContent side="left"><p>فتح القائمة</p></TooltipContent>
          </Tooltip>
        ) : (
          <button
            onClick={onToggle}
            className="hidden lg:flex w-full items-center gap-3 rounded-lg transition-all duration-150 mt-1"
            style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", padding: "10px 12px", borderRadius: 8 }}
            onMouseEnter={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = "rgba(255,255,255,0.4)"; e.currentTarget.style.background = "transparent"; }}
          >
            <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.8} />
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
          width: collapsed ? 60 : 280,
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
