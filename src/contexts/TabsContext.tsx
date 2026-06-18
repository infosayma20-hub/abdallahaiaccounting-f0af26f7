import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, useNavigate } from "react-router-dom";
import { discardActiveDraft, hasActiveDraft } from "@/lib/draftRegistry";
import {
  LayoutDashboard, FileText, Users, Wallet, CreditCard, Package,
  BarChart3, Settings, Receipt, BookOpen, Landmark, Banknote,
  ShoppingCart, TrendingUp, Calculator, ClipboardList, Building2,
  UserCheck, DollarSign, Briefcase, PieChart, Store, Bot,
  Globe, Layers, Bell
} from "lucide-react";

export interface AppTab {
  id: string;
  path: string;
  title: string;
  icon: string; // icon key
  pinned?: boolean;
}

interface TabsContextType {
  tabs: AppTab[];
  activeTabId: string | null;
  openTab: (path: string, title?: string) => void;
  closeTab: (id: string) => void;
  switchTab: (id: string) => void;
  closeOtherTabs: (id: string) => void;
  closeAllTabs: () => void;
}

const TabsContext = createContext<TabsContextType | null>(null);

export const useAppTabs = () => {
  const ctx = useContext(TabsContext);
  if (!ctx) throw new Error("useAppTabs must be inside TabsProvider");
  return ctx;
};

// Route → display name + icon key mapping
const ROUTE_META: Record<string, { title: string; icon: string }> = {
  "/apps": { title: "التطبيقات", icon: "layers" },
  "/dashboard": { title: "لوحة التحكم", icon: "dashboard" },
  "/smart-accountant": { title: "المحاسب الذكي", icon: "bot" },
  "/invoices": { title: "الفواتير", icon: "file" },
  "/invoices/new": { title: "فاتورة جديدة", icon: "file" },
  "/contacts": { title: "جهات الاتصال", icon: "users" },
  "/accounts": { title: "شجرة الحسابات", icon: "wallet" },
  "/transactions": { title: "دفتر اليومية", icon: "book" },
  "/finance/receipts": { title: "سندات القبض", icon: "landmark" },
  "/finance/payments": { title: "سندات الصرف", icon: "banknote" },
  "/finance/journals": { title: "القيود اليومية", icon: "clipboard" },
  "/finance/cheques": { title: "الشيكات", icon: "credit" },
  "/finance/bank-accounts": { title: "الحسابات البنكية", icon: "building" },
  "/finance/cash-boxes": { title: "الصناديق", icon: "banknote" },
  "/finance/cash-boxes/transfer": { title: "تحويل بين الصناديق", icon: "banknote" },
  "/inventory": { title: "المخزون", icon: "package" },
  "/inventory-movements": { title: "حركة المخزون", icon: "package" },
  "/inventory-valuation": { title: "تقييم المخزون", icon: "package" },
  "/profit-loss": { title: "الأرباح والخسائر", icon: "chart" },
  "/balance-sheet": { title: "الميزانية", icon: "chart" },
  "/trial-balance": { title: "ميزان المراجعة", icon: "trending" },
  "/general-ledger": { title: "دفتر الأستاذ", icon: "book" },
  "/account-statement": { title: "كشف حساب", icon: "chart" },
  "/reports": { title: "التقارير", icon: "pie" },
  "/smart-report": { title: "تقرير ذكي", icon: "pie" },
  "/reports/builder": { title: "منشئ التقارير", icon: "pie" },
  "/reports/my-reports": { title: "تقاريري", icon: "pie" },
  "/reports/van-sales": { title: "تقارير البائع المتجول", icon: "pie" },
  "/dashboards": { title: "لوحات المعلومات", icon: "dashboard" },
  "/cheques": { title: "الشيكات", icon: "credit" },
  "/hr": { title: "الموارد البشرية", icon: "users" },
  "/hr/people": { title: "الموظفون", icon: "usercheck" },
  "/hr/settings": { title: "إعدادات الموارد البشرية", icon: "settings" },
  "/employees": { title: "الموظفين", icon: "usercheck" },
  "/payroll": { title: "الرواتب", icon: "dollar" },
  "/hr-attendance": { title: "الحضور", icon: "usercheck" },
  "/attendance/roster": { title: "جدول الدوام", icon: "usercheck" },
  "/manager/roster": { title: "جدول الدوام", icon: "usercheck" },
  "/manager/rep-reports": { title: "تقارير البائع المتجول", icon: "truck" },
  "/leaves": { title: "الإجازات", icon: "usercheck" },
  "/advances": { title: "السلف", icon: "dollar" },
  "/loans": { title: "القروض", icon: "dollar" },
  "/orders": { title: "الطلبات", icon: "cart" },
  "/pos": { title: "نقطة البيع", icon: "cart" },
  "/settings": { title: "الإعدادات", icon: "settings" },
  "/profile": { title: "الملف الشخصي", icon: "settings" },
  
  "/sales-reps": { title: "مندوبين المبيعات", icon: "users" },
  "/admin/sales-rep-orders": { title: "طلبيات المندوبين", icon: "truck" },
  "/admin/rep-unposted-orders": { title: "طلبات مندوب غير مرحّلة", icon: "truck" },
  "/admin/sales-reps-live": { title: "متابعة المندوبين", icon: "truck" },
  "/admin/notifications": { title: "مركز الإشعارات", icon: "bell" },
  "/accounting-center": { title: "مركز المالية", icon: "calculator" },
  "/warehouses": { title: "المستودعات", icon: "package" },
  "/stock-transfers": { title: "سندات تحويل المخزون", icon: "package" },
  "/van-days": { title: "دورة يوم البائع المتجول", icon: "truck" },
  "/rep": { title: "تطبيق المندوب", icon: "truck" },
  "/van-commissions": { title: "عمولات البائعين المتجولين", icon: "calculator" },
  "/van-reports": { title: "تقارير البائعين المتجولين", icon: "bar-chart-3" },
  "/fixed-assets": { title: "الأصول الثابتة", icon: "briefcase" },
  "/warranty": { title: "إدارة الكفالات", icon: "shield" },
  "/warranty/policies": { title: "سياسات الكفالة", icon: "shield" },
  "/warranty/cards": { title: "بطاقات الكفالة", icon: "shield" },
  "/warranty/claims": { title: "مطالبات الكفالة", icon: "shield" },
  "/warranty/supplier-claims": { title: "مطالبات الشركة الأم", icon: "shield" },
  "/warranty/reports": { title: "تقارير الكفالات", icon: "shield" },
  "/currency-management": { title: "العملات", icon: "dollar" },
  "/export": { title: "التصدير", icon: "file" },
  "/opening-balances-import": { title: "أرصدة افتتاحية", icon: "file" },
  "/finance/receipt/new": { title: "سند قبض جديد", icon: "landmark" },
  "/finance/payment/new": { title: "سند صرف جديد", icon: "banknote" },
  "/finance/journal/new": { title: "قيد يومي جديد", icon: "clipboard" },
  "/finance/cost-centers": { title: "مراكز التكلفة", icon: "briefcase" },
  "/tax": { title: "المحاسبة الضريبية", icon: "calculator" },
  "/menu": { title: "القائمة", icon: "layers" },
  "/voice": { title: "الإدخال الصوتي", icon: "file" },
  "/help": { title: "مركز المساعدة", icon: "file" },
  "/customization": { title: "التخصيص", icon: "settings" },
  "/customization/templates": { title: "قوالب الصناعة", icon: "settings" },
  "/customization/request": { title: "طلب تخصيص", icon: "settings" },
  "/support/tickets": { title: "تذاكر الدعم", icon: "file" },
  "/support/admin": { title: "إدارة الدعم", icon: "settings" },
  "/pos-users": { title: "مستخدمو نقطة البيع", icon: "users" },
  "/pos-customers": { title: "عملاء نقطة البيع", icon: "users" },
  "/pos-reports": { title: "تقارير نقطة البيع", icon: "chart" },
  "/reports/pos-invoice-register": { title: "كشف فواتير POS", icon: "cart" },
  "/reports/pos-daily-sales": { title: "مبيعات يومية POS", icon: "cart" },
  "/reports/pos-cancelled": { title: "فواتير POS الملغاة", icon: "cart" },
  "/reports/pos-payment-methods": { title: "طرق الدفع POS", icon: "cart" },
  "/reports/pos-cashier-performance": { title: "أداء الكاشير", icon: "cart" },
  "/reports/pos-shift-open-close": { title: "فتح وإغلاق الورديات", icon: "cart" },
  "/reports/pos-cash-reconciliation": { title: "تسوية الكاش", icon: "cart" },
  "/reports/pos-product-movement": { title: "حركة الأصناف POS", icon: "cart" },
  "/reports/pos-category-totals": { title: "إجماليات الفئات POS", icon: "cart" },
  "/reports/pos-sales-by-category": { title: "مبيعات حسب الفئة POS", icon: "cart" },
  "/reports/pos-period-comparison": { title: "مقارنة الفترات POS", icon: "cart" },
  "/reports/pos-pending-orders": { title: "فواتير POS معلقة", icon: "cart" },
  "/reports/pos-invoice-timing": { title: "أوقات الفواتير POS", icon: "cart" },
  "/reports/pos-credit-sales": { title: "مبيعات آجلة POS", icon: "cart" },
  "/reports/pos-peak-hours": { title: "ساعات الذروة POS", icon: "cart" },
  "/printer-settings": { title: "إعدادات الطابعة", icon: "settings" },
  "/call-center-reports": { title: "تقارير مركز الاتصال", icon: "chart" },
  "/feedback": { title: "متابعة الزبائن", icon: "phone" },
  "/customer-reports": { title: "تقارير العملاء", icon: "chart" },
  "/contractor": { title: "المقاولات", icon: "briefcase" },
  "/workshops": { title: "الورش", icon: "settings" },
  "/workshop-reports": { title: "تقارير الورش", icon: "chart" },
  "/tasks": { title: "المهام", icon: "clipboard" },
  "/tasks/board": { title: "لوحة المهام", icon: "clipboard" },
  "/tasks/admin": { title: "إدارة المهام", icon: "clipboard" },
  "/tasks/display": { title: "عرض المهام", icon: "clipboard" },
  "/travel": { title: "السفر والسياحة", icon: "globe" },
  "/travel/bookings": { title: "الحجوزات", icon: "globe" },
  "/travel/bookings/new": { title: "حجز جديد", icon: "globe" },
  "/travel/suppliers": { title: "موردو السفر", icon: "globe" },
  "/travel/packages": { title: "باقات السفر", icon: "globe" },
  "/travel/reports": { title: "تقارير السفر", icon: "globe" },
  "/travel/settings": { title: "إعدادات السفر", icon: "globe" },
  "/contracts": { title: "العقود", icon: "file" },
  "/contracts/new": { title: "عقد جديد", icon: "file" },
  "/purchases/import": { title: "الشحنات", icon: "package" },
  "/purchases/import/new": { title: "شحنة جديدة", icon: "package" },
  "/procurement/orders": { title: "أوامر الشراء", icon: "cart" },
  "/procurement/orders/new": { title: "أمر شراء جديد", icon: "cart" },
  "/procurement/invoices": { title: "فواتير المشتريات", icon: "file" },
  "/procurement/invoices/new": { title: "فاتورة مشتريات جديدة", icon: "file" },
  "/procurement/supplier-statement": { title: "كشف حساب مورد", icon: "chart" },
  "/procurement/weekly-report": { title: "التقرير الأسبوعي", icon: "chart" },
  "/procurement/settings": { title: "إعدادات المشتريات", icon: "settings" },
  "/print-preview": { title: "معاينة الطباعة", icon: "file" },
  "/print-templates": { title: "قوالب الطباعة", icon: "file" },
  "/employee-forms-management": { title: "نماذج الموظفين", icon: "usercheck" },
  "/my-attendance": { title: "حضوري", icon: "usercheck" },
  "/hr-deductions": { title: "الخصومات", icon: "dollar" },
  "/payroll/inputs": { title: "مدخلات الرواتب", icon: "dollar" },
  "/payroll-settings": { title: "إعدادات الرواتب", icon: "settings" },
  "/bills": { title: "الفواتير", icon: "file" },
  "/invoices/recurring": { title: "الفواتير المتكررة", icon: "file" },
  "/accounts/new": { title: "حساب جديد", icon: "wallet" },
  "/pos/floor-plan": { title: "مخطط الطاولات", icon: "cart" },
  "/pos/floor-plan/edit": { title: "تعديل المخطط", icon: "cart" },
  "/pos/modifiers": { title: "الإضافات", icon: "cart" },
  "/pos/kitchen": { title: "شاشة المطبخ", icon: "cart" },
  "/store-tracker": { title: "متتبع المتجر", icon: "cart" },
  "/super-admin/dashboard": { title: "لوحة الإدارة", icon: "settings" },
  "/delivery-notes": { title: "إرساليات المبيعات", icon: "package" },
  "/delivery-notes/new": { title: "إرسالية جديدة", icon: "package" },
  "/credit-notes": { title: "الإشعارات الدائنة", icon: "file" },
  "/credit-notes/new": { title: "إشعار دائن جديد", icon: "file" },
  "/debit-notes": { title: "الإشعارات المدينة", icon: "file" },
  "/debit-notes/new": { title: "إشعار مدين جديد", icon: "file" },
  "/crm": { title: "إدارة علاقات العملاء", icon: "users" },
  "/crm/leads": { title: "العملاء المحتملون", icon: "users" },
  "/crm/pipeline": { title: "خط سير المبيعات", icon: "trending" },
  "/crm/activities": { title: "متابعات العملاء", icon: "clipboard" },
  "/crm/customers": { title: "ملف العميل 360", icon: "users" },
  "/sales/returns": { title: "مردودات المبيعات", icon: "file" },
  "/sales/returns/new": { title: "مردود مبيعات جديد", icon: "file" },
  "/purchases/returns": { title: "مردودات المشتريات", icon: "file" },
  "/purchases/returns/new": { title: "مردود مشتريات جديد", icon: "file" },
};

export const ICON_MAP: Record<string, React.ElementType> = {
  dashboard: LayoutDashboard,
  file: FileText,
  users: Users,
  wallet: Wallet,
  credit: CreditCard,
  package: Package,
  chart: BarChart3,
  settings: Settings,
  receipt: Receipt,
  book: BookOpen,
  landmark: Landmark,
  banknote: Banknote,
  cart: ShoppingCart,
  trending: TrendingUp,
  calculator: Calculator,
  clipboard: ClipboardList,
  building: Building2,
  usercheck: UserCheck,
  dollar: DollarSign,
  briefcase: Briefcase,
  pie: PieChart,
  store: Store,
  bot: Bot,
  globe: Globe,
  layers: Layers,
  bell: Bell,
};

// أنماط ديناميكية: مسارات تحتوي على :id (UUID/رقم) — تستخرج العنوان من البادئة
const DYNAMIC_PATTERNS: Array<{ regex: RegExp; title: string; icon: string }> = [
  { regex: /^\/finance\/receipt\/[^/]+\/edit$/, title: "تعديل سند قبض", icon: "landmark" },
  { regex: /^\/finance\/payment\/[^/]+\/edit$/, title: "تعديل سند صرف", icon: "banknote" },
  { regex: /^\/finance\/journal\/[^/]+\/edit$/, title: "تعديل قيد", icon: "clipboard" },
  { regex: /^\/invoices\/[^/]+\/edit$/, title: "تعديل فاتورة", icon: "file" },
  { regex: /^\/invoices\/[^/]+$/, title: "تفاصيل فاتورة", icon: "file" },
  { regex: /^\/contacts\/[^/]+$/, title: "تفاصيل جهة اتصال", icon: "users" },
  { regex: /^\/employees\/[^/]+$/, title: "ملف موظف", icon: "usercheck" },
  { regex: /^\/contracts\/[^/]+$/, title: "تفاصيل عقد", icon: "file" },
  { regex: /^\/travel\/bookings\/[^/]+$/, title: "تفاصيل حجز", icon: "globe" },
  { regex: /^\/delivery-notes\/[^/]+$/, title: "تفاصيل إرسالية", icon: "package" },
  { regex: /^\/procurement\/orders\/[^/]+$/, title: "تفاصيل أمر شراء", icon: "cart" },
  { regex: /^\/procurement\/invoices\/[^/]+$/, title: "تفاصيل فاتورة مشتريات", icon: "file" },
  { regex: /^\/purchases\/import\/[^/]+$/, title: "تفاصيل شحنة", icon: "package" },
  { regex: /^\/accounts\/[^/]+$/, title: "تفاصيل حساب", icon: "wallet" },
  { regex: /^\/fixed-assets\/[^/]+$/, title: "تفاصيل أصل", icon: "briefcase" },
  { regex: /^\/pos\/invoice\/[^/]+$/, title: "تفاصيل فاتورة POS", icon: "cart" },
  { regex: /^\/crm\/customer\/[^/]+$/, title: "ملف العميل 360", icon: "users" },
  { regex: /^\/crm\/opportunity\/[^/]+$/, title: "تفاصيل الفرصة", icon: "trending" },
  { regex: /^\/crm\/lead\/[^/]+$/, title: "تفاصيل العميل المحتمل", icon: "users" },
  { regex: /^\/credit-notes\/[^/]+$/, title: "تفاصيل إشعار دائن", icon: "file" },
  { regex: /^\/debit-notes\/[^/]+$/, title: "تفاصيل إشعار مدين", icon: "file" },
  { regex: /^\/hr\/employee\/[^/]+$/, title: "ملف الموظف 360", icon: "users" },
  { regex: /^\/dashboards\/[^/]+$/, title: "لوحة معلومات", icon: "dashboard" },
];

function getRouteMeta(path: string): { title: string; icon: string } {
  // Exact match
  if (ROUTE_META[path]) return ROUTE_META[path];
  // Strip query/hash
  const clean = path.split("?")[0].split("#")[0];
  if (ROUTE_META[clean]) return ROUTE_META[clean];
  // Dynamic pattern match (مسارات تحتوي على id)
  for (const p of DYNAMIC_PATTERNS) {
    if (p.regex.test(clean)) return { title: p.title, icon: p.icon };
  }
  // Try parent path
  const parts = clean.split("/").filter(Boolean);
  while (parts.length > 1) {
    parts.pop();
    const parent = "/" + parts.join("/");
    if (ROUTE_META[parent]) return { ...ROUTE_META[parent], title: ROUTE_META[parent].title };
  }
  return { title: clean.replace(/\//g, " ").trim() || "صفحة", icon: "file" };
}

const STORAGE_KEY_PREFIX = "amwali-open-tabs";

function getStorageKey(userId?: string) {
  return userId ? `${STORAGE_KEY_PREFIX}_${userId}` : STORAGE_KEY_PREFIX;
}

function loadTabs(userId?: string): AppTab[] {
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed.filter((tab): tab is AppTab => {
        if (!tab || typeof tab !== "object") return false;
        if (typeof tab.id !== "string" || typeof tab.path !== "string") return false;
        if (tab.path === "/") return false;
        return true;
      });
    }
  } catch {}
  return [];
}

function saveTabs(tabs: AppTab[], userId?: string) {
  try { localStorage.setItem(getStorageKey(userId), JSON.stringify(tabs)); } catch {}
}

// Pages that should NOT open as tabs
const EXCLUDED_PATHS = ["/", "/auth", "/onboarding", "/setup", "/reset-password", "/terms", "/privacy", "/pricing", "/billing", "/subscription"];

function isExcludedPath(path: string) {
  return EXCLUDED_PATHS.some(p => path === p || (p !== "/" && path.startsWith(p)));
}

export function TabsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id;
  const prevUserIdRef = useRef<string | undefined>(undefined);
  const [tabs, setTabs] = useState<AppTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Load/reset tabs when user changes (including initial load)
  useEffect(() => {
    if (prevUserIdRef.current !== userId) {
      prevUserIdRef.current = userId;
      if (userId) {
        const userTabs = loadTabs(userId);
        // Filter out excluded/legacy paths (e.g. /billing, /subscription, /pricing)
        const cleaned = userTabs.filter(t => !isExcludedPath(t.path));
        if (cleaned.length !== userTabs.length) saveTabs(cleaned, userId);
        setTabs(cleaned);
      } else {
        setTabs([]);
      }
      setActiveTabId(null);
    }
  }, [userId]);

  // Sync active tab with current route — atomic to prevent duplicates
  useEffect(() => {
    const currentPath = location.pathname;
    if (isExcludedPath(currentPath)) return;

    const meta = getRouteMeta(currentPath);

    setTabs(prev => {
      const existing = prev.find(t => t.path === currentPath);
      if (existing) {
        // Always sync activeTabId to match current route (fixes stale active state)
        setActiveTabId(existing.id);
        if (existing.title !== meta.title || existing.icon !== meta.icon) {
          const next = prev.map(t => t.id === existing.id ? { ...t, title: meta.title, icon: meta.icon } : t);
          saveTabs(next, userId);
          return next;
        }
        return prev;
      }
      const newTab: AppTab = {
        id: crypto.randomUUID(),
        path: currentPath,
        title: meta.title,
        icon: meta.icon,
      };
      setActiveTabId(newTab.id);
      const next = [...prev, newTab];
      saveTabs(next, userId);
      return next;
    });
  }, [location.pathname, userId]);

  const openTab = useCallback((path: string, title?: string) => {
    if (isExcludedPath(path)) {
      navigate(path);
      return;
    }

    const meta = getRouteMeta(path);
    let resolvedId: string | null = null;

    setTabs(prev => {
      const existing = prev.find(t => t.path === path);
      if (existing) {
        resolvedId = existing.id;
        return prev;
      }
      const newTab: AppTab = {
        id: crypto.randomUUID(),
        path,
        title: title || meta.title,
        icon: meta.icon,
      };
      resolvedId = newTab.id;
      const next = [...prev, newTab];
      saveTabs(next, userId);
      return next;
    });

    if (resolvedId) setActiveTabId(resolvedId);
    navigate(path);
  }, [navigate, userId]);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx === -1) return prev;
      const closingTab = prev[idx];
      // تأكيد عند وجود مسودة غير محفوظة
      if (closingTab && hasActiveDraft(closingTab.path)) {
        const ok = window.confirm(
          `يوجد بيانات غير محفوظة في "${closingTab.title}".\nهل تريد إغلاق التبويب وفقدان التغييرات؟`
        );
        if (!ok) return prev;
        discardActiveDraft(closingTab.path);
      }
      const next = prev.filter(t => t.id !== id);
      saveTabs(next, userId);

      // If closing the active tab, switch to an adjacent one
      if (activeTabId === id && next.length > 0) {
        const newIdx = Math.min(idx, next.length - 1);
        setActiveTabId(next[newIdx].id);
        navigate(next[newIdx].path);
      } else if (next.length === 0) {
        setActiveTabId(null);
        navigate("/apps");
      }
      return next;
    });
  }, [activeTabId, navigate, userId]);

  const switchTab = useCallback((id: string) => {
    const tab = tabs.find(t => t.id === id);
    if (tab) {
      setActiveTabId(id);
      navigate(tab.path);
    }
  }, [tabs, navigate]);

  const closeOtherTabs = useCallback((id: string) => {
    setTabs(prev => {
      // تحقق من وجود مسودات في التبويبات التي ستُغلق
      const toClose = prev.filter(t => t.id !== id);
      const draftTabs = toClose.filter(t => hasActiveDraft(t.path));
      if (draftTabs.length > 0) {
        const titles = draftTabs.map(t => `• ${t.title}`).join("\n");
        const ok = window.confirm(
          `يوجد بيانات غير محفوظة في:\n${titles}\n\nهل تريد إغلاقها وفقدان التغييرات؟`
        );
        if (!ok) return prev;
        draftTabs.forEach(t => discardActiveDraft(t.path));
      }
      const next = prev.filter(t => t.id === id);
      saveTabs(next, userId);
      return next;
    });
  }, [userId]);

  const closeAllTabs = useCallback(() => {
    const draftTabs = tabs.filter(t => hasActiveDraft(t.path));
    if (draftTabs.length > 0) {
      const titles = draftTabs.map(t => `• ${t.title}`).join("\n");
      const ok = window.confirm(
        `يوجد بيانات غير محفوظة في:\n${titles}\n\nهل تريد إغلاق كل التبويبات وفقدان التغييرات؟`
      );
      if (!ok) return;
      draftTabs.forEach(t => discardActiveDraft(t.path));
    }
    setTabs([]);
    saveTabs([], userId);
    setActiveTabId(null);
    navigate("/apps");
  }, [navigate, userId, tabs]);

  return (
    <TabsContext.Provider value={{ tabs, activeTabId, openTab, closeTab, switchTab, closeOtherTabs, closeAllTabs }}>
      {children}
    </TabsContext.Provider>
  );
}
