import { useState, useEffect, useMemo } from "react";
import PageHeader from "@/components/layout/PageHeader";
import {
  Search, Star, ChevronDown, ChevronUp,
  Scale, BarChart3, Landmark, FileText, Users, Package, Receipt,
  Sparkles, PieChart, Wallet, DollarSign, Building2, TrendingUp,
  Briefcase, Calculator, ArrowLeftRight, ShoppingCart, ClipboardList,
  Clock, AlertTriangle, Activity, BookOpen, CreditCard,
  ArrowRight, Monitor, Layers, CalendarRange, LayoutDashboard, Truck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";
import { multiWordMatchAny } from "@/lib/utils";
import ExecutiveKPIBar from "@/components/reports/ExecutiveKPIBar";
import { useAuth } from "@/hooks/useAuth";

interface ReportItem {
  slug: string;
  label: string;
  description: string;
  icon: any;
  path: string;
  available: boolean;
  isNew?: boolean;
}

interface ReportSection {
  id: string;
  label: string;
  icon: any;
  color: string;
  reports: ReportItem[];
}

const sections: ReportSection[] = [
  {
    id: "financial",
    label: "المالية",
    icon: DollarSign,
    color: "#4A9EE8",
    reports: [
      { slug: "trial-balance", label: "ميزان المراجعة", description: "جميع الحسابات مع أرصدة المدين والدائن", icon: Scale, path: "/trial-balance", available: true },
      { slug: "balance-sheet", label: "الميزانية العمومية", description: "الأصول والالتزامات وحقوق الملكية", icon: Landmark, path: "/balance-sheet", available: true },
      { slug: "profit-loss", label: "قائمة الأرباح والخسائر", description: "إيرادات ومصروفات وصافي الربح", icon: BarChart3, path: "/profit-loss", available: true },
      { slug: "general-ledger", label: "دفتر الأستاذ العام", description: "جميع الحركات لحساب محدد مع الرصيد التراكمي", icon: BookOpen, path: "/general-ledger", available: true },
      { slug: "journal-entries", label: "دفتر اليومية", description: "جميع القيود المحاسبية للفترة", icon: FileText, path: "/transactions", available: true },
      { slug: "account-statement", label: "كشف حساب", description: "كشف حساب خارجي للعملاء والموردين مع ترويسة الشركة", icon: Receipt, path: "/account-statement", available: true },
      { slug: "cash-movement", label: "حركة الصندوق", description: "جميع حركات النقد الوارد والصادر", icon: Wallet, path: "/reports/cash-movement", available: true },
      { slug: "bank-movement", label: "حركة البنوك", description: "حركات الحسابات البنكية", icon: Building2, path: "/reports/bank-movement", available: true },
      { slug: "cheques-report", label: "تقرير الشيكات", description: "شيكات واردة وصادرة ومستحقة", icon: CreditCard, path: "/reports/cheques", available: true },
      { slug: "ar-aging", label: "أعمار الذمم المدينة", description: "أرصدة الزبائن حسب العمر (30/60/90 يوم)", icon: Clock, path: "/reports/ar-aging", available: true },
      { slug: "ap-aging", label: "أعمار الذمم الدائنة", description: "أرصدة الموردين حسب العمر", icon: Clock, path: "/reports/ap-aging", available: true },
      { slug: "cash-flow", label: "التدفقات النقدية", description: "تدفقات تشغيلية واستثمارية وتمويلية", icon: Activity, path: "/reports/cash-flow", available: true },
    ],
  },
  {
    id: "sales",
    label: "المبيعات",
    icon: ShoppingCart,
    color: "#0070F2",
    reports: [
      { slug: "total-sales", label: "المبيعات الإجمالية", description: "إجمالي المبيعات حسب الفترة مع رسم بياني", icon: BarChart3, path: "/reports/total-sales", available: true },
      { slug: "invoice-register", label: "سجل الفواتير", description: "جميع فواتير البيع مع حالة الدفع", icon: Receipt, path: "/reports/invoice-register", available: true },
      { slug: "by-customer", label: "المبيعات حسب الزبون", description: "تحليل المبيعات مجمّعة حسب الزبون", icon: Users, path: "/reports/by-customer", available: true },
      { slug: "collections", label: "التحصيلات", description: "جميع المبالغ المحصلة من الزبائن", icon: Wallet, path: "/reports/collections", available: true },
      { slug: "daily-sales", label: "المبيعات اليومية", description: "ملخص المبيعات يوماً بيوم", icon: TrendingUp, path: "/reports/daily-sales", available: true },
      { slug: "sales-returns", label: "المرتجعات", description: "مردودات المبيعات وإشعارات الدائن", icon: ArrowLeftRight, path: "/reports/sales-returns", available: true },
      { slug: "sales-by-product", label: "المبيعات حسب الصنف", description: "كمية وقيمة المبيعات لكل منتج", icon: Package, path: "/reports/sales-by-product", available: true },
      { slug: "sales-performance", label: "أداء المبيعات", description: "مؤشرات الأداء ونسبة النمو", icon: TrendingUp, path: "/reports/sales-performance", available: true },
    ],
  },
  {
    id: "purchases",
    label: "المشتريات",
    icon: ClipboardList,
    color: "#E27D3A",
    reports: [
      { slug: "total-purchases", label: "المشتريات الإجمالية", description: "إجمالي المشتريات حسب الفترة", icon: BarChart3, path: "/reports/total-purchases", available: true },
      { slug: "purchase-invoice-register", label: "فواتير المشتريات", description: "سجل فواتير الشراء مع تاريخ الاستحقاق", icon: Receipt, path: "/reports/purchase-invoice-register", available: true },
      { slug: "by-supplier", label: "المشتريات حسب المورد", description: "تحليل مجمّع حسب المورد", icon: Users, path: "/reports/by-supplier", available: true },
      { slug: "supplier-payments", label: "المدفوعات للموردين", description: "جميع المبالغ المدفوعة للموردين", icon: Wallet, path: "/reports/supplier-payments", available: true },
      { slug: "purchase-returns", label: "مرتجعات المشتريات", description: "مردودات الشراء وإشعارات المدين", icon: ArrowLeftRight, path: "/reports/purchase-returns", available: true },
      { slug: "supplier-comparison", label: "مقارنة أسعار الموردين", description: "مقارنة سعر نفس الصنف بين الموردين", icon: Scale, path: "/reports/supplier-comparison", available: true },
    ],
  },
  {
    id: "inventory",
    label: "المخزون",
    icon: Package,
    color: "#7C3AED",
    reports: [
      { slug: "inventory-valuation", label: "جرد وتقييم المخزون", description: "الكميات والقيم الحالية لجميع الأصناف", icon: Package, path: "/reports/inventory-valuation", available: true },
      { slug: "stock-movement", label: "حركة المخزون", description: "حركات الوارد والصادر والتعديل", icon: Activity, path: "/reports/stock-movement", available: true },
      { slug: "below-reorder", label: "أصناف تحت الحد الأدنى", description: "منتجات تحتاج إعادة طلب", icon: AlertTriangle, path: "/reports/below-reorder", available: true },
      { slug: "dead-stock", label: "أصناف راكدة", description: "منتجات بدون حركة لأكثر من 90 يوم", icon: Clock, path: "/reports/dead-stock", available: true },
      { slug: "product-profitability", label: "ربحية الأصناف", description: "هامش الربح لكل منتج", icon: TrendingUp, path: "/reports/product-profitability", available: true },
    ],
  },
  {
    id: "hr",
    label: "الموارد البشرية",
    icon: Users,
    color: "#DB2777",
    reports: [
      { slug: "payroll", label: "الرواتب الشهرية", description: "تفاصيل رواتب جميع الموظفين", icon: Wallet, path: "/reports/hr-payroll", available: true },
      { slug: "attendance", label: "الحضور والانصراف", description: "سجل الحضور لجميع الموظفين", icon: Clock, path: "/reports/hr-attendance", available: true },
      { slug: "leave-balance", label: "رصيد الإجازات", description: "الرصيد المتبقي لكل موظف", icon: Calculator, path: "/reports/hr-leaves", available: true },
      { slug: "employee-directory", label: "بيانات الموظفين", description: "دليل شامل لجميع الموظفين", icon: Users, path: "/reports/employee-directory", available: true },
      { slug: "employee-withdrawals", label: "مسحوبات الموظفين", description: "تفصيل مسحوبات كل موظف حسب نوع العملية", icon: Wallet, path: "/reports/employee-withdrawals", available: true },
      { slug: "staff-cost", label: "تكلفة الموظفين حسب القسم", description: "توزيع تكاليف الرواتب مع رسم بياني", icon: PieChart, path: "/reports/hr-staff-cost", available: true },
    ],
  },
  {
    id: "fixed-assets",
    label: "الأصول الثابتة",
    icon: Briefcase,
    color: "#B45309",
    reports: [
      { slug: "asset-register", label: "سجل الأصول الثابتة", description: "جميع الأصول مع القيمة الدفترية والحالة", icon: ClipboardList, path: "/reports/asset-register", available: true },
      { slug: "monthly-depreciation", label: "الاستهلاك الشهري", description: "قيمة الاستهلاك المحسوبة لكل أصل", icon: TrendingUp, path: "/reports/monthly-depreciation", available: true },
      { slug: "depreciation-schedule", label: "جدول الاستهلاك التفصيلي", description: "جدول زمني كامل لاستهلاك كل أصل", icon: FileText, path: "/reports/depreciation-schedule", available: true },
      { slug: "fully-depreciated", label: "أصول مستهلكة بالكامل", description: "أصول وصلت لنهاية عمرها الإنتاجي", icon: AlertTriangle, path: "/reports/fully-depreciated", available: true },
      { slug: "asset-disposal", label: "أرباح وخسائر بيع الأصول", description: "عمليات الاستبعاد والبيع", icon: ArrowLeftRight, path: "/reports/asset-disposal", available: true },
      { slug: "assets-by-location", label: "الأصول حسب الموقع", description: "تجميع حسب الفرع والقسم", icon: Building2, path: "/reports/assets-by-location", available: true },
    ],
  },
  {
    id: "currency",
    label: "إدارة العملات",
    icon: ArrowLeftRight,
    color: "#0D9488",
    reports: [
      { slug: "exchange-rates", label: "أسعار الصرف", description: "تاريخ أسعار الصرف لجميع العملات", icon: TrendingUp, path: "/reports/exchange-rates", available: true },
      { slug: "currency-conversions", label: "تحويلات العملات", description: "جميع عمليات التحويل مع الربح/الخسارة", icon: ArrowLeftRight, path: "/reports/currency-conversions", available: true },
      { slug: "foreign-balances", label: "أرصدة العملات الأجنبية", description: "الأرصدة بالعملة الأجنبية ومعادلها بالشيكل", icon: DollarSign, path: "/reports/foreign-balances", available: true },
      { slug: "exchange-gain-loss", label: "أرباح وخسائر العملة", description: "فروقات محققة وغير محققة", icon: BarChart3, path: "/reports/exchange-gain-loss", available: true },
    ],
  },
  {
    id: "receivables-payables",
    label: "تقارير الذمم والأداء",
    icon: PieChart,
    color: "#1B3A5C",
    reports: [
      { slug: "ar-aging-detail", label: "تعمير ذمم الزبائن", description: "تصنيف الذمم المستحقة من الزبائن حسب عمر الدين", icon: Clock, path: "/reports/ar-aging-detail", available: true, isNew: true },
      { slug: "dso-report", label: "أيام التحصيل والأداء (DSO)", description: "متوسط أيام التحصيل لكل زبون مع التصنيف", icon: TrendingUp, path: "/reports/dso-report", available: true, isNew: true },
      { slug: "checks-receivable", label: "تقرير الشيكات الواردة", description: "شيكات الزبائن مصنفة حسب الحالة والاستحقاق", icon: CreditCard, path: "/reports/checks-receivable", available: true, isNew: true },
      { slug: "customer-profitability", label: "ربحية الزبائن", description: "المبيعات والهوامش لكل زبون", icon: BarChart3, path: "/reports/customer-profitability", available: true, isNew: true },
      { slug: "customer-statement-all", label: "كشف حساب موحد للزبائن", description: "كشف حساب شامل لجميع الزبائن أو زبون محدد", icon: FileText, path: "/reports/customer-statement-all", available: true, isNew: true },
      { slug: "ap-aging-detail", label: "تعمير ذمم الموردين", description: "المبالغ المستحقة للموردين حسب عمر الدين", icon: Clock, path: "/reports/ap-aging-detail", available: true, isNew: true },
      { slug: "dpo-report", label: "أيام سداد الموردين (DPO)", description: "متوسط أيام السداد لكل مورد", icon: TrendingUp, path: "/reports/dpo-report", available: true, isNew: true },
      { slug: "checks-payable", label: "تقرير الشيكات الصادرة", description: "شيكات الموردين مع تواريخ الاستحقاق", icon: CreditCard, path: "/reports/checks-payable", available: true, isNew: true },
      { slug: "supplier-purchase-analysis", label: "تحليل المشتريات والموردين", description: "حجم المشتريات من كل مورد وتأثيرها", icon: ShoppingCart, path: "/reports/supplier-purchase-analysis", available: true, isNew: true },
      { slug: "supplier-statement-all", label: "كشف حساب موحد للموردين", description: "كشف حساب شامل لجميع الموردين", icon: FileText, path: "/reports/supplier-statement-all", available: true, isNew: true },
    ],
  },
  {
    id: "invoice-tracking",
    label: "تقارير تتبع الفواتير والتحصيل",
    icon: Receipt,
    color: "#0891B2",
    reports: [
      { slug: "invoice-lifecycle", label: "دورة حياة الفاتورة", description: "تتبع كل فاتورة من الإنشاء حتى الإغلاق مع أيام الإغلاق", icon: FileText, path: "/reports/invoice-lifecycle", available: true, isNew: true },
      { slug: "dso-detailed", label: "متوسط أيام التحصيل (DSO) المتقدم", description: "كم يوماً يستغرق كل زبون للسداد مع رسم بياني شهري", icon: TrendingUp, path: "/reports/dso-detailed", available: true, isNew: true },
      { slug: "ar-aging-advanced", label: "تعمير الذمم المدينة المتقدم", description: "توزيع الذمم على شرائح زمنية مع تفصيل كل فاتورة", icon: Layers, path: "/reports/ar-aging-advanced", available: true, isNew: true },
      { slug: "collection-efficiency", label: "كفاءة التحصيل", description: "نسبة الفواتير المسددة في موعدها وتطورها شهرياً", icon: Activity, path: "/reports/collection-efficiency", available: true, isNew: true },
      { slug: "payment-allocation", label: "سجل المدفوعات المرتبطة", description: "كل سند قبض مرتبط بأي فاتورة وبأي مبلغ", icon: Receipt, path: "/reports/payment-allocation", available: true, isNew: true },
      { slug: "unpaid-invoices", label: "فواتير بدون نشاط دفع", description: "فواتير لم يُسجَّل عليها أي سند قبض إطلاقاً", icon: AlertTriangle, path: "/reports/unpaid-invoices", available: true, isNew: true },
      { slug: "collection-dashboard", label: "لوحة تحكم التحصيل", description: "لوحة موحدة تجمع كل مقاييس التحصيل في مكان واحد", icon: Monitor, path: "/reports/collection-dashboard", available: true, isNew: true },
    ],
  },
  {
    id: "orders",
    label: "الطلبات",
    icon: ShoppingCart,
    color: "#4F46E5",
    reports: [
      { slug: "all-orders", label: "تقرير الطلبات", description: "جميع الطلبات مع حالة التوصيل", icon: ClipboardList, path: "/reports/all-orders", available: true },
      { slug: "order-performance", label: "أداء المنتجات", description: "الأكثر طلباً والأكثر ربحية", icon: TrendingUp, path: "/reports/order-performance", available: true },
    ],
  },
  {
    id: "pos",
    label: "نقطة البيع",
    icon: Monitor,
    color: "#059669",
    reports: [
      { slug: "pos-daily-sales", label: "مبيعات نقطة البيع اليومية", description: "مبيعات نقطة البيع حسب الكاشير والوردية", icon: BarChart3, path: "/reports/pos-daily-sales", available: true },
      { slug: "pos-sales-by-category", label: "مبيعات حسب الفئة والصنف", description: "تحليل المبيعات حسب فئة المنتج والصنف", icon: Layers, path: "/reports/pos-sales-by-category", available: true, isNew: true },
      { slug: "pos-peak-hours", label: "ساعات الذروة", description: "توزيع المبيعات حسب ساعات اليوم", icon: Clock, path: "/reports/pos-peak-hours", available: true },
      { slug: "pos-period-comparison", label: "مقارنة زمنية للمبيعات", description: "مقارنة يومية مع نسبة النمو", icon: CalendarRange, path: "/reports/pos-period-comparison", available: true, isNew: true },
      { slug: "pos-invoice-register", label: "كشف فواتير POS", description: "جميع فواتير نقطة البيع مع التفاصيل الكاملة", icon: FileText, path: "/reports/pos-invoice-register", available: true, isNew: true },
      { slug: "pos-cancelled", label: "الفواتير الملغية والمعدّلة", description: "جميع الفواتير الملغاة مع السبب", icon: AlertTriangle, path: "/reports/pos-cancelled", available: true },
      { slug: "pos-pending-orders", label: "فواتير معلقة", description: "الطلبات المفتوحة غير المكتملة", icon: Clock, path: "/reports/pos-pending-orders", available: true, isNew: true },
      { slug: "pos-invoice-timing", label: "كشف أوقات الفواتير", description: "مدة الخدمة من الفتح للإغلاق لكل فاتورة", icon: Clock, path: "/reports/pos-invoice-timing", available: true, isNew: true },
      { slug: "pos-cashier-performance", label: "أداء الكاشيرين", description: "مبيعات كل كاشير: العدد والإجمالي والمتوسط", icon: Users, path: "/reports/pos-cashier-performance", available: true },
      { slug: "pos-cash-reconciliation", label: "تسوية الصندوق", description: "المتوقع مقابل الفعلي عند إغلاق الوردية", icon: Calculator, path: "/reports/pos-cash-reconciliation", available: true },
      { slug: "pos-shift-open-close", label: "تقرير فتح/إغلاق الصندوق", description: "أوقات فتح وإغلاق الورديات ومدتها", icon: Clock, path: "/reports/pos-shift-open-close", available: true, isNew: true },
      { slug: "pos-payment-methods", label: "طرق الدفع", description: "توزيع المبيعات حسب طريقة الدفع", icon: CreditCard, path: "/reports/pos-payment-methods", available: true, isNew: true },
      { slug: "pos-credit-sales", label: "بطاقات الائتمان والمديونيات", description: "المبيعات الآجلة ومديونيات العملاء", icon: CreditCard, path: "/reports/pos-credit-sales", available: true, isNew: true },
      { slug: "pos-product-movement", label: "حركة أصناف POS", description: "الكميات المباعة والمرتجعة لكل صنف", icon: Package, path: "/reports/pos-product-movement", available: true, isNew: true },
      { slug: "pos-category-totals", label: "مجاميع حركات الأصناف", description: "إجماليات المبيعات حسب الفئة", icon: Layers, path: "/reports/pos-category-totals", available: true, isNew: true },
    ],
  },
  {
    id: "van-sales",
    label: "تقارير البائع المتجول",
    icon: Truck,
    color: "#0D1B2E",
    reports: [
      { slug: "van-sales-daily", label: "ملخص يومي", description: "مبيعات اليوم، النقد، الآجل، التكلفة، الربح، والهامش", icon: BarChart3, path: "/reports/van-sales#daily", available: true, isNew: true },
      { slug: "van-sales-by-rep", label: "ربحية حسب المندوب", description: "أداء كل مندوب: المبيعات، التكلفة، الربح، التحصيل", icon: Users, path: "/reports/van-sales#rep", available: true, isNew: true },
      { slug: "van-sales-by-product", label: "ربحية حسب الصنف", description: "الكمية، المبيعات، الربح، الهامش، وأكثر مندوب باعه", icon: Package, path: "/reports/van-sales#product", available: true, isNew: true },
      { slug: "van-sales-by-customer", label: "ربحية حسب الزبون", description: "عدد الطلبات، المبيعات، الربح، ومتوسط الفاتورة والرصيد", icon: Users, path: "/reports/van-sales#customer", available: true, isNew: true },
      { slug: "van-sales-by-supplier", label: "ربحية حسب المورد", description: "ربحية الموردين بناءً على المنتجات المباعة", icon: Building2, path: "/reports/van-sales#supplier", available: true, isNew: true },
      { slug: "van-sales-orders", label: "تقرير الطلبات", description: "كل طلبات المندوبين مع الربح وزر فتح الفاتورة", icon: Receipt, path: "/reports/van-sales#orders", available: true, isNew: true },
    ],
  },
  {
    id: "management",
    label: "تقارير إدارية",
    icon: PieChart,
    color: "#6366F1",
    reports: [
      { slug: "smart-report", label: "التقرير الذكي", description: "اسأل بلغتك عن أي بيانات مالية", icon: Sparkles, path: "/smart-report", available: true },
      { slug: "financial-kpi", label: "المؤشرات المالية", description: "هامش الربح ونسبة التداول ومعدل الدوران", icon: Activity, path: "/reports/financial-kpi", available: true },
      { slug: "month-comparison", label: "المقارنة الشهرية", description: "إيرادات ومصروفات شهر بشهر", icon: BarChart3, path: "/reports/month-comparison", available: true },
    ],
  },
];

const FAVORITES_KEY = "report_favorites";
const loadFavorites = (): string[] => {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); } catch { return []; }
};
const saveFavorites = (favs: string[]) => localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));

const ReportsPage = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");
  // All sections expanded by default
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(sections.map(s => s.id)));
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

  const allReports = useMemo(() =>
    sections.flatMap(s => s.reports.map(r => ({ ...r, sectionLabel: s.label }))),
    []
  );

  const filteredSections = useMemo(() => {
    if (!searchQuery.trim()) return sections;
    return sections
      .map(s => ({
        ...s,
        reports: s.reports.filter(r => multiWordMatchAny(searchQuery, r.label, r.description)),
      }))
      .filter(s => s.reports.length > 0);
  }, [searchQuery]);

  const favoriteReports = useMemo(() =>
    allReports.filter(r => favorites.includes(r.slug)),
    [favorites, allReports]
  );

  const totalReports = sections.reduce((s, sec) => s + sec.reports.length, 0);
  const availableReports = sections.reduce((s, sec) => s + sec.reports.filter(r => r.available).length, 0);

  useEffect(() => {
    if (searchQuery.trim()) {
      setExpandedSections(new Set(sections.map(s => s.id)));
    }
  }, [searchQuery]);

  const { user } = useAuth();

  return (
    <div className="space-y-8 max-w-[1200px] mx-auto pb-10" dir="rtl">
      {/* Page Header */}
      <PageHeader title="التقارير" breadcrumb={["الرئيسية", "التقارير"]} />

      {/* P5 — Executive KPI snapshot (read-only) */}
      {user?.id && <ExecutiveKPIBar uid={user.id} />}

      {/* Search & Stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="البحث حسب الاسم..."
            className="pr-10 h-10 rounded-lg bg-white border border-border text-sm"
          />
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{totalReports} تقرير</span>
          <span className="text-border">|</span>
          <span>{availableReports} متاح</span>
        </div>
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
              <ReportListItem key={report.slug} report={report} isFavorite={true} onToggleFavorite={() => toggleFavorite(report.slug)} onClick={() => report.available && navigate(report.path)} />
            ))}
          </div>
        </div>
      )}

      {/* Report Builder Banner (NEW - flagship feature) */}
      {!searchQuery.trim() && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div
            onClick={() => navigate("/reports/builder")}
            className="rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-4 flex items-center gap-4 cursor-pointer hover:shadow-md hover:border-primary/50 transition-all group relative overflow-hidden"
          >
            <span className="absolute top-2 left-2 text-[9px] font-bold bg-primary text-primary-foreground px-1.5 py-0.5 rounded">جديد</span>
            <div className="w-12 h-12 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-foreground">منشئ التقارير المخصصة</h3>
              <p className="text-[11px] text-muted-foreground">صمّم تقريرك بنفسك — أعمدة، فلاتر، تجميع، Drill-down</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:-translate-x-1 transition-all rotate-180" />
          </div>

          <div
            onClick={() => navigate("/dashboards")}
            className="rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 via-emerald-500/5 to-transparent p-4 flex items-center gap-4 cursor-pointer hover:shadow-md hover:border-emerald-500/50 transition-all group relative overflow-hidden"
          >
            <span className="absolute top-2 left-2 text-[9px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded">جديد</span>
            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
              <LayoutDashboard className="h-6 w-6 text-emerald-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-foreground">لوحات المعلومات المخصصة</h3>
              <p className="text-[11px] text-muted-foreground">اسحب وأفلت widgets — KPIs، رسومات، تقارير محفوظة</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-emerald-600 group-hover:-translate-x-1 transition-all rotate-180" />
          </div>

          <div
            onClick={() => navigate("/reports/periodic")}
            className="rounded-xl border border-border/40 bg-white p-4 flex items-center gap-4 cursor-pointer hover:shadow-sm hover:border-accent/30 transition-all group"
          >
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center shrink-0">
              <CalendarRange className="h-6 w-6 text-accent" />
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-bold text-foreground">التقارير الدورية</h3>
              <p className="text-[11px] text-muted-foreground">قوالب جاهزة — شهري، ربعي، نصف سنوي، سنوي</p>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-accent group-hover:-translate-x-1 transition-all rotate-180" />
          </div>
        </div>
      )}

      {/* Qoyod-style Category Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-12 gap-y-10">
        {filteredSections.map(section => {
          const SectionIcon = section.icon;
          return (
            <div key={section.id} className="space-y-4">
              {/* Category Header with Icon */}
              <div className="flex flex-col items-center text-center gap-3 pb-2">
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ backgroundColor: section.color + '12', border: `1.5px solid ${section.color}25` }}
                >
                  <SectionIcon className="h-7 w-7" style={{ color: section.color }} />
                </div>
                <h3 className="text-base font-bold text-foreground" style={{ fontFamily: "Tajawal, sans-serif" }}>
                  {section.label}
                </h3>
              </div>

              {/* Report Links List */}
              <div className="space-y-0.5">
                {section.reports.map(report => (
                  <ReportListItem
                    key={report.slug}
                    report={report}
                    isFavorite={favorites.includes(report.slug)}
                    onToggleFavorite={() => toggleFavorite(report.slug)}
                    onClick={() => report.available && navigate(report.path)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface ReportListItemProps {
  report: ReportItem;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onClick: () => void;
}

const ReportListItem = ({ report, isFavorite, onToggleFavorite, onClick }: ReportListItemProps) => {
  return (
    <div
      className={`group flex items-center justify-between gap-2 py-2 px-2 rounded-lg transition-all cursor-pointer ${
        report.available
          ? "hover:bg-muted/40"
          : "opacity-40 cursor-not-allowed"
      }`}
      onClick={report.available ? onClick : undefined}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span className="text-[13px] text-foreground hover:text-primary transition-colors truncate leading-relaxed">
          {report.label}
        </span>
        {report.isNew && report.available && (
          <span className="text-[9px] px-2 py-0.5 rounded-full bg-info/10 text-info font-bold whitespace-nowrap shrink-0">
            جديد
          </span>
        )}
        {!report.available && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium whitespace-nowrap shrink-0">🔒</span>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(); }}
        className="p-1 rounded-md hover:bg-muted/80 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
      >
        <Star className={`h-3 w-3 ${isFavorite ? "text-yellow-500 fill-yellow-500" : "text-muted-foreground/40"}`} />
      </button>
    </div>
  );
};

export default ReportsPage;
