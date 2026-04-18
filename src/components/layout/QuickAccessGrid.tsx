import { useState } from "react";
import amwaliMarkNavy from "@/assets/amwali-mark-navy.png";
import { useNavigate } from "react-router-dom";
import { Zap, Settings2, FileText, Landmark, Wallet, ClipboardList, Users, Store, BarChart3, Banknote, Package, Receipt, Calculator, Building2, CreditCard, TrendingUp, BookOpen, ShoppingCart, Shield, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useLockedModules } from "@/hooks/useLockedModules";
import { toast } from "@/hooks/use-toast";

export interface QuickAccessItem {
  id: string;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
  path: string;
  enabled: boolean;
  adminOnly?: boolean;
}

const ALL_ITEMS: QuickAccessItem[] = [
  { id: "invoice", label: "فاتورة جديدة", icon: FileText, shortcut: "Alt+I", path: "/invoices/new", enabled: true },
  { id: "receipt", label: "سند قبض", icon: Landmark, shortcut: "Alt+R", path: "/finance/receipt/new", enabled: true },
  { id: "payment", label: "سند صرف", icon: Wallet, shortcut: "Alt+E", path: "/finance/payment/new", enabled: true },
  { id: "journal", label: "سند قيد", icon: ClipboardList, shortcut: "Alt+J", path: "/finance/journal/new", enabled: true },
  { id: "customers", label: "زبائن", icon: Users, shortcut: "Alt+C", path: "/contacts?type=customer", enabled: true },
  { id: "suppliers", label: "موردين", icon: Store, shortcut: "Alt+M", path: "/contacts?type=supplier", enabled: true },
  { id: "account_stmt", label: "كشف حساب", icon: BarChart3, shortcut: "Alt+K", path: "/account-statement", enabled: true },
  { id: "pos", label: "نقطة البيع", icon: ShoppingCart, path: "/pos", enabled: true },
  // Extra items for customization
  { id: "cash_boxes", label: "الصناديق", icon: Banknote, shortcut: "Alt+S", path: "/finance/cash-boxes", enabled: false },
  { id: "inventory", label: "المخزون", icon: Package, shortcut: "Alt+I", path: "/inventory", enabled: false },
  { id: "cheques", label: "الشيكات", icon: Receipt, shortcut: "Alt+Q", path: "/finance/cheques", enabled: false },
  { id: "trial_balance", label: "ميزان المراجعة", icon: Calculator, shortcut: "Alt+T", path: "/trial-balance", enabled: false },
  { id: "banks", label: "البنوك", icon: Building2, path: "/finance/bank-accounts", enabled: false },
  { id: "reports", label: "التقارير", icon: TrendingUp, path: "/reports", enabled: false },
  { id: "journal_entries", label: "دفتر اليومية", icon: BookOpen, shortcut: "Alt+L", path: "/journal-entries", enabled: false },
  { id: "general_ledger", label: "دفتر الأستاذ", icon: BookOpen, path: "/general-ledger", enabled: false },
  { id: "expenses", label: "المصروفات", icon: CreditCard, path: "/transactions?type=expense", enabled: false },
  { id: "balance_sheet", label: "الميزانية العمومية", icon: TrendingUp, path: "/balance-sheet", enabled: false },
  // Admin only
  { id: "super_admin", label: "لوحة التحكم", icon: Shield, shortcut: "Alt+A", path: "/super-admin/dashboard", enabled: false, adminOnly: true },
];

const STORAGE_KEY = "quick_access_grid_config";

function loadConfig(): QuickAccessItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const ids: { id: string; enabled: boolean }[] = JSON.parse(saved);
      return ALL_ITEMS.map(a => {
        const found = ids.find(i => i.id === a.id);
        return found ? { ...a, enabled: found.enabled } : a;
      });
    }
  } catch {}
  return ALL_ITEMS;
}

function saveConfig(items: QuickAccessItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items.map(a => ({ id: a.id, enabled: a.enabled }))));
}

interface QuickAccessGridProps {
  collapsed: boolean;
  isSuperAdmin?: boolean;
}

const QuickAccessGrid = ({ collapsed, isSuperAdmin = false }: QuickAccessGridProps) => {
  const navigate = useNavigate();
  const [items, setItems] = useState<QuickAccessItem[]>(loadConfig);
  const [showCustomize, setShowCustomize] = useState(false);
  const { isRouteLocked, getLockedModuleName } = useLockedModules();

  const handleNavigate = (path: string) => {
    if (!isSuperAdmin && isRouteLocked(path)) {
      toast({ title: "🔒 موديل مقفل", description: `${getLockedModuleName(path)} غير متاح في حسابك الحالي`, variant: "destructive" });
      return;
    }
    navigate(path);
  };

  // Filter out admin-only items if user is not super admin
  const visibleItems = isSuperAdmin 
    ? items 
    : items.filter(item => !item.adminOnly);

  const enabled = visibleItems.filter(a => a.enabled).slice(0, 8);

  const toggleItem = (id: string) => {
    setItems(prev => {
      const enabledCount = prev.filter(i => i.enabled).length;
      const item = prev.find(i => i.id === id);
      if (item?.enabled || enabledCount < 8) {
        const updated = prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a);
        saveConfig(updated);
        return updated;
      }
      return prev;
    });
  };

  const resetItems = () => {
    setItems(ALL_ITEMS);
    saveConfig(ALL_ITEMS);
  };

  if (collapsed) return null;

  return (
    <>
      <div className="px-3 mb-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-2 px-1">
          <div className="flex items-center gap-1.5">
            <img src={amwaliMarkNavy} alt="أموالي" className="h-4 w-4 object-contain" />
            <span className="text-[11px] font-bold text-sidebar-foreground">وصول سريع</span>
          </div>
          <button
            onClick={() => setShowCustomize(true)}
            className="text-[10px] text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors flex items-center gap-1"
          >
            <Settings2 className="h-3 w-3" />
            تخصيص
          </button>
        </div>

        {/* 2×4 Grid */}
        <div className="grid grid-cols-2 gap-1.5">
          {enabled.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.path)}
              className="flex flex-col items-center gap-1 p-2 rounded-lg transition-all duration-150 group"
              style={{
                background: "rgba(255,255,255,0.05)",
                border: "0.5px solid rgba(255,255,255,0.1)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(74,158,232,0.12)";
                e.currentTarget.style.borderColor = "rgba(74,158,232,0.4)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";
              }}
            >
              <item.icon className="h-4 w-4 text-sidebar-foreground/70 group-hover:text-[#4A9EE8] transition-colors" strokeWidth={1.6} />
              <span className="text-[11px] text-white/90 leading-tight text-center">{item.label}</span>
              {item.shortcut && (
                <span className="text-[9px] font-mono leading-none" style={{ color: "#4A9EE8" }}>
                  {item.shortcut}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Customize Dialog */}
      <Dialog open={showCustomize} onOpenChange={setShowCustomize}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="h-5 w-5 text-primary" />
              تخصيص الوصول السريع
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">اختر حتى 8 اختصارات للعرض في الشريط الجانبي</p>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <item.icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} />
                  <span className="text-sm text-foreground">{item.label}</span>
                  {item.shortcut && (
                    <kbd className="text-[10px] bg-secondary border border-border rounded px-1.5 py-0.5 font-mono text-muted-foreground">
                      {item.shortcut}
                    </kbd>
                  )}
                </div>
                <Switch
                  checked={item.enabled}
                  onCheckedChange={() => toggleItem(item.id)}
                  disabled={!item.enabled && items.filter(i => i.enabled).length >= 8}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border/30">
            <button onClick={resetItems} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
              إعادة تعيين
            </button>
            <button
              onClick={() => setShowCustomize(false)}
              className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all"
            >
              حفظ
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default QuickAccessGrid;
