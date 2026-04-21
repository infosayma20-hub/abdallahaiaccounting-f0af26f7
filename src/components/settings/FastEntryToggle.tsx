import { Switch } from "@/components/ui/switch";
import { Zap } from "lucide-react";
import { useFastEntryMode } from "@/hooks/useFastEntryMode";

/**
 * UX preference: "Fast entry mode" — affects Receipt / Payment / Journal save flow.
 * - ON  (default): toast + auto-reset, never blocks the screen.
 * - OFF: legacy success screen with explicit "Print / Back / New" buttons.
 *
 * Stored per-browser in localStorage (see useFastEntryMode).
 */
export default function FastEntryToggle() {
  const [enabled, setEnabled] = useFastEntryMode();

  return (
    <div className="space-y-4 px-2">
      <h2 className="text-lg font-medium text-primary" style={{ fontFamily: "Tajawal, sans-serif" }}>
        تفضيلات الإدخال
      </h2>

      <label className="flex items-start justify-between gap-3 p-4 rounded-xl border border-border/30 bg-card hover:bg-muted/20 cursor-pointer transition-colors">
        <div className="flex items-start gap-3 flex-1">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Zap className="h-4 w-4 text-primary" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-foreground">وضع الإدخال السريع</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              بعد حفظ سند القبض / الصرف / القيد، يظهر إشعار صغير ويُعاد تجهيز النموذج فوراً
              لإدخال جديد بدون شاشة توقف. مناسب للمحاسبين الذين يدخلون عشرات السندات يومياً.
            </p>
          </div>
        </div>
        <Switch checked={enabled} onCheckedChange={setEnabled} />
      </label>
    </div>
  );
}
