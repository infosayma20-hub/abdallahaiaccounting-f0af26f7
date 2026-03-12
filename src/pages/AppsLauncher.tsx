import React, { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Search, ChevronDown, ArrowLeft } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import WelcomeModal from "@/components/onboarding/WelcomeModal";
import SpotlightTour from "@/components/onboarding/SpotlightTour";
import TourCompletionModal from "@/components/onboarding/TourCompletionModal";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import HelpGuideModal from "@/components/HelpGuideModal";
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
      className={`relative rounded-2xl border overflow-hidden transition-all duration-200 ${
        isExpanded ? "border-accent/40 bg-card shadow-lg" : "border-border/60 bg-card hover:shadow-lg hover:border-border hover:-translate-y-0.5"
      }`}
      style={{ transform: clicking ? "scale(0.97)" : undefined, transition: "transform 0.15s ease" }}
    >
      {ripple && (
        <span className="absolute rounded-full pointer-events-none" style={{
          left: ripple.x, top: ripple.y, transform: "translate(-50%, -50%)",
          background: "radial-gradient(circle, rgba(232,160,32,0.35), transparent 70%)",
          animation: "finixRippleExpand 0.5s ease-out forwards",
        }} />
      )}
      <button onClick={handleClick} className="w-full flex items-center gap-4 p-5 text-right group relative z-10">
        <div className={`p-3 rounded-xl ${app.bgColor} transition-transform group-hover:scale-110`}>
          <app.icon className={`h-6 w-6 ${app.color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-foreground">{app.label}</p>
            {app.isNew && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">جديد</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{app.description}</p>
        </div>
        {hasChildren && (
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
        )}
      </button>

      {isExpanded && hasChildren && (
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
  const { shouldShowWelcome, shouldShowTour, update, loading: onboardingLoading } = useOnboarding();
  const [tourActive, setTourActive] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedApp, setExpandedApp] = useState<string | null>(null);
  const [helpGuideOpen, setHelpGuideOpen] = useState(false);

  const filteredSections = useMemo(() => {
    const q = search.trim();
    if (!q) return appSections;
    return appSections
      .map(s => ({
        ...s,
        items: s.items.filter(app =>
          app.label.includes(q) || app.description.includes(q) || app.keywords?.some(k => k.includes(q))
          || getAllChildren(app).some(c => c.label.includes(q))
        ),
      }))
      .filter(s => s.items.length > 0);
  }, [search]);

  const totalResults = filteredSections.reduce((a, s) => a + s.items.length, 0);

  const handleStartTour = () => { update({ welcome_modal_shown: true }); setTourActive(true); };
  const handleSkipWelcome = () => { update({ welcome_modal_shown: true, full_tour_skipped: true }); };
  const handleTourComplete = () => {
    setTourActive(false);
    update({ full_tour_completed: true, modules_toured: appSections.flatMap(s => s.items.map(i => i.id)) });
    setShowCompletion(true);
  };
  const handleTourSkip = () => { setTourActive(false); update({ full_tour_skipped: true }); };

  let globalIndex = 0;

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
          {filteredSections.map((section) => (
            <React.Fragment key={section.sectionTitle || "top"}>
              {section.sectionTitle && (
                <div className="col-span-full">
                  <h3 className="text-xs font-bold text-muted-foreground/60 uppercase tracking-[0.12em] mt-4 mb-1 px-1">{section.sectionTitle}</h3>
                </div>
              )}
              {section.items.map((app) => {
                const idx = globalIndex++;
                return (
                  <AppCard
                    key={app.id}
                    app={app}
                    index={idx}
                    isExpanded={expandedApp === app.id}
                    onToggle={() => setExpandedApp(prev => prev === app.id ? null : app.id)}
                    onNavigate={navigate}
                  />
                );
              })}
            </React.Fragment>
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
          <SpotlightTour active={tourActive} onComplete={handleTourComplete} onSkip={handleTourSkip} />
          <TourCompletionModal open={showCompletion} onClose={() => setShowCompletion(false)} />
        </>
      )}
      <HelpGuideModal open={helpGuideOpen} onClose={() => setHelpGuideOpen(false)} />
    </div>
  );
};

export default AppsLauncher;
