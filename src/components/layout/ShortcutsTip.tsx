import { Keyboard, X } from "lucide-react";
import { useTT } from "@/i18n/dict";

interface ShortcutsTipProps {
  visible: boolean;
  onClose: () => void;
  onShowShortcuts: () => void;
}

const ShortcutsTip = ({ visible, onClose, onShowShortcuts }: ShortcutsTipProps) => {
  const tt = useTT();
  if (!visible) return null;

  return (
    <div className="absolute top-12 right-0 z-50 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="bg-card border border-border rounded-xl shadow-lg p-3 w-[240px]">
        <div className="flex items-start gap-2">
          <Keyboard className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-[12px] font-bold text-foreground">{tt("اختصارات لوحة المفاتيح")}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{tt("وفّر وقتك بـ F1-F4 و Ctrl")}</p>
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={onClose}
                className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                {tt("فهمت")}
              </button>
              <button
                onClick={() => { onClose(); onShowShortcuts(); }}
                className="text-[10px] text-primary font-bold hover:underline"
              >
                {tt("شوف الاختصارات")}
              </button>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsTip;
