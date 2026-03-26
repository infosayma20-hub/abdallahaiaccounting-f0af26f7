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

/* ── App Card ── */
const AppCard = ({
  app, index, isExpanded, onToggle, onNavigate, disabled,
}: {
  app: NavItem; index: number; isExpanded: boolean;
  onToggle: () => void; onNavigate: (path: string) => void; disabled?: boolean;
}) => {
  const [clicking, setClicking] = useState(false);
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null);
  const hasChildren = !app.isDirect && app.groups && app.groups.length > 0;

  const handleClick = (e: React.MouseEvent) => {
    if (disabled) return;
    if (hasChildren) { onToggle(); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setRipple({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    setClicking(true);
    setTimeout(() => { onNavigate(app.path); setClicking(false); setRipple(null); }, 250);
  };

  return (
    <motion.div
      id={`app-${app.id}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3 }}
      className={`relative rounded-2xl border overflow-hidden transition-all duration-200 ${
        disabled
          ? "border-border/30 bg-muted/40 opacity-50 grayscale cursor-not-allowed"
          : isExpanded ? "border-accent/40 bg-card shadow-lg" : "border-border/60 bg-card hover:shadow-lg hover:border-border hover:-translate-y-0.5"
      }`}
      style={{ transform: clicking ? "scale(0.97)" : undefined, transition: "transform 0.15s ease" }}
    >
      {ripple && !disabled && (
        <span className="absolute rounded-full pointer-events-none" style={{
          left: ripple.x, top: ripple.y, transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(232,160,32,0.35), transparent 70%)",
          animation: "finixRippleExpand 0.5s ease-out forwards",
        }} />
      )}
      <button onClick={handleClick} className={`w-full flex items-center gap-4 p-5 text-right group relative z-10 ${disabled ? "cursor-not-allowed" : ""}`}>
        <div className={`p-3 rounded-xl ${app.bgColor} transition-transform ${disabled ? "" : "group-hover:scale-110"}`}>
          <app.icon className={`h-6 w-6 ${app.color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={`text-sm font-bold ${disabled ? "text-muted-foreground" : "text-foreground"}`}>{app.label}</p>
            {disabled && <Lock className="h-3 w-3 text-muted-foreground/60" />}
            {!disabled && app.isNew && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">جديد</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
            {disabled ? "غير مفعّل — يمكن تفعيله من الإعدادات" : app.description}
          </p>
        </div>
        {!disabled && hasChildren && (
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
        )}
      </button>

      {!disabled && isExpanded && hasChildren && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="border-t border-border/40 px-5 pb-4 pt-2 space-y-2">
          {app.groups!.map((group) => (
            <div key={group.groupLabel || "default"}>
              {group.groupLabel && (
                <p className="text-[10px] font-bold text-muted-foreground/60 px-3 pt-1 pb-0.5">{group.groupLabel}</p>
              )}
              {group.children.map((child) => (
                <button key={child.path + child.label} onClick={() => onNavigate(child.path)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] text-foreground hover:bg-accent/10 hover:text-accent transition-all text-right">
                  <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
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

  // During trial, all apps are enabled. After subscription, restrict based on settings.
  const isTrial = subscription?.isTrial ?? true;

  // Determine which settings are enabled based on business type and company settings
  const enabledSettings = useMemo(() => {
    const s: Record<string, boolean> = {
      has_pos: !!settings.has_pos,
      has_employees: !!settings.has_employees,
      has_inventory: ["تجارة", "مطعم", "متجر إلكتروني"].includes(settings.business_type || ""),
      has_contractor: settings.business_type === "مقاولات",
      has_ecommerce: settings.business_type === "متجر إلكتروني",
      has_travel: settings.business_type === "سياحة",
      has_workshops: ["ورش ومناجر", "مقاولات"].includes(settings.business_type || ""),
      has_tasks: false,
    };
    return s;
  }, [settings]);

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
    // Sort: enabled first, hidden apps last
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
      
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Title + Search */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Tajawal, sans-serif" }}>التطبيقات</h2>
            <p className="text-sm text-muted-foreground">كل احتياج، تطبيق واحد.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن تطبيق..." className="pr-9 rounded-xl bg-muted/50 border-border/50 h-10" />
          </div>
        </div>

        {/* Apps Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {allFilteredApps.map((app, idx) => (
            <AppCard
              key={app.id}
              app={app}
              index={idx}
              isExpanded={expandedApp === app.id}
              onToggle={() => setExpandedApp(prev => prev === app.id ? null : app.id)}
              onNavigate={navigate}
              disabled={isAppDisabled(app)}
            />
          ))}
        </div>

        {totalResults === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-3 opacity-50" />
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
