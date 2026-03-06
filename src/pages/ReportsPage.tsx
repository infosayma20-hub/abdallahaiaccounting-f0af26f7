import { useState, useEffect, useMemo } from "react";
import {
  Search, Star, ChevronDown, ChevronUp, FileSpreadsheet, Download,
  Scale, BarChart3, Landmark, FileText, Users, Package, Receipt,
  Sparkles, PieChart, Wallet, DollarSign, Building2, TrendingUp,
  Briefcase, Calculator, ArrowLeftRight, ShoppingCart, ClipboardList,
  Clock, AlertTriangle, Layers, Activity, BookOpen, CreditCard,
  ArrowRight,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

// ── Report Definition ──
interface ReportItem {
  slug: string;
  label: string;
  description: string;
  icon: any;
  path: string;
  available: boolean;
}

interface ReportSection {
  id: string;
  label: string;
  emoji: string;
  icon: any;
  color: string;
  reports: ReportItem[];
}

const sections: ReportSection[] = [
  {
    id: "financial",
    label: "المالية",
    emoji: "💰",
    icon: DollarSign,
    color: "text-emerald-500",
    reports: [
      { slug: "trial-balance", label: "ميزان المراجعة", description: "جميع الحسابات مع أرصدة المدين والدائن", icon: Scale, path: "/trial-balance", available: true },
      { slug: "balance-sheet", label: "الميزانية العمومية", description: "الأصول والالتزامات وحقوق الملكية", icon: Landmark, path: "/balance-sheet", available: true },
      { slug: "profit-loss", label: "قائمة الأرباح والخسائر", description: "إيرادات ومصروفات وصافي الربح", icon: BarChart3, path: "/profit-loss", available: true },
      { slug: "general-ledger", label: "دفتر الأستاذ العام", description: "جميع الحركات لحساب محدد مع الرصيد التراكمي", icon: BookOpen, path: "/general-ledger", available: true },
      { slug: "journal-entries", label: "دفتر اليومية", description: "جميع القيود المحاسبية للفترة", icon: FileText, path: "/transactions", available: true },
      { slug: "account-statement", label: "كشف حساب", description: "حركات أي حساب بالتفصيل مع الأرصدة", icon: Receipt, path: "/account-statement", available: true },
      { slug: "cash-movement", label: "حركة الصندوق", description: "جميع حركات النقد الوارد والصادر", icon: Wallet, path: "/transactions", available: true },
      { slug: "bank-movement", label: "حركة البنوك", description: "حركات الحسابات البنكية", icon: Building2, path: "/transactions", available: true },
      { slug: "ar-aging", label: "أعمار الذمم المدينة", description: "أرصدة العملاء حسب العمر (30/60/90 يوم)", icon: Clock, path: "#", available: false },
      { slug: "ap-aging", label: "أعمار الذمم الدائنة", description: "أرصدة الموردين حسب العمر", icon: Clock, path: "#", available: false },
      { slug: "cheques-report", label: "تقرير الشيكات", description: "شيكات واردة وصادرة ومستحقة", icon: CreditCard, path: "/cheques", available: true },
      { slug: "cash-flow", label: "التدفقات النقدية", description: "تدفقات تشغيلية واستثمارية وتمويلية", icon: Activity, path: "#", available: false },
    ],
  },
  {
    id: "sales",
    label: "المبيعات",
    emoji: "🛒",
    icon: ShoppingCart,
    color: "text-blue-500",
    reports: [
      { slug: "sales-summary", label: "المبيعات الإجمالي", description: "إجمالي المبيعات حسب الفترة", icon: BarChart3, path: "/invoices", available: true },
      { slug: "sales-by-customer", label: "المبيعات حسب العميل", description: "تحليل المبيعات مجمّعة حسب العميل", icon: Users, path: "/contacts", available: true },
      { slug: "invoices-report", label: "سجل الفواتير", description: "جميع الفواتير مع حالة الدفع", icon: Receipt, path: "/invoices", available: true },
      { slug: "collections", label: "التحصيلات", description: "جميع المبالغ المحصلة من العملاء", icon: Wallet, path: "/receipts", available: true },
      { slug: "sales-returns", label: "المرتجعات", description: "مردودات المبيعات وإشعارات الدائن", icon: ArrowLeftRight, path: "#", available: false },
      { slug: "daily-sales", label: "المبيعات اليومية", description: "ملخص مبيعات اليوم والمقارنة", icon: TrendingUp, path: "#", available: false },
      { slug: "sales-by-product", label: "المبيعات حسب الصنف", description: "كمية وقيمة المبيعات لكل منتج", icon: Package, path: "#", available: false },
      { slug: "sales-performance", label: "أداء المبيعات", description: "مؤشرات الأداء ونسبة النمو", icon: TrendingUp, path: "#", available: false },
    ],
  },
  {
    id: "purchases",
    label: "المشتريات",
    emoji: "🧾",
    icon: ClipboardList,
    color: "text-orange-500",
    reports: [
      { slug: "purchases-summary", label: "المشتريات الإجمالي", description: "إجمالي المشتريات حسب الفترة", icon: BarChart3, path: "/invoices", available: true },
      { slug: "purchases-by-supplier", label: "المشتريات حسب المورد", description: "تحليل مجمّع حسب المورد", icon: Users, path: "/contacts", available: true },
      { slug: "purchase-invoices", label: "فواتير المشتريات", description: "سجل فواتير الشراء", icon: Receipt, path: "/invoices", available: true },
      { slug: "payments-to-suppliers", label: "المدفوعات للموردين", description: "جميع المبالغ المدفوعة", icon: Wallet, path: "/payments", available: true },
      { slug: "purchase-returns", label: "مرتجعات المشتريات", description: "مردودات الشراء وإشعارات المدين", icon: ArrowLeftRight, path: "#", available: false },
      { slug: "supplier-comparison", label: "مقارنة أسعار الموردين", description: "مقارنة سعر نفس الصنف بين الموردين", icon: Scale, path: "#", available: false },
    ],
  },
  {
    id: "inventory",
    label: "المخزون",
    emoji: "📦",
    icon: Package,
    color: "text-violet-500",
    reports: [
      { slug: "inventory-valuation", label: "جرد وتقييم المخزون", description: "الكميات والقيم الحالية لجميع الأصناف", icon: Package, path: "/inventory-valuation", available: true },
      { slug: "stock-movement", label: "حركة المخزون", description: "حركات الوارد والصادر والتعديل", icon: Activity, path: "/inventory-movements", available: true },
      { slug: "low-stock", label: "أصناف تحت الحد الأدنى", description: "منتجات تحتاج إعادة طلب", icon: AlertTriangle, path: "/inventory", available: true },
      { slug: "product-profitability", label: "ربحية الأصناف", description: "هامش الربح لكل منتج", icon: TrendingUp, path: "#", available: false },
      { slug: "slow-moving", label: "أصناف راكدة", description: "منتجات بدون حركة لأكثر من 90 يوم", icon: Clock, path: "#", available: false },
    ],
  },
  {
    id: "hr",
    label: "الموارد البشرية",
    emoji: "👥",
    icon: Users,
    color: "text-pink-500",
    reports: [
      { slug: "payroll", label: "الرواتب الشهري", description: "تفاصيل رواتب جميع الموظفين", icon: Wallet, path: "/reports/hr-payroll", available: true },
      { slug: "attendance", label: "الحضور والانصراف", description: "سجل الحضور لجميع الموظفين", icon: Clock, path: "/reports/hr-attendance", available: true },
      { slug: "leave-balance", label: "رصيد الإجازات", description: "الرصيد المتبقي لكل موظف", icon: Calculator, path: "/reports/hr-leaves", available: true },
      { slug: "employee-directory", label: "بيانات الموظفين", description: "دليل شامل لجميع الموظفين", icon: Users, path: "/employees", available: true },
      { slug: "staff-cost", label: "تكلفة الموظفين حسب القسم", description: "توزيع تكاليف الرواتب مع رسم بياني", icon: PieChart, path: "/reports/hr-staff-cost", available: true },
    ],
  },
  {
    id: "fixed-assets",
    label: "الأصول الثابتة",
    emoji: "🏛️",
    icon: Briefcase,
    color: "text-amber-600",
    reports: [
      { slug: "asset-register", label: "سجل الأصول الثابتة", description: "جميع الأصول مع القيمة الدفترية والحالة", icon: ClipboardList, path: "/fixed-assets", available: true },
      { slug: "monthly-depreciation", label: "الاستهلاك الشهري", description: "قيمة الاستهلاك المحسوبة لكل أصل", icon: TrendingUp, path: "/fixed-assets", available: true },
      { slug: "depreciation-schedule", label: "جدول الاستهلاك التفصيلي", description: "جدول زمني كامل لاستهلاك كل أصل", icon: FileText, path: "/fixed-assets", available: true },
      { slug: "fully-depreciated", label: "أصول مستهلكة بالكامل", description: "أصول وصلت لنهاية عمرها الإنتاجي", icon: AlertTriangle, path: "/fixed-assets", available: true },
      { slug: "asset-disposal", label: "أرباح وخسائر بيع الأصول", description: "عمليات الاستبعاد والبيع", icon: ArrowLeftRight, path: "/fixed-assets", available: true },
      { slug: "assets-by-location", label: "الأصول حسب الموقع", description: "تجميع حسب الفرع والقسم", icon: Building2, path: "/fixed-assets", available: true },
    ],
  },
  {
    id: "currency",
    label: "إدارة العملات",
    emoji: "💱",
    icon: ArrowLeftRight,
    color: "text-teal-500",
    reports: [
      { slug: "exchange-rates", label: "أسعار الصرف", description: "تاريخ أسعار الصرف لجميع العملات", icon: TrendingUp, path: "/currency-management", available: true },
      { slug: "currency-conversions", label: "تحويلات العملات", description: "جميع عمليات التحويل مع الربح/الخسارة", icon: ArrowLeftRight, path: "/currency-management", available: true },
      { slug: "foreign-balances", label: "أرصدة العملات الأجنبية", description: "الأرصدة بالعملة الأجنبية ومعادلها بالشيكل", icon: DollarSign, path: "#", available: false },
      { slug: "exchange-gain-loss", label: "أرباح وخسائر العملة", description: "فروقات محققة وغير محققة", icon: BarChart3, path: "#", available: false },
    ],
  },
  {
    id: "orders",
    label: "الطلبات",
    emoji: "🏪",
    icon: ShoppingCart,
    color: "text-indigo-500",
    reports: [
      { slug: "orders-report", label: "تقرير الطلبات", description: "جميع الطلبات مع حالة التوصيل", icon: ClipboardList, path: "/orders", available: true },
      { slug: "order-performance", label: "أداء المنتجات", description: "الأكثر طلباً والأكثر ربحية", icon: TrendingUp, path: "#", available: false },
    ],
  },
  {
    id: "management",
    label: "تقارير إدارية",
    emoji: "📊",
    icon: PieChart,
    color: "text-gray-600",
    reports: [
      { slug: "smart-report", label: "التقرير الذكي", description: "اسأل بلغتك عن أي بيانات مالية", icon: Sparkles, path: "/smart-report", available: true },
      { slug: "financial-kpi", label: "المؤشرات المالية", description: "هامش الربح ونسبة التداول ومعدل الدوران", icon: Activity, path: "#", available: false },
      { slug: "month-comparison", label: "المقارنة الشهرية", description: "إيرادات ومصروفات شهر بشهر", icon: BarChart3, path: "#", available: false },
      { slug: "export-tools", label: "أدوات التصدير", description: "تصدير البيانات بصيغ Excel و PDF", icon: FileSpreadsheet, path: "/export", available: true },
    ],
  },
];

// ── Favorites (localStorage) ──
const FAVORITES_KEY = "report_favorites";
const loadFavorites = (): string[] => {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); } catch { return []; }
};
const saveFavorites = (favs: string[]) => localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));

const ReportsPage = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["financial"]));
  const [favorites, setFavorites] = useState<string[]>(loadFavorites);

  const toggleSection = (id: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleFavorite = (slug: string) => {
    setFavorites(prev => {
      const next = prev.includes(slug) ? prev.filter(s => s !== slug) : [...prev, slug];
      saveFavorites(next);
      return next;
    });
  };

  // All reports flat for search
  const allReports = useMemo(() =>
    sections.flatMap(s => s.reports.map(r => ({ ...r, sectionLabel: s.label }))),
    []
  );

  // Search filter
  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    const q = searchQuery.toLowerCase();
    return sections
      .map(s => ({
        ...s,
        reports: s.reports.filter(r =>
          r.label.toLowerCase().includes(q) ||
          r.description.toLowerCase().includes(q)
        ),
      }))
      .filter(s => s.reports.length > 0);
  }, [searchQuery]);

  // Favorite reports
  const favoriteReports = useMemo(() =>
    allReports.filter(r => favorites.includes(r.slug)),
    [favorites, allReports]
  );

  // Total report count
  const totalReports = sections.reduce((s, sec) => s + sec.reports.length, 0);
  const availableReports = sections.reduce((s, sec) => s + sec.reports.filter(r => r.available).length, 0);

  // Expand all when searching
  useEffect(() => {
    if (searchQuery.trim()) {
      setExpandedSections(new Set(sections.map(s => s.id)));
    }
  }, [searchQuery]);

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto pb-10" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowRight className="h-5 w-5 text-foreground" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-foreground">التقارير</h1>
            <p className="text-xs text-muted-foreground">
              {totalReports} تقرير • {availableReports} متاح
            </p>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث في التقارير..."
          className="pr-10 h-11 rounded-xl bg-card border-border/60 text-sm"
        />
      </div>

      {/* Favorites */}
      {favoriteReports.length > 0 && !searchQuery.trim() && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
            <h2 className="text-sm font-bold text-foreground">التقارير المفضلة</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {favoriteReports.map(report => (
              <ReportCard
                key={report.slug}
                report={report}
                isFavorite={true}
                onToggleFavorite={() => toggleFavorite(report.slug)}
                onClick={() => report.available && navigate(report.path)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      <div className="space-y-3">
        {filteredSections.map(section => {
          const isExpanded = expandedSections.has(section.id);
          const availCount = section.reports.filter(r => r.available).length;

          return (
            <div key={section.id} className="rounded-xl border border-border/60 bg-card overflow-hidden">
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.id)}
                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">{section.emoji}</span>
                  <div className="text-right">
                    <h3 className="text-sm font-bold text-foreground">{section.label}</h3>
                    <p className="text-[10px] text-muted-foreground">
                      {section.reports.length} تقرير • {availCount} متاح
                    </p>
                  </div>
                </div>
                {isExpanded
                  ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                  : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                }
              </button>

              {/* Section Reports */}
              {isExpanded && (
                <div className="border-t border-border/40 p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {section.reports.map(report => (
                    <ReportCard
                      key={report.slug}
                      report={report}
                      isFavorite={favorites.includes(report.slug)}
                      onToggleFavorite={() => toggleFavorite(report.slug)}
                      onClick={() => report.available && navigate(report.path)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ── Report Card Component ──
interface ReportCardProps {
  report: ReportItem;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClick: () => void;
}

const ReportCard = ({ report, isFavorite, onToggleFavorite, onClick }: ReportCardProps) => {
  const Icon = report.icon;

  return (
    <div
      className={`relative group flex items-start gap-3 p-3 rounded-xl border transition-all duration-200 cursor-pointer
        ${report.available
          ? "border-border/40 hover:border-border hover:shadow-sm hover:bg-muted/20"
          : "border-border/20 opacity-50 cursor-not-allowed"
        }`}
      onClick={report.available ? onClick : undefined}
    >
      {/* Icon */}
      <div className="p-2 rounded-lg bg-muted/60 shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-semibold text-foreground truncate">{report.label}</p>
          {!report.available && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground whitespace-nowrap">
              قريباً
            </span>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-1">{report.description}</p>
      </div>

      {/* Favorite */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
        className="p-1 rounded-md hover:bg-muted/80 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
      >
        <Star className={`h-3.5 w-3.5 ${isFavorite ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground"}`} />
      </button>
    </div>
  );
};

export default ReportsPage;
