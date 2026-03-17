import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronDown, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import WelcomeModal from "@/components/onboarding/WelcomeModal";
import SpotlightTour from "@/components/onboarding/SpotlightTour";
import GooglePasswordSetupModal from "@/components/GooglePasswordSetupModal";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";

import { getAppSections, getAllChildren, type NavItem } from "@/config/navigationConfig";

const appSections = getAppSections();

/* ── App Card ── */
const AppCard = ({
  app, index, isExpanded, onToggle, onNavigate,
}: {
  app: NavItem; index: number; isExpanded: boolean;
  onToggle: () => void; onNavigate: (path: string) => void;
}) => {
  const [clicking, setClicking] = useState(false);
  const [ripple, setRipple] = useState<{ x: number; y: number } | null>(null);
  const hasChildren = !app.isDirect && app.groups && app.groups.length > 0;

  const handleClick = (e: React.MouseEvent) => {
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
      className={`group relative rounded-2xl overflow-hidden transition-all duration-200 ${
        isExpanded
          ? "shadow-lg"
          : "hover:shadow-lg hover:-translate-y-0.5"
      }`}
      style={{
        background: "#FFFFFF",
        border: isExpanded ? "1px solid rgba(201,168,76,0.4)" : "1px solid rgba(27,58,92,0.08)",
        transform: clicking ? "scale(0.97)" : undefined,
        transition: "transform 0.15s ease, border-color 0.2s, box-shadow 0.2s",
      }}
      onMouseEnter={(e) => { if (!isExpanded) e.currentTarget.style.borderColor = "rgba(201,168,76,0.4)"; }}
      onMouseLeave={(e) => { if (!isExpanded) e.currentTarget.style.borderColor = "rgba(27,58,92,0.08)"; }}
    >
      {ripple && (
        <span className="absolute rounded-full pointer-events-none" style={{
          left: ripple.x, top: ripple.y, transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(201,168,76,0.25), transparent 70%)",
          animation: "finixRippleExpand 0.5s ease-out forwards",
        }} />
      )}
      <button onClick={handleClick} className="w-full flex items-center gap-4 p-5 text-right relative z-10">
        <div
          className="p-3 rounded-xl transition-all duration-200"
          style={{
            background: "rgba(27,58,92,0.08)",
          }}
        >
          <app.icon className="h-6 w-6" style={{ color: "#1B3A5C" }} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold" style={{ color: "#1B3A5C" }}>{app.label}</p>
            {app.isNew && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(201,168,76,0.15)", color: "#C9A84C" }}>جديد</span>}
          </div>
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "rgba(27,58,92,0.55)" }}>{app.description}</p>
        </div>
        {hasChildren && (
          <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} style={{ color: "rgba(27,58,92,0.4)" }} />
        )}
      </button>

      {isExpanded && hasChildren && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="px-5 pb-4 pt-2 space-y-2" style={{ borderTop: "1px solid rgba(27,58,92,0.06)" }}>
          {app.groups!.map((group) => (
            <div key={group.groupLabel || "default"}>
              {group.groupLabel && (
                <p className="text-[10px] font-bold px-3 pt-1 pb-0.5" style={{ color: "rgba(27,58,92,0.35)" }}>{group.groupLabel}</p>
              )}
              {group.children.map((child) => (
                <button key={child.path + child.label} onClick={() => onNavigate(child.path)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] transition-all text-right"
                  style={{ color: "#1B3A5C" }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(201,168,76,0.08)"; e.currentTarget.style.color = "#C9A84C"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#1B3A5C"; }}
                >
                  <ArrowLeft className="h-3.5 w-3.5" style={{ color: "rgba(27,58,92,0.4)" }} />
                  <span>{child.label}</span>
                </button>
              ))}
            </div>
          ))}
        </motion.div>
      )}

      {/* Hover: icon becomes gold on navy */}
      <style>{`
        #app-${app.id}:hover .p-3 { background: #1B3A5C !important; }
        #app-${app.id}:hover .p-3 .h-6 { color: #C9A84C !important; }
      `}</style>
    </motion.div>
  );
};

/** Detects Google-only users and shows password setup modal */
const GooglePasswordPrompt = () => {
  const { user } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!user) return;
    // Check if user signed up with Google only (no email/password identity)
    const identities = user.identities || [];
    const hasGoogle = identities.some(i => i.provider === "google");
    const hasEmail = identities.some(i => i.provider === "email");
    const alreadyDismissed = localStorage.getItem(`pwd_setup_dismissed_${user.id}`);
    if (hasGoogle && !hasEmail && !alreadyDismissed) {
      setShow(true);
    }
  }, [user]);

  const handleDone = () => {
    if (user) localStorage.setItem(`pwd_setup_dismissed_${user.id}`, "true");
    setShow(false);
  };

  return (
    <GooglePasswordSetupModal
      open={show}
      onComplete={handleDone}
      onSkip={handleDone}
    />
  );
};

const AppsLauncher = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { shouldShowWelcome, shouldShowTour, update, loading: onboardingLoading, businessType } = useOnboarding();
  const [tourActive, setTourActive] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

  const allFilteredApps = useMemo(() => {
    const allApps = appSections.flatMap(s => s.items);
    const q = search.trim();
    if (!q) return allApps;
    return allApps.filter(app =>
      app.label.includes(q) || app.description.includes(q) || app.keywords?.some(k => k.includes(q))
      || getAllChildren(app).some(c => c.label.includes(q))
    );
  }, [search]);

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

      {/* Google Password Setup Modal */}
      <GooglePasswordPrompt />

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
