import { useState, useEffect, useCallback } from "react";
import {
  FileText, Wallet, Landmark, ClipboardList, Receipt, Users, Package,
  BarChart3, UserCheck, Zap, Settings2, GripVertical, X, Keyboard,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";

export interface QuickAction {
  id: string;
  label: string;
  icon: any;
  shortcut?: string;
  action: string; // 'navigate' | 'modal'
  target?: string; // path or modal id
  enabled: boolean;
}

const ALL_ACTIONS: QuickAction[] = [
  { id: "invoice", label: "فاتورة", icon: FileText, shortcut: "F3", action: "navigate", target: "/invoices", enabled: true },
  { id: "receipt", label: "سند قبض", icon: Landmark, shortcut: "F1", action: "navigate", target: "/transactions", enabled: true },
  { id: "payment", label: "سند صرف", icon: Wallet, shortcut: "F2", action: "navigate", target: "/transactions", enabled: true },
  { id: "journal", label: "سند قيد", icon: ClipboardList, shortcut: "F4", action: "modal", target: "journal", enabled: true },
  { id: "cheque", label: "شيك", icon: Receipt, shortcut: "F8", action: "navigate", target: "/cheques", enabled: true },
  { id: "account_statement", label: "كشف حساب", icon: BarChart3, shortcut: "F6", action: "modal", target: "account_statement", enabled: true },
  { id: "contact_statement", label: "كشف شخصي", icon: UserCheck, shortcut: "F5", action: "modal", target: "contact_statement", enabled: true },
  { id: "new_client", label: "عميل جديد", icon: Users, action: "navigate", target: "/contacts", enabled: false },
  { id: "new_product", label: "منتج جديد", icon: Package, action: "navigate", target: "/inventory", enabled: false },
];

const STORAGE_KEY = "quick_actions_config";

function loadConfig(): QuickAction[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const ids: { id: string; enabled: boolean }[] = JSON.parse(saved);
      return ALL_ACTIONS.map(a => {
        const found = ids.find(i => i.id === a.id);
        return found ? { ...a, enabled: found.enabled } : a;
      });
    }
  } catch {}
  return ALL_ACTIONS;
}

function saveConfig(actions: QuickAction[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(actions.map(a => ({ id: a.id, enabled: a.enabled }))));
}

interface QuickActionsBarProps {
  onAction: (actionTarget: string) => void;
  isMobile?: boolean;
  onShowShortcuts?: () => void;
}

const QuickActionsBar = ({ onAction, isMobile, onShowShortcuts }: QuickActionsBarProps) => {
  const navigate = useNavigate();
  const [actions, setActions] = useState<QuickAction[]>(loadConfig);
  const [showCustomize, setShowCustomize] = useState(false);

  const enabledActions = actions.filter(a => a.enabled);

  const handleClick = (action: QuickAction) => {
    if (action.action === "navigate" && action.target) {
      navigate(action.target);
    } else if (action.action === "modal" && action.target) {
      onAction(action.target);
    }
  };

  const toggleAction = (id: string) => {
    setActions(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a);
      saveConfig(updated);
      return updated;
    });
  };

  const resetActions = () => {
    setActions(ALL_ACTIONS);
    saveConfig(ALL_ACTIONS);
  };

  return (
    <>
      <div className="bg-card rounded-2xl p-4 shadow-card border border-border/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Zap className="h-3.5 w-3.5 text-primary" />
            </div>
            <span className="text-sm font-bold text-foreground">إجراء سريع</span>
          </div>
          <div className="flex items-center gap-1">
            {!isMobile && onShowShortcuts && (
              <button
                onClick={onShowShortcuts}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary/60 transition-colors text-muted-foreground"
                title="اختصارات لوحة المفاتيح"
              >
                <Keyboard className="h-3.5 w-3.5" />
                <span className="text-[11px]">⌨️</span>
              </button>
            )}
            <button
              onClick={() => setShowCustomize(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-secondary/60 transition-colors text-muted-foreground"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="text-[11px]">تخصيص</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {enabledActions.map((action) => (
            <button
              key={action.id}
              onClick={() => handleClick(action)}
              className="relative group flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary/50 text-[13px] font-medium text-foreground hover:bg-secondary hover:shadow-sm transition-all active:scale-[0.97]"
            >
              <action.icon className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" strokeWidth={1.8} />
              {action.label}
              {action.shortcut && !isMobile && (
                <kbd className="absolute -top-1.5 -left-1 text-[9px] bg-primary/10 text-primary border border-primary/20 rounded px-1 font-mono leading-tight opacity-0 group-hover:opacity-100 transition-opacity">
                  {action.shortcut}
                </kbd>
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
              تخصيص الاختصارات السريعة
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">اختر الاختصارات التي تريد إظهارها</p>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {actions.map((action) => (
              <div
                key={action.id}
                className="flex items-center justify-between px-3 py-3 rounded-xl hover:bg-secondary/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <action.icon className="h-4 w-4 text-muted-foreground" strokeWidth={1.8} />
                  <span className="text-sm text-foreground">{action.label}</span>
                  {action.shortcut && (
                    <kbd className="text-[10px] bg-secondary border border-border rounded px-1.5 py-0.5 font-mono text-muted-foreground">
                      {action.shortcut}
                    </kbd>
                  )}
                </div>
                <Switch
                  checked={action.enabled}
                  onCheckedChange={() => toggleAction(action.id)}
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border/30">
            <button onClick={resetActions} className="text-xs text-muted-foreground hover:text-foreground transition-colors">
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

export default QuickActionsBar;
