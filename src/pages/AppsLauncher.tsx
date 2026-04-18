import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useSubscription } from "@/hooks/useSubscription";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import WelcomeModal from "@/components/onboarding/WelcomeModal";
import SpotlightTour from "@/components/onboarding/SpotlightTour";
import UpgradePromptModal from "@/components/subscription/UpgradePromptModal";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

import { getAppSections, type NavItem } from "@/config/navigationConfig";
import { multiWordMatchAny } from "@/lib/utils";
import { APPS_VISUAL_META, getAppMeta, type AppSection as SectionKey } from "@/pages/Apps/data/appsRegistry";
import AppCardV2 from "@/pages/Apps/components/AppCardV2";
import AppSectionBlock from "@/pages/Apps/components/AppSection";

const appSections = getAppSections();

/* ── Role-based app visibility ── */
const ROLE_ALLOWED_APPS: Record<string, string[]> = {
  accountant_senior: ["dashboard", "ai-accountant", "finance", "sales", "purchases", "inventory", "fixed-assets", "reports", "tax"],
  accountant_sales: ["dashboard", "ai-accountant", "finance", "sales", "reports"],
  accountant_purchases: ["dashboard", "ai-accountant", "finance", "purchases", "inventory", "reports"],
  hr_manager: ["dashboard", "hr"],
};

/* ── App Card — Qoyod-style with prominent icon & hover animation ── */
const AppCard = ({
  app, index, isExpanded, onToggle, onNavigate, disabled, isLocked, isPremiumLocked, onPremiumClick,
}: {
  app: NavItem; index: number; isExpanded: boolean;
  onToggle: () => void; onNavigate: (path: string) => void; disabled?: boolean; isLocked?: boolean;
  isPremiumLocked?: boolean; onPremiumClick?: () => void;
}) => {
  const isDisabledOrLocked = disabled || isLocked;
  const hasChildren = !app.isDirect && app.groups && app.groups.length > 0;

  const handleClick = () => {
    if (isDisabledOrLocked) return;
    if (isPremiumLocked) { onPremiumClick?.(); return; }
    if (hasChildren) { onToggle(); return; }
    onNavigate(app.path);
  };

  return (
    <motion.div
      id={`app-${app.id}`}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.035, duration: 0.35, ease: "easeOut" }}
      className="relative rounded-[14px] overflow-hidden cursor-pointer"
      style={{
        background: isLocked ? "#f8fafc" : "#ffffff",
        border: isLocked ? "1.5px solid #e2e8f0" : "1.5px solid #dbeafe",
        transition: "all 0.15s ease",
        ...(isDisabledOrLocked ? { opacity: 0.5 } : {}),
      }}
      onMouseEnter={(e) => {
        if (isDisabledOrLocked) return;
        e.currentTarget.style.borderColor = "#3b82f6";
        e.currentTarget.style.boxShadow = "0 0 0 3px #eff6ff";
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        if (isDisabledOrLocked) return;
        e.currentTarget.style.borderColor = "#dbeafe";
        e.currentTarget.style.boxShadow = "none";
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <button
        onClick={handleClick}
        className={`w-full flex flex-col items-center gap-2 p-5 pb-4 text-center group relative z-10 ${isDisabledOrLocked ? "cursor-not-allowed" : ""}`}
      >
        <div
          className={`w-[52px] h-[52px] rounded-xl flex items-center justify-center transition-all duration-300 ${
            isDisabledOrLocked
              ? "grayscale"
              : `${app.bgColor || "bg-primary/8"} group-hover:scale-110`
          }`}
        >
          {isLocked ? (
            <Lock className="h-5 w-5" style={{ color: "#cbd5e1" }} />
          ) : isPremiumLocked ? (
            <app.icon className={`h-5 w-5 ${app.color || "text-primary"} opacity-50 transition-transform duration-300 group-hover:scale-105`} />
          ) : (
            <app.icon className={`h-5 w-5 ${app.color || "text-primary"} transition-transform duration-300 group-hover:scale-105`} />
          )}
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-center gap-1.5">
            <p style={{ fontSize: 15, fontWeight: 600, color: isDisabledOrLocked ? "#94a3b8" : isPremiumLocked ? "#475569" : "#0D1B2E" }}>
              {app.label}
            </p>
            {!isDisabledOrLocked && !isPremiumLocked && app.isNew && (
              <span className="text-[9px] font-medium px-2 py-0.5 rounded-full bg-info/10 text-info">جديد</span>
            )}
            {isPremiumLocked && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5" style={{ background: "#fef3c7", color: "#92400e" }}>
                <Crown className="w-2.5 h-2.5" /> Premium
              </span>
            )}
          </div>
          <p style={{ fontSize: 12, color: isLocked || isPremiumLocked ? "#94a3b8" : "#64748b", lineHeight: 1.5, maxWidth: 180, margin: "0 auto" }} className="line-clamp-2">
            {isLocked ? "🔒 غير متاح" : isPremiumLocked ? "🔓 ترقية للاستخدام" : disabled ? "غير مفعّل" : app.description}
          </p>
        </div>

        {/* Expand indicator */}
        {!isDisabledOrLocked && hasChildren && (
          <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} style={{ color: isExpanded ? "#3b82f6" : "#94a3b8" }} />
        )}
      </button>

      {/* Expanded children */}
      {!isDisabledOrLocked && isExpanded && hasChildren && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="px-4 pb-4 pt-2 space-y-1"
          style={{ borderTop: "1px solid #e2e8f0" }}
        >
          {app.groups!.map((group) => (
            <div key={group.groupLabel || "default"}>
              {group.groupLabel && (
                <p style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", padding: "8px 12px 4px" }}>{group.groupLabel}</p>
              )}
              {group.children.map((child) => (
                <button
                  key={child.path + child.label}
                  onClick={() => onNavigate(child.path)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[12px] transition-all text-right"
                  style={{ color: "#0D1B2E" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "#eff6ff"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <ArrowLeft className="h-3 w-3" style={{ color: "#94a3b8" }} />
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
  const { user, loading: authLoading } = useAuth();
  const { settings, loading: settingsLoading } = useCompanySettings();
  const { subscription, loading: subLoading } = useSubscription();
  const { isTrial, isSuperAdmin, loading: guardLoading } = useSubscriptionGuard();
  const { shouldShowWelcome, shouldShowTour, update, loading: onboardingLoading, businessType } = useOnboarding();
  const [tourActive, setTourActive] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [userRoles, setUserRoles] = useState<string[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; module: string; tier: string }>({ open: false, module: "", tier: "pro" });

  // Subscription is fully resolved only when both subscription + guard finished loading
  const subscriptionResolved = !subLoading && !guardLoading;

  // Fetch user roles for filtering (with cleanup to avoid setState on unmounted)
  useEffect(() => {
    if (!user) {
      setRolesLoading(false);
      return;
    }
    let cancelled = false;
    setRolesLoading(true);
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .then(({ data }) => {
        if (cancelled) return;
        setUserRoles((data || []).map((r) => r.role));
        setRolesLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  // Unified loading gate: render skeleton until ALL deps are ready in one pass
  const isReady =
    !authLoading &&
    !settingsLoading &&
    !subLoading &&
    !guardLoading &&
    !onboardingLoading &&
    !rolesLoading;

  // Hidden apps from super admin
  const hiddenApps: string[] = useMemo(() => {
    return (settings as any)?.hidden_apps || [];
  }, [settings]);

  // Item is locked by super admin
  const isAppDisabled = (app: NavItem) => {
    if (hiddenApps.includes(app.id)) return true;
    return false;
  };

  // 🚫 Premium lock نظام مُلغى — التحكم يدوي فقط عبر hidden_apps
  const isAppPremiumLocked = (_app: NavItem) => false;

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
      const aDisabled = isAppDisabled(a) ? 1 : 0;
      const bDisabled = isAppDisabled(b) ? 1 : 0;
      return aDisabled - bDisabled;
    });
  }, [search, restrictedRole, hiddenApps]);

  const totalResults = allFilteredApps.length;

  const handleStartTour = () => { update({ welcome_modal_shown: true }); setTourActive(true); };
  const handleSkipWelcome = () => { update({ welcome_modal_shown: true, full_tour_skipped: true }); };
  const handleTourComplete = () => {
    setTourActive(false);
    update({ full_tour_completed: true, modules_toured: appSections.flatMap(s => s.items.map(i => i.id)) });
  };
  const handleTourSkip = () => { setTourActive(false); update({ full_tour_skipped: true }); };

  return (
    <div style={{ minHeight: "100%", background: "#f1f5f9", margin: "-1.25rem", marginBottom: 0 }} className="lg:-m-8 lg:mb-0" dir="rtl">
      
      <div className="max-w-5xl mx-auto px-8 pb-8" style={{ paddingTop: 48 }}>
        {/* Title */}
        <div className="text-center space-y-2 mb-6">
          <h2 style={{ fontSize: 32, fontWeight: 700, color: "#0D1B2E", fontFamily: "Tajawal, sans-serif" }}>التطبيقات</h2>
          <p style={{ fontSize: 15, color: "#64748b" }}>كل احتياج. تطبيق واحد.</p>
        </div>

        {/* Search */}
        <div className="flex justify-center mb-8">
          <div className="relative" style={{ width: 420 }}>
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: "#94a3b8" }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن تطبيق..."
              style={{
                width: "100%",
                height: 44,
                paddingRight: 40,
                paddingLeft: 16,
                borderRadius: 10,
                background: "#ffffff",
                border: "1.5px solid #dbeafe",
                fontSize: 14,
                color: "#0D1B2E",
                outline: "none",
                transition: "all 0.15s ease",
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#3b82f6"; e.currentTarget.style.boxShadow = "0 0 0 3px #eff6ff"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "#dbeafe"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>
        </div>

        {/* Apps Grid — gated on unified loading state to prevent flicker */}
        {!isReady ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="rounded-[14px] p-5 pb-4 flex flex-col items-center gap-3"
                style={{ background: "#ffffff", border: "1.5px solid #dbeafe" }}
              >
                <Skeleton shimmer className="w-[52px] h-[52px] rounded-xl" />
                <Skeleton shimmer className="h-4 w-24 rounded-md" />
                <Skeleton shimmer className="h-3 w-32 rounded-md" />
              </div>
            ))}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
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
                  isPremiumLocked={isAppPremiumLocked(app)}
                  onPremiumClick={() => setUpgradeModal({ open: true, module: app.label, tier: "pro" })}
                />
              ))}
            </div>

            {totalResults === 0 && (
              <div className="text-center py-16">
                <Search className="h-8 w-8 mx-auto mb-3" style={{ color: "#94a3b8", opacity: 0.4 }} />
                <p style={{ fontSize: 14, color: "#64748b" }}>لا توجد نتائج لـ "{search}"</p>
              </div>
            )}
          </>
        )}
      </div>

      <UpgradePromptModal
        open={upgradeModal.open}
        onOpenChange={(v) => setUpgradeModal(prev => ({ ...prev, open: v }))}
        moduleName={upgradeModal.module}
        requiredTier={upgradeModal.tier}
      />

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
