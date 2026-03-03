import { Lock, Unlock } from "lucide-react";
import { format } from "date-fns";
import { ar } from "date-fns/locale";
import { Button } from "@/components/ui/button";

interface RecordLockBannerProps {
  isLocked: boolean;
  lockedByMe: boolean;
  lockedByName: string | null;
  lockedAt: string | null;
  loading: boolean;
  onAcquire: () => void;
  onRelease: () => void;
}

export default function RecordLockBanner({
  isLocked,
  lockedByMe,
  lockedByName,
  lockedAt,
  loading,
  onAcquire,
  onRelease,
}: RecordLockBannerProps) {
  if (!isLocked) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3 text-sm">
        <Unlock className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">السجل متاح للتعديل</span>
        <Button
          size="sm"
          variant="outline"
          onClick={onAcquire}
          disabled={loading}
          className="mr-auto"
        >
          <Lock className="h-3 w-3 ml-1" />
          قفل للتعديل
        </Button>
      </div>
    );
  }

  if (lockedByMe) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
        <Lock className="h-4 w-4 text-primary" />
        <span className="text-primary font-medium">أنت تعدّل هذا السجل الآن</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={onRelease}
          disabled={loading}
          className="mr-auto"
        >
          <Unlock className="h-3 w-3 ml-1" />
          إلغاء القفل
        </Button>
      </div>
    );
  }

  // Locked by someone else
  const lockTime = lockedAt
    ? format(new Date(lockedAt), "hh:mm a", { locale: ar })
    : "";

  return (
    <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
      <Lock className="h-4 w-4 text-destructive" />
      <span className="text-destructive font-medium">
        🔒 هذا السجل مفتوح حالياً من <strong>{lockedByName}</strong>
        {lockTime && ` منذ ${lockTime}`}
      </span>
      <span className="text-muted-foreground text-xs mr-auto">
        يُفتح تلقائياً بعد 10 دقائق
      </span>
    </div>
  );
}
