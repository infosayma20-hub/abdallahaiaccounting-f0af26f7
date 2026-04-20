/**
 * DashboardGrid — يلف react-grid-layout ويعرض widgets قابلة للسحب وتغيير الحجم.
 * In editMode: drag/resize/delete enabled. Otherwise read-only.
 */
import { useMemo } from "react";
import { Responsive, WidthProvider, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { X, Settings2 } from "lucide-react";
import KpiWidget from "./KpiWidget";
import SavedReportWidget from "./SavedReportWidget";
import TextWidget from "./TextWidget";
import type { DashboardWidget } from "@/hooks/useCustomDashboards";

const ResponsiveGridLayout = WidthProvider(Responsive);

interface Props {
  widgets: DashboardWidget[];
  editMode: boolean;
  onLayoutChange?: (updates: { id: string; pos_x: number; pos_y: number; width: number; height: number }[]) => void;
  onConfigure?: (w: DashboardWidget) => void;
  onDelete?: (id: string) => void;
}

function renderWidget(w: DashboardWidget) {
  switch (w.widget_type) {
    case "kpi": return <KpiWidget config={w.config} title={w.title} />;
    case "report": return <SavedReportWidget config={w.config} title={w.title} />;
    case "text": return <TextWidget config={w.config} title={w.title} />;
    default: return <div className="p-4 text-xs text-muted-foreground">عنصر غير مدعوم</div>;
  }
}

export default function DashboardGrid({ widgets, editMode, onLayoutChange, onConfigure, onDelete }: Props) {
  const layouts = useMemo(() => {
    const lg: Layout[] = widgets.map(w => ({
      i: w.id,
      x: w.pos_x,
      y: w.pos_y,
      w: Math.max(2, w.width),
      h: Math.max(2, w.height),
      minW: 2,
      minH: 2,
    }));
    return { lg, md: lg, sm: lg.map(l => ({ ...l, w: 12, x: 0 })) };
  }, [widgets]);

  return (
    <ResponsiveGridLayout
      className="layout"
      layouts={layouts}
      breakpoints={{ lg: 1200, md: 996, sm: 640 }}
      cols={{ lg: 12, md: 12, sm: 12 }}
      rowHeight={60}
      isDraggable={editMode}
      isResizable={editMode}
      draggableCancel=".widget-no-drag"
      compactType="vertical"
      onLayoutChange={(layout) => {
        if (!editMode || !onLayoutChange) return;
        const updates = layout.map(l => ({
          id: l.i,
          pos_x: l.x,
          pos_y: l.y,
          width: l.w,
          height: l.h,
        }));
        onLayoutChange(updates);
      }}
    >
      {widgets.map(w => (
        <div key={w.id} className="relative group">
          {editMode && (
            <div className="absolute top-2 left-2 z-10 flex gap-1 widget-no-drag opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onConfigure?.(w)}
                className="w-7 h-7 rounded-lg bg-background/95 border border-border shadow-sm flex items-center justify-center hover:bg-muted"
                title="إعدادات"
              >
                <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
              <button
                onClick={() => onDelete?.(w.id)}
                className="w-7 h-7 rounded-lg bg-background/95 border border-destructive/40 text-destructive shadow-sm flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
                title="حذف"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {renderWidget(w)}
        </div>
      ))}
    </ResponsiveGridLayout>
  );
}
