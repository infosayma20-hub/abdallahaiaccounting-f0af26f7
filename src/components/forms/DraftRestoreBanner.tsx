/**
 * DraftRestoreBanner — شريط استرجاع المسودة المحفوظة تلقائياً
 * يظهر عند فتح صفحة فيها مسودة سابقة لم تُحفظ.
 */
import { Clock, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DraftRestoreBannerProps {
  onRestore: () => void;
  onDismiss: () => void;
  savedAt: number | null;
  label?: string;
}

function formatRelative(ts: number | null): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "قبل لحظات";
  if (min < 60) return `قبل ${min} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `قبل ${hr} ساعة`;
  const days = Math.floor(hr / 24);
  return `قبل ${days} يوم`;
}

const DraftRestoreBanner = ({ onRestore, onDismiss, savedAt, label }: DraftRestoreBannerProps) => {
  return (
    <div
      role="alert"
      className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-foreground shadow-sm"
    >
      <div className="flex items-center gap-2 text-[13px] font-medium">
        <Clock className="h-4 w-4 text-warning" />
        <span>
          {label || "يوجد مسودة محفوظة تلقائياً"}
          {savedAt && (
            <span className="ms-1 text-[11px] text-muted-foreground font-normal">({formatRelative(savedAt)})</span>
          )}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="default"
          onClick={onRestore}
          className="h-7 gap-1 bg-warning text-warning-foreground hover:bg-warning/90 text-[12px]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          استرجاع
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onDismiss}
          className="h-7 gap-1 text-[12px] hover:bg-warning/15"
        >
          <X className="h-3.5 w-3.5" />
          تجاهل
        </Button>
      </div>
    </div>
  );
};

export default DraftRestoreBanner;