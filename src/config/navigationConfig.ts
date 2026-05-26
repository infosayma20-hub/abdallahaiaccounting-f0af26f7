import {
  BarChart3, DollarSign, ShoppingCart, ShoppingBag, Monitor, Package,
  Landmark, Building2, Store, Users, Calculator, Settings, FileSpreadsheet,
  Puzzle, ArrowLeftRight, ClipboardList, Plane, Truck, LayoutGrid, Sparkles, Receipt, Shield, UserPlus,
  Activity, PieChart, Scale, LayoutDashboard, PhoneCall,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ── Types ── */
export interface NavChild {
  label: string;
  path: string;
}

export interface NavGroup {
  groupLabel?: string;
  children: NavChild[];
}

export interface NavItem {
  id: string;
  label: string;
  description: string;
  module: string;          // for ModuleIcon
  icon: LucideIcon;        // for AppsLauncher cards
  color: string;           // tailwind text color token
  bgColor: string;         // tailwind bg color token
  path: string;            // direct path or first child
  isNew?: boolean;
  keywords?: string[];
  groups?: NavGroup[];      // sub-groups (sidebar accordion + app card expansion)
  isDirect?: boolean;       // no expansion, just a link
  /** Setting key that must be truthy to consider this app "enabled". If undefined → always enabled */
  enableSetting?: string;
}

export interface NavSection {
  sectionTitle: string;
  items: NavItem[];
}

/* ── Central navigation structure ── */
export const navigationSections: NavSection[] = [
  /* ── Top-level direct links ── */
  {
    sectionTitle: "",
    items: [
      {
        id: "apps", label: "التطبيقات", description: "جميع التطبيقات", module: "home", icon: BarChart3,
        color: "text-primary", bgColor: "bg-primary/10", path: "/apps", isDirect: true, keywords: ["تطبيقات"],
      },
      {
        id: "dashboard", label: "لوحة المعلومات", description: "ملخص مالي شامل وتحليلات الأداء", module: "dashboard", icon: LayoutGrid,
        color: "text-blue-600", bgColor: "bg-blue-500/10", path: "/dashboard", isDirect: true, keywords: ["لوحة", "معلومات", "داشبورد"],
      },
      {
        id: "ai-accountant", label: "المحاسب الذكي", description: "محاسبة تحليلية بالذكاء الاصطناعي", module: "ai", icon: Sparkles,
        color: "text-purple-600", bgColor: "bg-purple-500/10", path: "/smart-accountant", isDirect: true,
        keywords: ["محاسب", "ذكاء", "تحليل", "ai"],
      },
      {
        id: "print-templates", label: "نماذج للطباعة", description: "أنشئ وطبع نماذج احترافية مرتبطة ببيانات شركتك", module: "print", icon: FileSpreadsheet,
        color: "text-orange-600", bgColor: "bg-orange-500/10", path: "/print-templates", isDirect: true,
        keywords: ["نماذج", "طباعة", "عرض سعر", "عقد", "مطالبة", "إشعار"],
      },
    ],
  },

  /* ══ المالية والمحاسبة ══ */
  {
    sectionTitle: "المالية والمحاسبة",
    items: [
      {
        id: "finance", label: "المالية", description: "حسابات، قيود، وميزان مراجعة", module: "accounting", icon: DollarSign,
        color: "text-emerald-500", bgColor: "bg-emerald-500/10", path: "/finance/receipts",
        keywords: ["مالية", "حسابات", "قيود", "ميزان"],
        groups: [
          {
            groupLabel: "السندات",
            children: [
              { label: "سند القبض", path: "/finance/receipts" },
              { label: "سند الصرف", path: "/finance/payments" },
              { label: "سند القيد", path: "/finance/journals" },
            ],
          },
          {
            groupLabel: "الدفاتر والحسابات",
            children: [
              { label: "شجرة الحسابات", path: "/accounts" },
              { label: "دفتر اليومية", path: "/transactions" },
              { label: "دفتر الأستاذ", path: "/general-ledger" },
              { label: "كشف حساب", path: "/account-statement" },
              { label: "ميزان المراجعة", path: "/trial-balance" },
              { label: "الزبائن", path: "/contacts?type=customer" },
              { label: "الموردين", path: "/contacts?type=supplier" },
              { label: "المندوبين", path: "/sales-reps" },
            ],
          },
          {
            groupLabel: "الصناديق والبنوك",
            children: [
              { label: "الصناديق", path: "/finance/cash-boxes" },
              { label: "الحسابات البنكية", path: "/finance/bank-accounts" },
              { label: "الشيكات", path: "/finance/cheques" },
            ],
          },
          {
            groupLabel: "العملات",
            children: [
              { label: "إدارة العملات", path: "/currency-management" },
            ],
          },
        ],
      },
      {
        id: "tax", label: "المحاسبة الضريبية", description: "ضريبة القيمة المضافة، التقارير الدورية، والتقديمات", module: "tax", icon: Receipt,
        color: "text-rose-600", bgColor: "bg-rose-500/10", path: "/tax",
        keywords: ["ضريبة", "ضريبي", "قيمة مضافة", "VAT", "تقرير دوري"],
      },
    ],
  },

  /* ══ المبيعات والمشتريات ══ */
  {
    sectionTitle: "المبيعات والمشتريات",
    items: [
      {
        id: "crm", label: "إدارة علاقات العملاء", description: "من عميل محتمل إلى صفقة مغلقة وفاتورة محصّلة", module: "crm", icon: UserPlus,
        color: "text-indigo-600", bgColor: "bg-indigo-500/10", path: "/crm",
        keywords: ["crm", "علاقات", "عملاء", "leads", "pipeline", "محتمل", "فرص", "متابعات"],
        groups: [
          {
            groupLabel: "العمليات",
            children: [
              { label: "لوحة CRM", path: "/crm" },
              { label: "العملاء المحتملون", path: "/crm/leads" },
              { label: "خط سير المبيعات", path: "/crm/pipeline" },
              { label: "المتابعات والأنشطة", path: "/crm/activities" },
              { label: "ملف العميل 360", path: "/crm/customers" },
            ],
          },
        ],
      },
      {
        id: "sales", label: "المبيعات", description: "فواتير، نقاط بيع، وزبائن", module: "sales", icon: ShoppingCart,
        color: "text-orange-500", bgColor: "bg-orange-500/10", path: "/invoices",
        keywords: ["فواتير", "بيع", "زبائن", "عملاء"],
        groups: [
          {
            groupLabel: "العمليات",
            children: [
              { label: "الفواتير", path: "/invoices?type=sales" },
              { label: "الطلبيات", path: "/orders" },
              { label: "إرساليات المبيعات", path: "/delivery-notes" },
              { label: "مردودات مبيعات", path: "/sales/returns" },
              { label: "إشعارات دائنة", path: "/credit-notes" },
              { label: "سندات القبض", path: "/finance/receipts" },
            ],
          },
          {
            groupLabel: "الإعدادات",
            children: [
              { label: "سياسات التصنيف", path: "/contacts/policies" },
            ],
          },
        ],
      },
      {
        id: "purchases", label: "المشتريات", description: "موردين، طلبيات، فواتير مشتريات، وتقارير", module: "purchases", icon: ShoppingBag,
        color: "text-sky-500", bgColor: "bg-sky-500/10", path: "/procurement/orders/new",
        keywords: ["مشتريات", "مورد", "استلام", "طلبية"],
        groups: [
          {
            groupLabel: "إدارة المشتريات",
            children: [
              { label: "طلب مشتريات", path: "/procurement/orders/new" },
              { label: "الطلبيات", path: "/procurement/orders" },
              { label: "فواتير المشتريات", path: "/invoices?type=purchase" },
              { label: "مردودات مشتريات", path: "/purchases/returns" },
              { label: "إشعارات مدينة", path: "/debit-notes" },
            ],
          },
          {
            groupLabel: "التقارير",
            children: [
              { label: "كشف حساب مورد", path: "/procurement/supplier-statement" },
              { label: "التقرير الأسبوعي", path: "/procurement/weekly-report" },
            ],
          },
          {
            groupLabel: "عمليات أخرى",
            children: [
              { label: "إعدادات المشتريات", path: "/procurement/settings" },
              { label: "سندات الصرف", path: "/finance/payments" },
              { label: "ملفات الاستيراد", path: "/purchases/import" },
            ],
          },
        ],
      },
    ],
  },

  /* ══ العمليات ══ */
  {
    sectionTitle: "العمليات",
    items: [
      {
        id: "pos", label: "نقطة البيع", description: "نظام POS متكامل للمبيعات المباشرة", module: "pos", icon: Monitor,
        color: "text-emerald-400", bgColor: "bg-emerald-500/10", path: "/pos",
        enableSetting: "has_pos",
        keywords: ["نقطة", "بيع", "كاشير", "pos", "مطعم"],
        groups: [
          {
            groupLabel: "التشغيل",
            children: [
              { label: "نقطة البيع", path: "/pos" },
              { label: "خريطة الطاولات", path: "/pos/floor-plan" },
              { label: "إدارة الإضافات", path: "/pos/modifiers" },
            ],
          },
          {
            groupLabel: "الإدارة",
            children: [
              { label: "تقارير نقطة البيع", path: "/pos-reports" },
              { label: "تقارير الكول سنتر", path: "/call-center-reports" },
              { label: "إدارة مستخدمي POS", path: "/pos-users" },
            ],
          },
        ],
      },
      {
        id: "inventory", label: "المخزون", description: "منتجات، مستودعات، حركات، وتقييم", module: "inventory", icon: Package,
        color: "text-teal-500", bgColor: "bg-teal-500/10", path: "/inventory",
        enableSetting: "has_inventory",
        keywords: ["مخزون", "منتج", "بضاعة", "مستودع"],
        groups: [
          {
            groupLabel: "المنتجات",
            children: [
              { label: "المنتجات", path: "/inventory" },
            ],
          },
          {
            groupLabel: "المستودعات",
            children: [
              { label: "المستودعات", path: "/warehouses" },
              { label: "سندات تحويل المخزون", path: "/stock-transfers" },
            ],
          },
          {
            groupLabel: "الحركات والتقييم",
            children: [
              { label: "حركات المخزون", path: "/inventory-movements" },
              { label: "تقييم المخزون", path: "/inventory-valuation" },
            ],
          },
        ],
      },
      {
        id: "van-sales", label: "البائع المتجول", description: "دورة البيع الميداني، العمولات، وتقارير المندوبين", module: "inventory", icon: Truck,
        color: "text-cyan-600", bgColor: "bg-cyan-500/10", path: "/rep",
        keywords: ["بائع", "متجول", "ميداني", "مندوب", "van", "توزيع"],
        groups: [
          {
            groupLabel: "العمليات",
            children: [
              { label: "دورة يوم البائع المتجول", path: "/van-days" },
              { label: "مندوبين المبيعات", path: "/sales-reps" },
              { label: "طلبيات المندوبين", path: "/admin/sales-rep-orders" },
            ],
          },
          {
            groupLabel: "العمولات والتقارير",
            children: [
              { label: "عمولات البائعين المتجولين", path: "/van-commissions" },
              { label: "تقارير البائعين المتجولين", path: "/van-reports" },
            ],
          },
        ],
      },
      {
        id: "fixed-assets", label: "الأصول الثابتة", description: "سجل الأصول، الاستهلاك، والصيانة", module: "assets", icon: Landmark,
        color: "text-stone-600", bgColor: "bg-stone-500/10", path: "/fixed-assets", isDirect: true,
        keywords: ["أصول", "استهلاك", "ثابتة"],
      },
      {
        id: "warranty", label: "إدارة الكفالات", description: "سياسات، بطاقات، مطالبات، وتعويضات الشركة الأم", module: "warranty", icon: Shield,
        color: "text-emerald-600", bgColor: "bg-emerald-500/10", path: "/warranty",
        keywords: ["كفالة", "كفالات", "ضمان", "warranty", "صيانة", "مطالبة"],
        groups: [
          {
            groupLabel: "العمليات",
            children: [
              { label: "الصفحة الرئيسية", path: "/warranty" },
              { label: "بطاقات الكفالة", path: "/warranty/cards" },
              { label: "مطالبات الكفالة", path: "/warranty/claims" },
              { label: "مطالبات الشركة الأم", path: "/warranty/supplier-claims" },
            ],
          },
          {
            groupLabel: "الإعدادات والتقارير",
            children: [
              { label: "سياسات الكفالة", path: "/warranty/policies" },
              { label: "التقارير", path: "/warranty/reports" },
            ],
          },
        ],
      },
      {
        id: "contractor", label: "محاسب المشاريع والمقاولات", description: "إدارة مشاريع المقاولات والحركات المالية", module: "contractor", icon: Building2,
        color: "text-amber-600", bgColor: "bg-amber-500/10", path: "/contractor", isDirect: true,
        enableSetting: "has_contractor",
        keywords: ["مقاولات", "مشاريع", "مقاول"],
      },
      {
        id: "workshops", label: "إدارة الورشات والمناجر", description: "إدارة ورشات العمل والمناجر وتتبع تكاليف كل ورشة", module: "workshops", icon: Building2,
        color: "text-amber-700", bgColor: "bg-amber-600/10", path: "/workshops", isDirect: true,
        enableSetting: "has_workshops",
        keywords: ["ورشة", "ورشات", "منجرة", "مناجر", "مطبخ", "خشب", "نجار"],
      },
      {
        id: "ecommerce", label: "إدارة المتاجر الإلكترونية", description: "إدارة مالية للمتاجر والصفحات الإلكترونية", module: "sales", icon: Store,
        color: "text-amber-500", bgColor: "bg-amber-500/10", path: "/orders", isDirect: true,
        enableSetting: "has_ecommerce",
        keywords: ["متجر", "طلبات", "إلكتروني"],
      },
      {
        id: "tasks", label: "إدارة المهام", description: "تنظيم المهام، التكليفات، والمتابعة", module: "tasks", icon: ClipboardList,
        color: "text-sky-400", bgColor: "bg-sky-400/10", path: "/tasks", isDirect: true,
        enableSetting: "has_tasks",
        keywords: ["مهام", "تكليف", "متابعة", "tasks"],
      },
      {
        id: "travel", label: "إدارة مالية السياحة والسفر", description: "حجوزات، موردون، عمولات، وأرباح", module: "travel", icon: Plane,
        color: "text-cyan-600", bgColor: "bg-cyan-500/10", path: "/travel",
        enableSetting: "has_travel",
        keywords: ["سياحة", "سفر", "حجز", "طيران", "فندق", "عمرة", "حج", "travel"],
        groups: [
          {
            groupLabel: "الحجوزات",
            children: [
              { label: "لوحة التحكم", path: "/travel" },
              { label: "الحجوزات", path: "/travel/bookings" },
              { label: "حجز جديد", path: "/travel/bookings/new" },
            ],
          },
          {
            groupLabel: "الإدارة",
            children: [
              { label: "الموردون", path: "/travel/suppliers" },
              { label: "الباقات والعروض", path: "/travel/packages" },
              { label: "التقارير", path: "/travel/reports" },
              { label: "إعدادات السياحة", path: "/travel/settings" },
            ],
          },
        ],
      },
    ],
  },

  /* ══ الذكاء والتقارير ══ */
  {
    sectionTitle: "الذكاء والتقارير",
    items: [
      {
        id: "reports", label: "التقارير", description: "أرباح وخسائر، ميزانية عمومية، وتحليلات مالية", module: "reports", icon: BarChart3,
        color: "text-rose-500", bgColor: "bg-rose-500/10", path: "/reports",
        keywords: ["تقارير", "تحليل", "أرباح", "خسائر", "ميزانية"],
        groups: [
          {
            groupLabel: "القوائم المالية",
            children: [
              { label: "الأرباح والخسائر", path: "/profit-loss" },
              { label: "الميزانية العمومية", path: "/balance-sheet" },
              { label: "ميزان المراجعة", path: "/trial-balance" },
            ],
          },
          {
            groupLabel: "كل التقارير",
            children: [
              { label: "مكتبة التقارير", path: "/reports" },
              { label: "منشئ التقارير", path: "/reports/builder" },
              { label: "تقاريري المحفوظة", path: "/reports/my-reports" },
            ],
          },
        ],
      },
      {
        id: "dashboards", label: "لوحات التحكم", description: "لوحات قابلة للتخصيص والمشاركة", module: "dashboard", icon: LayoutDashboard,
        color: "text-indigo-500", bgColor: "bg-indigo-500/10",
        path: "/dashboards", isDirect: true,
        keywords: ["لوحات", "تحكم", "widgets", "dashboards", "مخصص"],
      },
    ],
  },

  /* ══ الموارد البشرية ══ */
  {
    sectionTitle: "الموارد البشرية",
    items: [
      {
        id: "hr", label: "الموارد البشرية", description: "لوحة قيادة، موظفون، إعدادات", module: "hr", icon: Users,
        color: "text-violet-500", bgColor: "bg-violet-500/10", path: "/hr",
        enableSetting: "has_employees",
        keywords: [
          "موظف", "حضور", "رواتب", "موارد", "hr",
          "إجازات", "سلف", "قروض", "خصومات", "بصمة", "بصمتي",
          "مدخلات الرواتب", "إعدادات الرواتب", "إعدادات HR",
        ],
        isDirect: true,
      },
    ],
  },

  /* ══ النظام ══ */
  {
    sectionTitle: "النظام",
    items: [
      {
        id: "settings", label: "الإعدادات", description: "إعدادات النظام والملف الشخصي", module: "settings", icon: Settings,
        color: "text-muted-foreground", bgColor: "bg-muted", path: "/settings",
        keywords: ["إعدادات", "ملف", "شخصي"],
        groups: [
          {
            groupLabel: "النظام",
            children: [
              { label: "الإعدادات", path: "/settings" },
              { label: "الاشتراكات", path: "/subscription" },
              { label: "التخصيص والدعم الفني", path: "/customization" },
            ],
          },
          {
            groupLabel: "الأدوات",
            children: [
              { label: "استيراد بيانات خارجية", path: "/opening-balances-import" },
            ],
          },
        ],
      },
    ],
  },
];

/* ── Helper: flatten all children for a NavItem ── */
export function getAllChildren(item: NavItem): NavChild[] {
  if (!item.groups) return [];
  return item.groups.flatMap(g => g.children);
}

/* ── Helper: get sections for apps (skip first "apps" link) ── */
export function getAppSections(): NavSection[] {
  return navigationSections.map(s => ({
    ...s,
    items: s.items.filter(i => i.id !== "apps"),
  })).filter(s => s.items.length > 0);
}
