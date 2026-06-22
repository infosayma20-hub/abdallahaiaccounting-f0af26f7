import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import { useCompanySettings } from "@/hooks/useCompanySettings";
import { useSubscription } from "@/hooks/useSubscription";
import { useSubscriptionGuard } from "@/hooks/useSubscriptionGuard";
import { useMyAppOverrides } from "@/hooks/useMyAppOverrides";
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

import CategoryPills, { type CategoryFilter } from "@/pages/Apps/components/CategoryPills";
import CommandPalette from "@/pages/Apps/components/CommandPalette";
import { useFavoriteApps } from "@/hooks/useFavoriteApps";
import { Star, Command, ChevronDown } from "lucide-react";

const appSections = getAppSections();

/* ── Module-level cache to prevent skeleton flicker on revisits ──
   Roles + employee-redirect decision are stable per user within a
   session. Re-fetching is fine (kept for freshness), but UI should
   not flash a skeleton when we already have a result. */
const rolesCache = new Map<string, { roles: string[]; employeeOnly: boolean }>();

/* ── Role-based app visibility ── */
const ROLE_ALLOWED_APPS: Record<string, string[]> = {
  accountant_senior: ["dashboard", "ai-accountant", "finance", "sales", "purchases", "inventory", "fixed-assets", "reports", "tax"],
  accountant_sales: ["dashboard", "ai-accountant", "finance", "sales", "reports"],
  accountant_purchases: ["dashboard", "ai-accountant", "finance", "purchases", "inventory", "reports"],
  hr_manager: ["hr"],
};

/* AppCard component moved to src/pages/Apps/components/AppCardV2.tsx (Phase 1) */

const AppsLauncher = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { settings, loading: settingsLoading } = useCompanySettings();
  const { subscription, loading: subLoading } = useSubscription();
  const { isTrial, isSuperAdmin, loading: guardLoading } = useSubscriptionGuard();
  const { allow: allowOverrides, deny: denyOverrides } = useMyAppOverrides();
  const { shouldShowWelcome, shouldShowTour, update, loading: onboardingLoading, businessType } = useOnboarding();
  const [tourActive, setTourActive] = useState(false);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { favorites, isFavorite, toggleFavorite } = useFavoriteApps();
  const [favCollapsed, setFavCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem("amwali:apps:section:favorites:collapsed") === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("amwali:apps:section:favorites:collapsed", favCollapsed ? "1" : "0"); } catch {}
  }, [favCollapsed]);
  // expandedApp removed in Phase 1 — apps now navigate directly
  const cachedRoles = user?.id ? rolesCache.get(user.id) : undefined;
  const [userRoles, setUserRoles] = useState<string[]>(cachedRoles?.roles ?? []);
  const [rolesLoading, setRolesLoading] = useState(!cachedRoles);
  const [employeeOnlyRedirect, setEmployeeOnlyRedirect] = useState(cachedRoles?.employeeOnly ?? false);
  const [upgradeModal, setUpgradeModal] = useState<{ open: boolean; module: string; tier: string }>({ open: false, module: "", tier: "pro" });

  // Global Ctrl+K / ⌘K to open command palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Subscription is fully resolved only when both subscription + guard finished loading
  const subscriptionResolved = !subLoading && !guardLoading;

  // Fetch user roles for filtering (with cleanup to avoid setState on unmounted)
  useEffect(() => {
    if (!user) {
      setRolesLoading(false);
      return;
    }
    let cancelled = false;
    // Only show loading state on the first ever fetch for this user;
    // on revisits we already have cached roles, so render cards immediately
    // and refresh in the background to avoid a flicker.
    if (!rolesCache.has(user.id)) setRolesLoading(true);
    Promise.all([
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id),
      supabase
        .from("employees")
        .select("id, auth_user_id, user_id, is_active, is_terminated, is_manager, is_hr_manager, can_view_team, can_manage_schedule, can_manage_attendance")
        .eq("auth_user_id", user.id)
        .maybeSingle(),
    ]).then(([{ data }, { data: employee }]) => {
        if (cancelled) return;
        const roles: string[] = (data || []).map((r) => r.role as string);
        const hasEmployeeRecord = !!employee && employee.is_active && !employee.is_terminated;
        const hasAdminAccess = roles.some((role) => role === "admin" || role === "super_admin" || role === "hr_manager" || role.startsWith("accountant"));
        const hasPureSystemRole =
          roles.includes("super_admin") ||
          roles.includes("portal") ||
          roles.includes("store_tracker") ||
          roles.includes("worker") ||
          roles.includes("cashier");
        // sales_rep أولوية أعلى من سجل الموظف
        if (roles.includes("sales_rep") && !hasAdminAccess) {
          try {
            sessionStorage.removeItem(`workspace-choice:${user.id}`);
          } catch {}
          setEmployeeOnlyRedirect(false);
          navigate("/rep", { replace: true });
        } else if (hasEmployeeRecord && !hasAdminAccess && !hasPureSystemRole) {
          try {
            Object.keys(localStorage).forEach((key) => {
              if (key.startsWith("amwali-open-tabs") || key.includes("lastVisitedRoute")) localStorage.removeItem(key);
            });
            Object.keys(sessionStorage).forEach((key) => {
              if (key.includes("lastVisitedRoute")) sessionStorage.removeItem(key);
            });
          } catch {}
          console.info("[apps-route-guard] finalRedirect = /employee", {
            authUid: user.id,
            employeeId: employee.id,
            employeeAuthUserId: employee.auth_user_id,
            employeeOwnerUserId: employee.user_id,
            userRoles: roles,
            isManager: employee.is_manager,
            isHrManager: employee.is_hr_manager,
            canViewTeam: employee.can_view_team,
            canManageSchedule: employee.can_manage_schedule,
            canManageAttendance: employee.can_manage_attendance,
            finalRedirect: "/employee",
          });
          setEmployeeOnlyRedirect(true);
        } else {
          setEmployeeOnlyRedirect(false);
        }
        setUserRoles(roles);
        setRolesLoading(false);
        rolesCache.set(user.id, {
          roles,
          employeeOnly:
            hasEmployeeRecord && !hasAdminAccess && !hasPureSystemRole &&
            !(roles.includes("sales_rep") && !hasAdminAccess),
        });
      })
      .catch((err) => {
        // Never leave the launcher stuck on skeletons if the role/employee
        // queries fail (RLS rejection for brand-new trial users, network
        // hiccup, …). Fall back to empty roles so the cards render.
        console.warn("[apps] roles/employee fetch failed:", err);
        if (cancelled) return;
        setUserRoles([]);
        setEmployeeOnlyRedirect(false);
        setRolesLoading(false);
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  useEffect(() => {
    if (employeeOnlyRedirect) navigate("/employee", { replace: true });
  }, [employeeOnlyRedirect, navigate]);

  // ⚡ Fast-path: عرض البطاقات فور توفر الحد الأدنى (auth + roles + settings للـ hidden_apps).
  // باقي الـ hooks (subscription/guard/onboarding) تُحمَّل في الخلفية دون حجب الشبكة.
  // ⚡ الـ gate الفعلي: auth + roles فقط. settings تُحمَّل بالخلفية ولا
  // يجب أن تحجب البطاقات (كانت تعلّق الـ skeletons لمستخدم جديد ما عنده
  // صف في company_settings بعد).
  const isReady =
    !authLoading &&
    !rolesLoading;

  // Hidden apps from super admin
  const hiddenApps: string[] = useMemo(() => {
    return (settings as any)?.hidden_apps || [];
  }, [settings]);

  // Item is locked by super admin
  const isAppDisabled = (app: NavItem) => {
    if (denyOverrides.has(app.id)) return true;
    if (allowOverrides.has(app.id)) return false;
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

  /* All apps after role filter (used by palette + counts).
     ⚙️ ملاحظة: hidden_apps لم تعد تُخفي البطاقة — تُنقل لقسم Premium كـ "بانتظار التفعيل". */
  const allVisibleApps = useMemo(() => {
    let allApps = appSections.flatMap(s => s.items);
    // Per-user deny: hide entirely from launcher
    allApps = allApps.filter(app => !denyOverrides.has(app.id));
    if (restrictedRole && ROLE_ALLOWED_APPS[restrictedRole]) {
      const allowed = ROLE_ALLOWED_APPS[restrictedRole];
      // explicit allow override unlocks an app even if role would block it
      allApps = allApps.filter(app => allowed.includes(app.id) || allowOverrides.has(app.id));
    }
    return allApps;
  }, [restrictedRole, allowOverrides, denyOverrides]);

  /* Filter apps by role + search + category; group by section.
     التطبيقات المعطّلة (hidden_apps) تُعرض ضمن قسم Premium كبطاقات
     "بانتظار التفعيل من الإدارة"، وتُحذف من قسمها الأصلي. */
  const groupedApps = useMemo(() => {
    let allApps = [...allVisibleApps];

    // Search filter
    const q = search.trim();
    let filtered = q
      ? allApps.filter(app =>
          multiWordMatchAny(q, app.label, app.description, ...(app.keywords || []))
        )
      : allApps;

    // Category filter — section is calculated AFTER hidden_apps remap
    if (categoryFilter === "favorites") {
      filtered = filtered.filter(app => favorites.includes(app.id));
    } else if (categoryFilter !== "all") {
      filtered = filtered.filter(app => {
        const meta = getAppMeta(app.id);
        if (!meta) return false;
        const effectiveSection = isAppDisabled(app) ? "premium" : meta.section;
        return effectiveSection === categoryFilter;
      });
    }

    // Build favorites group separately (only when showing all/favorites)
    const showFavoritesGroup =
      (categoryFilter === "all" || categoryFilter === "favorites") &&
      favorites.length > 0 &&
      !q;
    const favoritesList = showFavoritesGroup
      ? filtered.filter(a => favorites.includes(a.id))
      : [];

    // Group by section — disabled apps move to "premium"
    const groups: Record<SectionKey, NavItem[]> = { core: [], operations: [], premium: [] };
    for (const app of filtered) {
      const meta = getAppMeta(app.id);
      if (!meta) continue;
      const targetSection: SectionKey = isAppDisabled(app) ? "premium" : meta.section;
      groups[targetSection].push(app);
    }

    // Sort: active first, pending-activation last (within each section)
    for (const sec of Object.keys(groups) as SectionKey[]) {
      groups[sec].sort((a, b) => {
        const aPending = isAppDisabled(a) ? 1 : 0;
        const bPending = isAppDisabled(b) ? 1 : 0;
        return aPending - bPending;
      });
    }

    return { groups, total: filtered.length, favoritesList, showFavoritesGroup };
  }, [search, allVisibleApps, hiddenApps, categoryFilter, favorites]);

  const totalResults = groupedApps.total;

  /* Pill counts — sections recomputed AFTER hidden_apps remap (disabled → premium) */
  const pillCounts = useMemo(() => {
    const q = search.trim();
    const base = q
      ? allVisibleApps.filter(a => multiWordMatchAny(q, a.label, a.description, ...(a.keywords || [])))
      : allVisibleApps;
    const effectiveSection = (a: NavItem) =>
      isAppDisabled(a) ? "premium" : getAppMeta(a.id)?.section;
    const counts: Record<CategoryFilter, number> = {
      all: base.length,
      favorites: base.filter(a => favorites.includes(a.id)).length,
      core: base.filter(a => effectiveSection(a) === "core").length,
      operations: base.filter(a => effectiveSection(a) === "operations").length,
      premium: base.filter(a => effectiveSection(a) === "premium").length,
    };
    return counts;
  }, [allVisibleApps, search, favorites, hiddenApps]);

  const handleStartTour = () => { update({ welcome_modal_shown: true }); setTourActive(true); };
  const handleSkipWelcome = () => { update({ welcome_modal_shown: true, full_tour_skipped: true }); };
  const handleTourComplete = () => {
    setTourActive(false);
    update({ full_tour_completed: true, modules_toured: appSections.flatMap(s => s.items.map(i => i.id)) });
  };
  const handleTourSkip = () => { setTourActive(false); update({ full_tour_skipped: true }); };

  if (employeeOnlyRedirect) {
    return (
      <div className="flex h-full min-h-[200px] w-full items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: "hsl(var(--accent))", borderRightColor: "hsl(var(--accent) / 0.3)" }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100%", background: "#F7F8FA", margin: "-1.25rem", marginBottom: 0, fontFamily: "Cairo, sans-serif" }} className="lg:-m-8 lg:mb-0" dir="rtl">

      <div className="amwali-apps-container" style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 24px 120px" }}>
        <style>{`
          @media (max-width: 767px) {
            .amwali-apps-container { padding: 14px 12px 100px !important; }
          }
        `}</style>
        {/* Compact header */}
        <div className="flex items-baseline justify-between mb-4 px-1">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "#0D1B2E" }}>التطبيقات</h1>
            <p className="text-xs text-muted-foreground mt-0.5">اختر تطبيقاً للبدء</p>
          </div>
        </div>

        {/* Apps Grid — gated on unified loading state to prevent flicker */}
        {!isReady ? (
          <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
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
            {/* ⭐ Favorites group (only when "all" + has favorites + no search) */}
            {groupedApps.showFavoritesGroup && categoryFilter === "all" && groupedApps.favoritesList.length > 0 && (
              <div className="mb-6">
                <button
                  type="button"
                  onClick={() => setFavCollapsed((c) => !c)}
                  aria-expanded={!favCollapsed}
                  className="flex items-center gap-2 mb-3 px-1 py-1 w-full bg-transparent border-none cursor-pointer rounded-lg hover:bg-slate-50 transition-colors"
                >
                  <div
                    className="flex items-center justify-center"
                    style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(245,158,11,0.12)" }}
                  >
                    <Star size={15} style={{ color: "#f59e0b", fill: "#f59e0b" }} />
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 700, color: "#0D1B2E", margin: 0 }}>
                    المفضلة
                  </h3>
                  <span style={{ fontSize: 11, color: "#94a3b8" }}>({groupedApps.favoritesList.length})</span>
                  <ChevronDown
                    size={16}
                    style={{
                      color: "#94a3b8",
                      marginInlineStart: "auto",
                      transition: "transform 0.2s",
                      transform: favCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                    }}
                  />
                </button>
                {!favCollapsed && <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
                  {groupedApps.favoritesList.map((app, idx) => {
                    const meta = getAppMeta(app.id)!;
                    const pendingActivation = isAppDisabled(app);
                    return (
                      <AppCardV2
                        key={`fav-${app.id}`}
                        app={app}
                        meta={meta}
                        index={idx}
                        onNavigate={navigate}
                        disabled={false}
                        isPremiumLocked={pendingActivation || isAppPremiumLocked(app)}
                        pendingActivation={pendingActivation}
                        onPremiumClick={() => setUpgradeModal({ open: true, module: app.label, tier: pendingActivation ? "activation" : "pro" })}
                        isFavorite={true}
                        onToggleFavorite={() => toggleFavorite(app.id)}
                      />
                    );
                  })}
                </div>}
              </div>
            )}

            {/* Hierarchical sections — hide when filtering by favorites (already shown) */}
            {categoryFilter !== "favorites" && (["core", "operations", "premium"] as SectionKey[]).map((sec) => {
              const apps = groupedApps.groups[sec];
              if (apps.length === 0) return null;
              return (
                <AppSectionBlock key={sec} section={sec} isPremium={sec === "premium"}>
                  {apps.map((app, idx) => {
                    const meta = getAppMeta(app.id)!;
                    const pendingActivation = isAppDisabled(app);
                    return (
                      <AppCardV2
                        key={app.id}
                        app={app}
                        meta={meta}
                        index={idx}
                        onNavigate={navigate}
                        disabled={false}
                        isPremiumLocked={pendingActivation || isAppPremiumLocked(app)}
                        pendingActivation={pendingActivation}
                        onPremiumClick={() => setUpgradeModal({ open: true, module: app.label, tier: pendingActivation ? "activation" : "pro" })}
                        isFavorite={isFavorite(app.id)}
                        onToggleFavorite={() => toggleFavorite(app.id)}
                      />
                    );
                  })}
                </AppSectionBlock>
              );
            })}

            {/* Favorites-only filter view (flat grid) */}
            {categoryFilter === "favorites" && groupedApps.favoritesList.length === 0 && favorites.length === 0 && (
              <div className="text-center py-16">
                <Star size={32} className="mx-auto mb-3" style={{ color: "#cbd5e1" }} />
                <p style={{ fontSize: 14, color: "#64748b", marginBottom: 4 }}>لا توجد تطبيقات مفضلة بعد</p>
                <p style={{ fontSize: 12, color: "#94a3b8" }}>اضغط على ⭐ في زاوية أي تطبيق لإضافته للمفضلة</p>
              </div>
            )}

            {totalResults === 0 && categoryFilter !== "favorites" && (
              <div className="text-center py-16">
                <Search className="h-8 w-8 mx-auto mb-3" style={{ color: "#94a3b8", opacity: 0.4 }} />
                <p style={{ fontSize: 14, color: "#64748b" }}>لا توجد نتائج لـ "{search}"</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Command Palette (Ctrl+K) */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        apps={allVisibleApps}
        favorites={favorites}
      />

      <UpgradePromptModal
        open={upgradeModal.open}
        onOpenChange={(v) => setUpgradeModal(prev => ({ ...prev, open: v }))}
        moduleName={upgradeModal.module}
        requiredTier={upgradeModal.tier}
      />

      {/* الجولة التعريفية مُعطّلة بناءً على طلب المستخدم */}

    </div>
  );
};

export default AppsLauncher;
