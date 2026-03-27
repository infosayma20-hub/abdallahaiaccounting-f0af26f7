import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronDown, ArrowLeft, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useSubscription } from "@/hooks/useSubscription";
import WelcomeModal from "@/components/onboarding/WelcomeModal";
import SpotlightTour from "@/components/onboarding/SpotlightTour";
import { supabase } from "@/integrations/supabase/client";

import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";

import { getAppSections, getAllChildren, type NavItem } from "@/config/navigationConfig";
import { multiWordMatchAny } from "@/lib/utils";

const appSections = getAppSections();

/* ── Role-based app visibility ── */
const ROLE_ALLOWED_APPS: Record<string, string[]> = {
  accountant_senior: ["dashboard", "ai-accountant", "finance", "sales", "purchases", "inventory", "fixed-assets", "reports"],
  accountant_sales: ["dashboard", "ai-accountant", "finance", "sales", "reports"],
  accountant_purchases: ["dashboard", "ai-accountant", "finance", "purchases", "inventory", "reports"],
  hr_manager: ["dashboard", "hr"],
};

/* ── App Card — Qoyod-style with prominent icon & hover animation ── */
const AppCard = ({
  app, index, isExpanded, onToggle, onNavigate, disabled, isLocked,
}: {
  app: NavItem; index: number; isExpanded: boolean;
  onToggle: () => void; onNavigate: (path: string) => void; disabled?: boolean; isLocked?: boolean;
}) => {
  const isDisabledOrLocked = disabled || isLocked;
  const hasChildren = !app.isDirect && app.groups && app.groups.length > 0;

  const handleClick = () => {
    if (isDisabledOrLocked) return;
    if (hasChildren) { onToggle(); return; }
    onNavigate(app.path);
  };

  return (
    <motion.div
      id={`app-${app.id}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.035, duration: 0.35, ease: "easeOut" }}
      className={`relative rounded-2xl overflow-hidden transition-all duration-300 ${
        isLocked
          ? "border border-border/20 bg-muted/10 opacity-40 cursor-not-allowed"
          : disabled
          ? "border border-border/20 bg-muted/10 opacity-50 grayscale cursor-not-allowed"
          : isExpanded
          ? "border-2 border-primary/30 bg-card shadow-lg"
          : "border border-border/50 bg-card shadow-sm hover:shadow-xl hover:border-primary/20 hover:-translate-y-1 transition-transform"
      }`}
    >
      <button
        onClick={handleClick}
        className={`w-full flex flex-col items-center gap-2 p-4 pb-3 text-center group relative z-10 ${isDisabledOrLocked ? "cursor-not-allowed" : ""}`}
      >
        <div
          className={`w-[48px] h-[48px] rounded-xl flex items-center justify-center transition-all duration-300 border ${
            isDisabledOrLocked
              ? "bg-muted/40 border-border/20"
              : `${app.bgColor || "bg-primary/8"} border-border/40 group-hover:scale-110 group-hover:shadow-md`
          }`}
        >
          {isLocked ? (
            <Lock className="h-5 w-5 text-muted-foreground/40" />
          ) : (
            <app.icon className={`h-5 w-5 ${app.color || "text-primary"} transition-transform duration-300 group-hover:scale-105`} />
          )}
        </div>

        <div className="space-y-0.5">
          <div className="flex items-center justify-center gap-1.5">
            <p className={`text-[13px] font-medium ${isDisabledOrLocked ? "text-muted-foreground/50" : "text-foreground"}`}>
              {app.label}
            </p>
            {!isDisabledOrLocked && app.isNew && (
              <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-info/10 text-info">جديد</span>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed max-w-[180px] mx-auto line-clamp-2">
            {isLocked ? "🔒 غير متاح" : disabled ? "غير مفعّل" : app.description}
          </p>
        </div>

        {/* Expand indicator */}
        {!isDisabledOrLocked && hasChildren && (
          <ChevronDown className={`h-4 w-4 text-muted-foreground/40 transition-transform duration-300 ${isExpanded ? "rotate-180 text-primary" : ""}`} />
        )}
      </button>

      {/* Expanded children */}
      {!isDisabledOrLocked && isExpanded && hasChildren && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="border-t border-border/30 px-4 pb-4 pt-2 space-y-1"
        >
          {app.groups!.map((group) => (
            <div key={group.groupLabel || "default"}>
              {group.groupLabel && (
                <p className="text-[10px] font-bold text-muted-foreground/50 px-3 pt-2 pb-1">{group.groupLabel}</p>
              )}
              {group.children.map((child) => (
                <button
                  key={child.path + child.label}
                  onClick={() => onNavigate(child.path)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] text-foreground hover:bg-primary/5 hover:text-primary transition-all text-right"
                >
                  <ArrowLeft className="h-3 w-3 text-muted-foreground/40" />
                  <span>{child.label}</span>
                </button>
              ))}
            </div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
};


const AppsLauncher = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings } = useCompanySettings();
  const { subscription } = useSubscription();
  const { shouldShowWelcome, shouldShowTour, update, loading: onboardingLoading, businessType } = useOnboarding();
  const [tourActive, setTourActive] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);

  // Fetch user roles for filtering
  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        setUserRoles((data || []).map((r) => r.role));
      });
  }, [user]);

  const enabledSettings: Record<string, boolean> = useMemo(() => {
    if (!settings) return {};
    return {
      enable_pos: !!(settings as any)?.enable_pos,
      enable_inventory: !!(settings as any)?.enable_inventory,
      enable_fixed_assets: !!(settings as any)?.enable_fixed_assets,
      enable_contractor: !!(settings as any)?.enable_contractor,
      enable_workshops: !!(settings as any)?.enable_workshops,
      enable_ecommerce: !!(settings as any)?.enable_ecommerce,
      enable_travel: !!(settings as any)?.enable_travel,
      enable_tasks: !!(settings as any)?.enable_tasks,
      enable_hr: !!(settings as any)?.enable_hr,
    };
  }, [settings]);

  const isTrial = subscription?.status === "trial" || subscription?.status === "active";

  // Hidden apps from super admin
  const hiddenApps: string[] = useMemo(() => {
    return (settings as any)?.hidden_apps || [];
  }, [settings]);

  const isAppDisabled = (app: NavItem) => {
    // If super admin hid this app, disable it
    if (hiddenApps.includes(app.id)) return true;
    if (!app.enableSetting) return false;
    // During trial, all apps are available
    if (isTrial) return false;
    return !enabledSettings[app.enableSetting];
  };

  // Check if user has a restricted role (not admin/super_admin)
  const restrictedRole = useMemo(() => {
    const restricted = Object.keys(ROLE_ALLOWED_APPS);
    const found = userRoles.find(r => restricted.includes(r));
    // If user also has admin role, don't restrict
    if (userRoles.includes("admin") || userRoles.includes("super_admin")) return null;
    return found || null;
  }, [userRoles]);

  const allFilteredApps = useMemo(() => {
    let allApps = appSections.flatMap(s => s.items);

    // Filter by role if restricted
    if (restrictedRole && ROLE_ALLOWED_APPS[restrictedRole]) {
      const allowed = ROLE_ALLOWED_APPS[restrictedRole];
      allApps = allApps.filter(app => allowed.includes(app.id));
    }
    
    const q = search.trim();
    const filtered = q
      ? allApps.filter(app =>
          multiWordMatchAny(q, app.label, app.description, ...(app.keywords || []))
          || getAllChildren(app).some(c => multiWordMatchAny(q, c.label))
        )
      : allApps;
    // Sort: enabled first, hidden/locked apps last
    return filtered.sort((a, b) => {
      const aHidden = hiddenApps.includes(a.id) ? 2 : 0;
      const bHidden = hiddenApps.includes(b.id) ? 2 : 0;
      const aDisabled = isAppDisabled(a) ? 1 : 0;
      const bDisabled = isAppDisabled(b) ? 1 : 0;
      return (aHidden + aDisabled) - (bHidden + bDisabled);
    });
  }, [search, enabledSettings, restrictedRole, hiddenApps]);

  const totalResults = allFilteredApps.length;

  const handleStartTour = () => { update({ welcome_modal_shown: true }); setTourActive(true); };
  const handleSkipWelcome = () => { update({ welcome_modal_shown: true, full_tour_skipped: true }); };
  const handleTourComplete = () => {
    setTourActive(false);
    update({ full_tour_completed: true, modules_toured: appSections.flatMap(s => s.items.map(i => i.id)) });
  };
  const handleTourSkip = () => { setTourActive(false); update({ full_tour_skipped: true }); };

  return (
    <div className="min-h-full bg-background" dir="rtl">
      
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        {/* Title */}
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-medium text-foreground" style={{ fontFamily: "Tajawal, sans-serif" }}>التطبيقات</h2>
          <p className="text-sm text-muted-foreground">كل احتياج، تطبيق واحد.</p>
        </div>

        {/* Search */}
        <div className="flex justify-center">
          <div className="relative w-full max-w-sm">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن تطبيق..."
              className="pr-10 rounded-lg bg-card border border-border/30 h-10 text-sm"
            />
          </div>
        </div>

        {/* Apps Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {allFilteredApps.map((app, idx) => (
            <AppCard
              key={app.id}
              app={app}
              index={idx}
              isExpanded={expandedApp === app.id}
              onToggle={() => setExpandedApp(prev => prev === app.id ? null : app.id)}
              onNavigate={navigate}
              disabled={isAppDisabled(app)}
              isLocked={hiddenApps.includes(app.id)}
            />
          ))}
        </div>

        {totalResults === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
            <p className="text-sm">لا توجد نتائج لـ "{search}"</p>
          </div>
        )}
      </div>


      {!onboardingLoading && (
        <>
          <WelcomeModal open={shouldShowWelcome} onStartTour={handleStartTour} onSkip={handleSkipWelcome} />
          <SpotlightTour
            active={tourActive || shouldShowTour}
            onComplete={handleTourComplete}
            onSkip={handleTourSkip}
          />
        </>
      )}
    </div>
  );
};

export default AppsLauncher;
