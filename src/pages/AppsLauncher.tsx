import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calculator, ShoppingCart, Users, Package, ShoppingBag, DollarSign,
  BarChart3, Store, Settings, FileSpreadsheet, ArrowLeftRight, Landmark,
  Search, HelpCircle, RotateCcw, BookOpen, Headphones, Puzzle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOnboarding } from "@/hooks/useOnboarding";
import WelcomeModal from "@/components/onboarding/WelcomeModal";
import SpotlightTour from "@/components/onboarding/SpotlightTour";
import TourCompletionModal from "@/components/onboarding/TourCompletionModal";
import { motion } from "framer-motion";
import { Input } from "@/components/ui/input";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

interface AppModule {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  path: string;
  isNew?: boolean;
  keywords?: string[];
}

const appModules: AppModule[] = [
  { id: "ai-accountant", label: "المحاسب الذكي", description: "محاسبة تحليلية بالذكاء الاصطناعي", icon: Calculator, color: "text-primary", bgColor: "bg-primary/10", path: "/", keywords: ["محاسب", "ذكاء", "قيد"] },
  { id: "sales", label: "المبيعات", description: "فواتير، نقاط بيع، وعملاء", icon: ShoppingCart, color: "text-orange-500", bgColor: "bg-orange-500/10", path: "/invoices", keywords: ["فواتير", "بيع", "عملاء", "فات"] },
  { id: "hr", label: "الموارد البشرية", description: "موظفون، حضور، ورواتب", icon: Users, color: "text-violet-500", bgColor: "bg-violet-500/10", path: "/employees", keywords: ["موظف", "حضور", "رواتب", "موارد"] },
  { id: "inventory", label: "المخزون", description: "منتجات، حركات، وتقييم", icon: Package, color: "text-teal-500", bgColor: "bg-teal-500/10", path: "/inventory", keywords: ["مخزون", "منتج", "بضاعة"] },
  { id: "purchases", label: "المشتريات", description: "موردين وفواتير مشتريات", icon: ShoppingBag, color: "text-sky-500", bgColor: "bg-sky-500/10", path: "/bills", keywords: ["مشتريات", "مورد", "فات"] },
  { id: "finance", label: "المالية", description: "حسابات، قيود، وميزان مراجعة", icon: DollarSign, color: "text-emerald-500", bgColor: "bg-emerald-500/10", path: "/accounts", keywords: ["مالية", "حسابات", "قيود", "ميزان"] },
  { id: "reports", label: "التقارير", description: "تقارير مالية وتحليلات", icon: BarChart3, color: "text-rose-500", bgColor: "bg-rose-500/10", path: "/reports", keywords: ["تقارير", "تقر", "تحليل"] },
  { id: "ecommerce", label: "المتجر الإلكتروني", description: "بنك الطلبيات ومتابعة الطلبات", icon: Store, color: "text-amber-500", bgColor: "bg-amber-500/10", path: "/orders", keywords: ["متجر", "طلبات", "أونلاين"] },
  { id: "import-data", label: "استيراد بيانات خارجية", description: "استيراد الأرصدة الافتتاحية من Excel", icon: FileSpreadsheet, color: "text-cyan-500", bgColor: "bg-cyan-500/10", path: "/opening-balances-import", keywords: ["استيراد", "اكسل", "أرصدة"] },
  { id: "currency", label: "إدارة العملات", description: "أسعار صرف، تحويلات، وعملات أجنبية", icon: ArrowLeftRight, color: "text-indigo-500", bgColor: "bg-indigo-500/10", path: "/currency-management", isNew: true, keywords: ["عملات", "صرف", "دولار"] },
  { id: "fixed-assets", label: "الأصول الثابتة", description: "سجل الأصول، الاستهلاك، والصيانة", icon: Landmark, color: "text-stone-600", bgColor: "bg-stone-500/10", path: "/fixed-assets", isNew: true, keywords: ["أصول", "استهلاك", "ثابتة"] },
  { id: "customization", label: "التخصيص والدعم الفني", description: "قوالب قطاعات، طلبات تخصيص، وتذاكر دعم فني", icon: Puzzle, color: "text-pink-500", bgColor: "bg-pink-500/10", path: "/customization", isNew: true, keywords: ["تخصيص", "دعم", "تذاكر", "قطاع"] },
  { id: "settings", label: "الإعدادات", description: "إعدادات النظام والملف الشخصي", icon: Settings, color: "text-muted-foreground", bgColor: "bg-muted", path: "/settings", keywords: ["إعدادات", "ملف", "شخصي"] },
];

const AppsLauncher = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { shouldShowWelcome, shouldShowTour, update, loading: onboardingLoading } = useOnboarding();
  const [tourActive, setTourActive] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [search, setSearch] = useState("");

  const displayName = user?.user_metadata?.full_name || user?.email?.split("@")[0] || "المستخدم";

  const filteredModules = useMemo(() => {
    if (!search.trim()) return appModules;
    const q = search.trim();
    return appModules.filter(
      (app) =>
        app.label.includes(q) ||
        app.description.includes(q) ||
        app.keywords?.some((k) => k.includes(q))
    );
  }, [search]);

  const handleStartTour = () => {
    update({ welcome_modal_shown: true });
    setTourActive(true);
  };

  const handleSkipWelcome = () => {
    update({ welcome_modal_shown: true, full_tour_skipped: true });
  };

  const handleTourComplete = () => {
    setTourActive(false);
    update({
      full_tour_completed: true,
      modules_toured: appModules.map((m) => m.id),
    });
    setShowCompletion(true);
  };

  const handleTourSkip = () => {
    setTourActive(false);
    update({ full_tour_skipped: true });
  };

  const handleRestartTour = () => {
    update({
      welcome_modal_shown: true,
      full_tour_completed: false,
      full_tour_skipped: false,
      modules_toured: [],
    });
    setTourActive(true);
  };

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-primary/10">
              <Calculator className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">عبدالله AI</h1>
              <p className="text-xs text-muted-foreground">مرحباً {displayName} 👋</p>
            </div>
          </div>

          {/* Help Button */}
          <Popover>
            <PopoverTrigger asChild>
              <button className="p-2 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground">
                <HelpCircle className="h-5 w-5" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-2" dir="rtl">
              <button
                onClick={handleRestartTour}
                className="flex items-center gap-2 w-full p-2.5 rounded-lg hover:bg-muted transition-colors text-sm text-foreground"
              >
                <RotateCcw className="h-4 w-4 text-primary" />
                جولة تعريفية سريعة
              </button>
              <button className="flex items-center gap-2 w-full p-2.5 rounded-lg hover:bg-muted transition-colors text-sm text-foreground">
                <BookOpen className="h-4 w-4 text-blue-500" />
                دليل الاستخدام
              </button>
              <button className="flex items-center gap-2 w-full p-2.5 rounded-lg hover:bg-muted transition-colors text-sm text-foreground">
                <Headphones className="h-4 w-4 text-violet-500" />
                تواصل مع الدعم
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Title + Search */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-foreground" style={{ fontFamily: "serif" }}>
              التطبيقات
            </h2>
            <p className="text-sm text-muted-foreground">كل احتياج، تطبيق واحد.</p>
          </div>
          <div className="relative w-full sm:w-72">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث عن تطبيق..."
              className="pr-9 rounded-xl bg-muted/50 border-border/50 h-10"
            />
          </div>
        </div>

        {/* Apps Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredModules.map((app, i) => (
            <motion.button
              key={app.id}
              id={`app-${app.id}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, duration: 0.3 }}
              onClick={() => navigate(app.path)}
              className="relative flex items-center gap-4 p-5 rounded-2xl border border-border/60 bg-card hover:shadow-lg hover:border-border hover:-translate-y-0.5 transition-all duration-200 text-right group"
            >



              <div className={`p-3 rounded-xl ${app.bgColor} transition-transform group-hover:scale-110`}>
                <app.icon className={`h-6 w-6 ${app.color}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">{app.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{app.description}</p>
              </div>
            </motion.button>
          ))}
        </div>

        {filteredModules.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-8 w-8 mx-auto mb-3 opacity-50" />
            <p className="text-sm">لا توجد نتائج لـ "{search}"</p>
          </div>
        )}
      </div>

      {/* Onboarding */}
      {!onboardingLoading && (
        <>
          <WelcomeModal
            open={shouldShowWelcome}
            onStartTour={handleStartTour}
            onSkip={handleSkipWelcome}
          />
          <SpotlightTour
            active={tourActive}
            onComplete={handleTourComplete}
            onSkip={handleTourSkip}
          />
          <TourCompletionModal
            open={showCompletion}
            onClose={() => setShowCompletion(false)}
          />
        </>
      )}
    </div>
  );
};

export default AppsLauncher;
