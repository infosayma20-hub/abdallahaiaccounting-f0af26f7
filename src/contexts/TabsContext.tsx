import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, FileText, Users, Wallet, CreditCard, Package,
  BarChart3, Settings, Receipt, BookOpen, Landmark, Banknote,
  ShoppingCart, TrendingUp, Calculator, ClipboardList, Building2,
  UserCheck, DollarSign, Briefcase, PieChart, Store, Bot,
  Globe, Layers
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
  "/finance/journals": { title: "القيود اليدوية", icon: "clipboard" },
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
  "/cheques": { title: "الشيكات", icon: "credit" },
  "/employees": { title: "الموظفين", icon: "usercheck" },
  "/payroll": { title: "الرواتب", icon: "dollar" },
  "/hr-attendance": { title: "الحضور", icon: "usercheck" },
  "/leaves": { title: "الإجازات", icon: "usercheck" },
  "/advances": { title: "السلف", icon: "dollar" },
  "/loans": { title: "القروض", icon: "dollar" },
  "/orders": { title: "الطلبات", icon: "cart" },
  "/pos": { title: "نقطة البيع", icon: "cart" },
  "/settings": { title: "الإعدادات", icon: "settings" },
  "/profile": { title: "الملف الشخصي", icon: "settings" },
  "/billing": { title: "الاشتراك", icon: "dollar" },
  "/sales-reps": { title: "مندوبين المبيعات", icon: "users" },
  "/fixed-assets": { title: "الأصول الثابتة", icon: "briefcase" },
  "/currency-management": { title: "العملات", icon: "dollar" },
  "/export": { title: "التصدير", icon: "file" },
  "/opening-balances-import": { title: "أرصدة افتتاحية", icon: "file" },
  "/finance/receipt/new": { title: "سند قبض جديد", icon: "landmark" },
  "/finance/payment/new": { title: "سند صرف جديد", icon: "banknote" },
  "/finance/journal/new": { title: "قيد جديد", icon: "clipboard" },
  "/tax": { title: "المحاسبة الضريبية", icon: "calculator" },
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
};

function getRouteMeta(path: string): { title: string; icon: string } {
  // Exact match
  if (ROUTE_META[path]) return ROUTE_META[path];
  // Strip query/hash
  const clean = path.split("?")[0].split("#")[0];
  if (ROUTE_META[clean]) return ROUTE_META[clean];
  // Try parent path
  const parts = clean.split("/").filter(Boolean);
  while (parts.length > 1) {
    parts.pop();
    const parent = "/" + parts.join("/");
    if (ROUTE_META[parent]) return { ...ROUTE_META[parent], title: ROUTE_META[parent].title };
  }
  return { title: clean.replace(/\//g, " ").trim() || "صفحة", icon: "file" };
}

const STORAGE_KEY = "amwali-open-tabs";

function loadTabs(): AppTab[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [];
}

function saveTabs(tabs: AppTab[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs)); } catch {}
}

// Pages that should NOT open as tabs
const EXCLUDED_PATHS = ["/auth", "/onboarding", "/setup", "/reset-password", "/terms", "/privacy", "/pricing"];

export function TabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<AppTab[]>(loadTabs);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  // Sync active tab with current route
  useEffect(() => {
    const currentPath = location.pathname;
    if (EXCLUDED_PATHS.some(p => currentPath.startsWith(p))) return;

    const existing = tabs.find(t => t.path === currentPath);
    if (existing) {
      setActiveTabId(existing.id);
    } else {
      // Auto-open a tab for the current route
      const meta = getRouteMeta(currentPath);
      const newTab: AppTab = {
        id: crypto.randomUUID(),
        path: currentPath,
        title: meta.title,
        icon: meta.icon,
      };
      setTabs(prev => {
        const next = [...prev, newTab];
        saveTabs(next);
        return next;
      });
      setActiveTabId(newTab.id);
    }
  }, [location.pathname]);

  const openTab = useCallback((path: string, title?: string) => {
    const existing = tabs.find(t => t.path === path);
    if (existing) {
      setActiveTabId(existing.id);
      navigate(path);
      return;
    }
    const meta = getRouteMeta(path);
    const newTab: AppTab = {
      id: crypto.randomUUID(),
      path,
      title: title || meta.title,
      icon: meta.icon,
    };
    setTabs(prev => {
      const next = [...prev, newTab];
      saveTabs(next);
      return next;
    });
    setActiveTabId(newTab.id);
    navigate(path);
  }, [tabs, navigate]);

  const closeTab = useCallback((id: string) => {
    setTabs(prev => {
      const idx = prev.findIndex(t => t.id === id);
      if (idx === -1) return prev;
      const next = prev.filter(t => t.id !== id);
      saveTabs(next);

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
  }, [activeTabId, navigate]);

  const switchTab = useCallback((id: string) => {
    const tab = tabs.find(t => t.id === id);
    if (tab) {
      setActiveTabId(id);
      navigate(tab.path);
    }
  }, [tabs, navigate]);

  const closeOtherTabs = useCallback((id: string) => {
    setTabs(prev => {
      const next = prev.filter(t => t.id === id);
      saveTabs(next);
      return next;
    });
  }, []);

  const closeAllTabs = useCallback(() => {
    setTabs([]);
    saveTabs([]);
    setActiveTabId(null);
    navigate("/apps");
  }, [navigate]);

  return (
    <TabsContext.Provider value={{ tabs, activeTabId, openTab, closeTab, switchTab, closeOtherTabs, closeAllTabs }}>
      {children}
    </TabsContext.Provider>
  );
}
