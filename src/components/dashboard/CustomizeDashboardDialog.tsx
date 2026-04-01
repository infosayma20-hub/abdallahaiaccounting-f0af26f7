import { useState, useEffect } from "react";
import { X, GripVertical, Eye, EyeOff } from "lucide-react";

export interface DashboardWidgetConfig {
  id: string;
  label: string;
  visible: boolean;
}

const DEFAULT_WIDGETS: DashboardWidgetConfig[] = [
  { id: "kpis", label: "مؤشرات الأداء", visible: true },
  { id: "revenue-chart", label: "الإيرادات مقابل المصروفات", visible: true },
  { id: "recent-activity", label: "آخر النشاطات", visible: true },
  { id: "top-selling", label: "أكثر الأصناف مبيعاً", visible: true },
  { id: "cash-flow", label: "التدفق النقدي", visible: true },
  { id: "aging", label: "أعمار الذمم", visible: true },
  { id: "inventory", label: "نبض المخزون", visible: true },
  { id: "cheques", label: "الشيكات المستحقة", visible: true },
  { id: "exchange-rates", label: "أسعار الصرف", visible: true },
];

const STORAGE_KEY = "dashboard_widget_config";

export function loadWidgetConfig(): DashboardWidgetConfig[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as DashboardWidgetConfig[];
      // Merge with defaults to handle new widgets
      return DEFAULT_WIDGETS.map(dw => {
        const found = parsed.find(p => p.id === dw.id);
        return found ? { ...dw, visible: found.visible } : dw;
      });
    }
  } catch {}
  return DEFAULT_WIDGETS;
}

function saveWidgetConfig(config: DashboardWidgetConfig[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (config: DashboardWidgetConfig[]) => void;
}

export default function CustomizeDashboardDialog({ open, onOpenChange, onApply }: Props) {
  const [widgets, setWidgets] = useState<DashboardWidgetConfig[]>(loadWidgetConfig());

  useEffect(() => {
    if (open) setWidgets(loadWidgetConfig());
  }, [open]);

  if (!open) return null;

  const toggleWidget = (id: string) => {
    setWidgets(prev => prev.map(w => w.id === id ? { ...w, visible: !w.visible } : w));
  };

  const handleSave = () => {
    saveWidgetConfig(widgets);
    onApply(widgets);
    onOpenChange(false);
  };

  const handleReset = () => {
    setWidgets(DEFAULT_WIDGETS);
    saveWidgetConfig(DEFAULT_WIDGETS);
    onApply(DEFAULT_WIDGETS);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" dir="rtl">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={() => onOpenChange(false)} />
      <div
        className="relative w-full max-w-sm mx-4 bg-card rounded-2xl border border-border/50 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border/30">
          <h3 className="text-sm font-bold text-foreground">تخصيص لوحة المعلومات</h3>
          <button onClick={() => onOpenChange(false)} className="p-1 rounded-lg hover:bg-muted transition-colors">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        </div>

        {/* Widget list */}
        <div className="p-3 space-y-1.5 max-h-[400px] overflow-y-auto">
          {widgets.map(w => (
            <button
              key={w.id}
              onClick={() => toggleWidget(w.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-right ${
                w.visible
                  ? "bg-primary/5 border border-primary/20"
                  : "bg-muted/50 border border-transparent opacity-60"
              }`}
            >
              <GripVertical className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
              <span className="flex-1 text-xs font-medium text-foreground">{w.label}</span>
              {w.visible ? (
                <Eye className="h-3.5 w-3.5 text-primary shrink-0" />
              ) : (
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border/30">
          <button onClick={handleReset} className="text-[11px] text-muted-foreground hover:text-foreground transition-colors">
            إعادة التعيين
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-all"
          >
            حفظ
          </button>
        </div>
      </div>
    </div>
  );
}
