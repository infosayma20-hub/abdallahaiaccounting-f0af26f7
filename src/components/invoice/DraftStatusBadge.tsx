import { Loader2, Check, AlertCircle } from "lucide-react";
import { useEffect, useState } from "react";

export type DraftStatus = "idle" | "saving" | "saved" | "error";

interface DraftStatusBadgeProps {
  status: DraftStatus;
  savedAt: number | null;
}

function relative(ts: number | null): string {
  if (!ts) return "";
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "للتوّ";
  if (sec < 60) return `قبل ${sec} ث`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `قبل ${min} د`;
  const hr = Math.floor(min / 60);
  return `قبل ${hr} س`;
}

/**
 * شارة صغيرة تعرض حالة المسودة التلقائية للفاتورة.
 * - saving: "جاري حفظ المسودة…"
 * - saved : "تم حفظ المسودة <X>"
 * - error : "تعذّر حفظ المسودة"
 * - idle  : لا يعرض شيء.
 */
const DraftStatusBadge = ({ status, savedAt }: DraftStatusBadgeProps) => {
  const [, force] = useState(0);
  // Tick every 15s so the relative time stays fresh while idle.
  useEffect(() => {
    if (status !== "saved") return;
    const t = setInterval(() => force(n => n + 1), 15000);
    return () => clearInterval(t);
  }, [status]);

  if (status === "idle") return null;

  if (status === "saving") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground" aria-live="polite">
        <Loader2 className="h-3 w-3 animate-spin" />
        جاري حفظ المسودة…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-destructive" aria-live="polite">
        <AlertCircle className="h-3 w-3" />
        تعذّر حفظ المسودة
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600" aria-live="polite">
      <Check className="h-3 w-3" />
      تم حفظ المسودة {relative(savedAt)}
    </span>
  );
};

export default DraftStatusBadge;