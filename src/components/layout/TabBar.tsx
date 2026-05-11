import { useRef, useEffect, useState, useCallback } from "react";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useAppTabs, ICON_MAP } from "@/contexts/TabsContext";
import { cn } from "@/lib/utils";

/**
 * Routes that own a dedicated section navigation (HR top nav). The global
 * closeable tab strip is suppressed on these routes so HR feels like a
 * permanent admin module instead of a temporary tab.
 */
const HIDDEN_TABBAR_PREFIXES = [
  "/hr",
  "/employees",
  "/employee-forms-management",
  "/hr-attendance",
  "/hr-deductions",
  "/attendance/roster",
  "/manager/roster",
  "/leaves",
  "/loans",
  "/advances",
  "/payroll",
  "/payroll-settings",
];

const TabBar = () => {
  const { pathname } = useLocation();
  const isHRRoute = HIDDEN_TABBAR_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
  const { tabs, activeTabId, switchTab, closeTab, closeAllTabs } = useAppTabs();
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 2);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 2);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    const ro = new ResizeObserver(checkScroll);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", checkScroll); ro.disconnect(); };
  }, [tabs.length, checkScroll]);

  // Auto-scroll to active tab
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
  }, [activeTabId]);

  const scroll = (dir: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -160 : 160, behavior: "smooth" });
  };

  if (tabs.length === 0 || isHRRoute) return null;

  return (
    <div
      className="flex items-center border-b border-border/40 select-none overflow-hidden flex-shrink-0"
      style={{ height: 38, background: "hsl(var(--card))" }}
    >
      {/* Scroll right arrow (RTL: right = start) */}
      {canScrollRight && (
        <button
          onClick={() => scroll("right")}
          className="flex items-center justify-center w-5 h-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors flex-shrink-0"
          aria-label="تمرير لليمين"
        >
          <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      )}

      <div
        ref={scrollRef}
        className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide px-2 flex-1"
        style={{ scrollbarWidth: "none" }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const IconComp = ICON_MAP[tab.icon] || ICON_MAP.file;
          return (
            <button
              key={tab.id}
              ref={isActive ? activeRef : undefined}
              onClick={() => switchTab(tab.id)}
              onMouseDown={(e) => {
                if (e.button === 1) { e.preventDefault(); closeTab(tab.id); }
              }}
              className={cn(
                "group relative flex items-center gap-1.5 px-3 h-[34px] rounded-t-lg text-xs whitespace-nowrap transition-all duration-150 max-w-[180px] min-w-[80px] flex-shrink-0",
                isActive
                  ? "bg-background text-foreground border-t-2 border-t-primary border-x border-x-border/60 border-b-0 shadow-sm font-semibold relative z-10 -mb-px"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground font-medium border border-transparent"
              )}
            >
              <IconComp
                className={cn("h-3.5 w-3.5 flex-shrink-0", isActive ? "text-primary opacity-100" : "opacity-70")}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              <span className={cn("truncate flex-1 text-right", isActive && "font-semibold text-foreground")}>{tab.title}</span>
              <span
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }}
                className={cn(
                  "flex items-center justify-center rounded-sm w-4 h-4 flex-shrink-0 transition-all",
                  isActive
                    ? "opacity-60 hover:opacity-100 hover:bg-destructive/10 hover:text-destructive"
                    : "opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-destructive/10 hover:text-destructive"
                )}
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>

      {/* Scroll left arrow (RTL: left = end) */}
      {canScrollLeft && (
        <button
          onClick={() => scroll("left")}
          className="flex items-center justify-center w-5 h-full text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 transition-colors flex-shrink-0"
          aria-label="تمرير لليسار"
        >
          <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      )}

      {/* Close all tabs button */}
      {tabs.length > 1 && (
        <div className="flex items-center px-2 border-r border-border/30 flex-shrink-0">
          <button
            onClick={closeAllTabs}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-1 rounded hover:bg-muted/50"
            title="إغلاق الكل"
          >
            ✕ الكل
          </button>
        </div>
      )}
    </div>
  );
};

export default TabBar;
