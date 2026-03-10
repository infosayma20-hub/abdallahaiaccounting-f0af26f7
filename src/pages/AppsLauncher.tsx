import { useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Calculator, ShoppingCart, Users, Package, ShoppingBag, DollarSign,
  BarChart3, Store, Settings, FileSpreadsheet, ArrowLeftRight, Landmark,
  Search, HelpCircle, RotateCcw, BookOpen, Headphones, Puzzle, ChevronDown, ArrowLeft,
  Monitor, Building2,
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
import HelpGuideModal from "@/components/HelpGuideModal";

interface SubItem {
  label: string;
  path: string;
}

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
  children?: SubItem[];
}

const appModules: AppModule[] = [
  // Row 1: Core
  {
    id: "finance", label: "المالية", description: "حسابات، قيود، وميزان مراجعة", icon: DollarSign, color: "text-emerald-500", bgColor: "bg-emerald-500/10", path: "/accounts",
    keywords: ["مالية", "حسابات", "قيود", "ميزان"],
    children: [
      { label: "شجرة الحسابات", path: "/accounts" },
      { label: "دفتر اليومية", path: "/transactions" },
      { label: "ميزان المراجعة", path: "/trial-balance" },
      { label: "الشيكات", path: "/cheques" },
    ],
  },
  {
    id: "dashboard", label: "لوحة المعلومات", description: "ملخص مالي شامل وتحليلات الأداء", icon: BarChart3, color: "text-primary", bgColor: "bg-primary/10", path: "/dashboard",
    keywords: ["لوحة", "معلومات", "ملخص", "داشبورد"],
  },
  {
    id: "ai-accountant", label: "المحاسب الذكي", description: "محاسبة تحليلية بالذكاء الاصطناعي", icon: Calculator, color: "text-primary", bgColor: "bg-primary/10", path: "/smart-accountant",
    keywords: ["محاسب", "ذكاء", "قيد"],
  },
  {
    id: "reports", label: "التقارير", description: "أرباح وخسائر، ميزانية عمومية، وتحليلات مالية", icon: BarChart3, color: "text-rose-500", bgColor: "bg-rose-500/10", path: "/reports",
    keywords: ["تقارير", "تقر", "تحليل"],
    children: [
      { label: "مركز التقارير", path: "/reports" },
      { label: "قائمة الدخل", path: "/profit-loss" },
      { label: "المركز المالي", path: "/balance-sheet" },
      { label: "ميزان المراجعة", path: "/trial-balance" },
    ],
  },
  // Row 2: Sales cycle
  {
    id: "sales", label: "المبيعات", description: "فواتير، نقاط بيع، وعملاء", icon: ShoppingCart, color: "text-orange-500", bgColor: "bg-orange-500/10", path: "/invoices",
    keywords: ["فواتير", "بيع", "عملاء", "فات"],
    children: [
      { label: "العملاء", path: "/contacts?type=customer" },
      { label: "الفواتير", path: "/invoices" },
      { label: "سندات القبض", path: "/receipts" },
      { label: "الطلبيات", path: "/orders" },
      { label: "المندوبين", path: "/sales-reps" },
    ],
  },
  {
    id: "purchases", label: "المشتريات", description: "موردين، فواتير مشتريات، ونقطة المشتريات", icon: ShoppingBag, color: "text-sky-500", bgColor: "bg-sky-500/10", path: "/bills",
    keywords: ["مشتريات", "مورد", "فات", "استلام"],
    children: [
      { label: "نقطة المشتريات", path: "/purchase-point" },
      { label: "الموردين", path: "/contacts?type=supplier" },
      { label: "فواتير مشتريات", path: "/bills" },
      { label: "سندات الصرف", path: "/payments" },
    ],
  },
  {
    id: "pos", label: "نقطة البيع", description: "نظام POS متكامل للمبيعات المباشرة", icon: Monitor, color: "text-emerald-400", bgColor: "bg-emerald-500/10", path: "/pos", isNew: true,
    keywords: ["نقطة", "بيع", "كاشير", "pos", "طاولات", "مطعم"],
    children: [
      { label: "نقطة البيع", path: "/pos" },
      { label: "خريطة الطاولات", path: "/pos/floor-plan" },
      { label: "إدارة الإضافات", path: "/pos/modifiers" },
      { label: "تقارير نقطة البيع", path: "/pos-reports" },
      { label: "إدارة مستخدمي POS", path: "/pos-users" },
    ],
  },
  // Row 3: Operations
  {
    id: "inventory", label: "المخزون", description: "منتجات، حركات، وتقييم", icon: Package, color: "text-teal-500", bgColor: "bg-teal-500/10", path: "/inventory",
    keywords: ["مخزون", "منتج", "بضاعة"],
    children: [
      { label: "المنتجات", path: "/inventory" },
      { label: "حركات المخزون", path: "/inventory-movements" },
      { label: "تقييم المخزون", path: "/inventory-valuation" },
    ],
  },
  {
    id: "hr", label: "الموارد البشرية", description: "موظفون، حضور، ورواتب", icon: Users, color: "text-violet-500", bgColor: "bg-violet-500/10", path: "/employees",
    keywords: ["موظف", "حضور", "رواتب", "موارد"],
    children: [
      { label: "الموظفون", path: "/employees" },
      { label: "لوحة الحضور (HR)", path: "/hr-attendance" },
      { label: "بصمتي", path: "/my-attendance" },
    ],
  },
  {
    id: "currency", label: "إدارة العملات", description: "أسعار صرف، تحويلات، وعملات أجنبية", icon: ArrowLeftRight, color: "text-indigo-500", bgColor: "bg-indigo-500/10", path: "/currency-management", isNew: true,
    keywords: ["عملات", "صرف", "دولار"],
  },
  // Row 4
  {
    id: "fixed-assets", label: "الأصول الثابتة", description: "سجل الأصول، الاستهلاك، والصيانة", icon: Landmark, color: "text-stone-600", bgColor: "bg-stone-500/10", path: "/fixed-assets", isNew: true,
    keywords: ["أصول", "استهلاك", "ثابتة"],
  },
  {
    id: "ecommerce", label: "إدارة المتاجر الإلكترونية", description: "إدارة مالية للمتاجر والصفحات الإلكترونية", icon: Store, color: "text-amber-500", bgColor: "bg-amber-500/10", path: "/orders",
    keywords: ["متجر", "طلبات", "أونلاين", "إلكتروني", "صفحات"],
  },
  {
    id: "contractor", label: "محاسب المشاريع والمقاولات", description: "إدارة مشاريع المقاولات والحركات المالية", icon: Building2, color: "text-amber-600", bgColor: "bg-amber-500/10", path: "/contractor", isNew: true,
    keywords: ["مقاولات", "مشاريع", "مقاول", "بناء", "محاسب"],
  },
  // Row 5: Utilities
  {
    id: "subscription", label: "الاشتراكات", description: "إدارة خطتك والفواتير والمدفوعات", icon: Settings, color: "text-teal-500", bgColor: "bg-teal-500/10", path: "/subscription",
    keywords: ["اشتراك", "خطة", "فاتورة", "دفع"],
  },
  {
    id: "import-data", label: "استيراد بيانات خارجية", description: "استيراد الأرصدة الافتتاحية من Excel", icon: FileSpreadsheet, color: "text-cyan-500", bgColor: "bg-cyan-500/10", path: "/opening-balances-import",
    keywords: ["استيراد", "اكسل", "أرصدة"],
  },
  {
    id: "settings", label: "الإعدادات", description: "إعدادات النظام والملف الشخصي", icon: Settings, color: "text-muted-foreground", bgColor: "bg-muted", path: "/settings",
    keywords: ["إعدادات", "ملف", "شخصي"],
  },
  {
    id: "customization", label: "التخصيص والدعم الفني", description: "قوالب قطاعات، طلبات تخصيص، وتذاكر دعم فني", icon: Puzzle, color: "text-pink-500", bgColor: "bg-pink-500/10", path: "/customization", isNew: true,
    keywords: ["تخصيص", "دعم", "تذاكر", "قطاع"],
    children: [
      { label: "التخصيص", path: "/customization" },
      { label: "قوالب القطاعات", path: "/customization/templates" },
      { label: "طلب تخصيص", path: "/customization/request" },
      { label: "تذاكر الدعم", path: "/support/tickets" },
    ],
  },
];

const AppsLauncher = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { shouldShowWelcome, shouldShowTour, update, loading: onboardingLoading } = useOnboarding();
  const [tourActive, setTourActive] = useState(false);
  const [showCompletion, setShowCompletion] = useState(false);
  const [search, setSearch] = useState("");
  const [expandedApp, setExpandedApp] = useState<string | null>(null);

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

  const [helpGuideOpen, setHelpGuideOpen] = useState(false);

  return (
    <div className="min-h-full bg-background" dir="rtl">
      {/* Content */}
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Title + Search */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <div>
            <h2 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Tajawal, sans-serif" }}>
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
          {filteredModules.map((app, i) => {
            const hasChildren = app.children && app.children.length > 0;
            const isExpanded = expandedApp === app.id;

            return (
              <AppCard
                key={app.id}
                app={app}
                index={i}
                isExpanded={isExpanded}
                hasChildren={!!hasChildren}
                onToggle={() => setExpandedApp(isExpanded ? null : app.id)}
                onNavigate={navigate}
              />
            );
          })}
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

      <HelpGuideModal open={helpGuideOpen} onClose={() => setHelpGuideOpen(false)} />
    </div>
  );
};

export default AppsLauncher;
