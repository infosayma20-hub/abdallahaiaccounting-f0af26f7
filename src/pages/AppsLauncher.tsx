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
import AppsHero from "@/pages/Apps/components/AppsHero";
import FloatingAIBar from "@/pages/Apps/components/FloatingAIBar";
import CategoryPills, { type CategoryFilter } from "@/pages/Apps/components/CategoryPills";
import CommandPalette from "@/pages/Apps/components/CommandPalette";
import { useFavoriteApps } from "@/hooks/useFavoriteApps";
import { Star, Command } from "lucide-react";

const appSections = getAppSections();

/* ── Role-based app visibility ── */
const ROLE_ALLOWED_APPS: Record<string, string[]> = {
  accountant_senior: ["dashboard", "ai-accountant", "finance", "sales", "purchases", "inventory", "fixed-assets", "reports", "tax"],
  accountant_sales: ["dashboard", "ai-accountant", "finance", "sales", "reports"],
  accountant_purchases: ["dashboard", "ai-accountant", "finance", "purchases", "inventory", "reports"],
  hr_manager: ["dashboard", "hr"],
};

/* AppCard component moved to src/pages/Apps/components/AppCardV2.tsx (Phase 1) */

const AppsLauncher = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { settings, loading: settingsLoading } = useCompanySettings();
  const { subscription, loading: subLoading } = useSubscription();
  const { isTrial, isSuperAdmin, loading: guardLoading } = useSubscriptionGuard();
  const { shouldShowWelcome, shouldShowTour, update, loading: onboardingLoading, businessType } = useOnboarding();
  const [tourActive, setTourActive] = useState(false);
  const [search, setSearch] = useState("");
  // expandedApp removed in Phase 1 — apps now navigate directly
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

  /* Filter apps by role + search; group results by section (Phase 1) */
  const groupedApps = useMemo(() => {
    let allApps = appSections.flatMap(s => s.items);

    // Role-based filter
    if (restrictedRole && ROLE_ALLOWED_APPS[restrictedRole]) {
      const allowed = ROLE_ALLOWED_APPS[restrictedRole];
      allApps = allApps.filter(app => allowed.includes(app.id));
    }

    // Search filter
    const q = search.trim();
    const filtered = q
      ? allApps.filter(app =>
          multiWordMatchAny(q, app.label, app.description, ...(app.keywords || []))
        )
      : allApps;

    // Sort: enabled first, hidden last
    const sorted = filtered.sort((a, b) => {
      const aDisabled = isAppDisabled(a) ? 1 : 0;
      const bDisabled = isAppDisabled(b) ? 1 : 0;
      return aDisabled - bDisabled;
    });

    // Group by section meta
    const groups: Record<SectionKey, NavItem[]> = { core: [], operations: [], premium: [] };
    for (const app of sorted) {
      const meta = getAppMeta(app.id);
      if (!meta) continue;
      groups[meta.section].push(app);
    }
    return { groups, total: sorted.length };
  }, [search, restrictedRole, hiddenApps]);

  const totalResults = groupedApps.total;

  const handleStartTour = () => { update({ welcome_modal_shown: true }); setTourActive(true); };
  const handleSkipWelcome = () => { update({ welcome_modal_shown: true, full_tour_skipped: true }); };
  const handleTourComplete = () => {
    setTourActive(false);
    update({ full_tour_completed: true, modules_toured: appSections.flatMap(s => s.items.map(i => i.id)) });
  };
  const handleTourSkip = () => { setTourActive(false); update({ full_tour_skipped: true }); };

  return (
    <div style={{ minHeight: "100%", background: "#F7F8FA", margin: "-1.25rem", marginBottom: 0, fontFamily: "Cairo, sans-serif" }} className="lg:-m-8 lg:mb-0" dir="rtl">

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px 120px" }}>
        {/* Hero */}
        <AppsHero />

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
            {/* Three hierarchical sections per AMWALI brand spec */}
            {(["core", "operations", "premium"] as SectionKey[]).map((sec) => {
              const apps = groupedApps.groups[sec];
              if (apps.length === 0) return null;
              return (
                <AppSectionBlock key={sec} section={sec} isPremium={sec === "premium"}>
                  {apps.map((app, idx) => {
                    const meta = getAppMeta(app.id)!;
                    return (
                      <AppCardV2
                        key={app.id}
                        app={app}
                        meta={meta}
                        index={idx}
                        onNavigate={navigate}
                        disabled={isAppDisabled(app)}
                        isPremiumLocked={isAppPremiumLocked(app)}
                        onPremiumClick={() => setUpgradeModal({ open: true, module: app.label, tier: "pro" })}
                      />
                    );
                  })}
                </AppSectionBlock>
              );
            })}

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

      {/* Floating AI Accountant access bar */}
      <FloatingAIBar />
    </div>
  );
};

export default AppsLauncher;
