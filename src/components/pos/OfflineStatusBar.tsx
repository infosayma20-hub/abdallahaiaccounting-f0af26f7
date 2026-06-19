import { Wifi, WifiOff, RefreshCw, Clock, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';

interface OfflineStatusBarProps {
  isOnline: boolean;
  pendingCount: number;
  quarantinedCount?: number;
  lastSyncAt: string | null;
  isSyncing: boolean;
  syncProgress: { current: number; total: number };
  onForceSync: () => void;
}

export default function OfflineStatusBar({
  isOnline,
  pendingCount,
  quarantinedCount = 0,
  lastSyncAt,
  isSyncing,
  syncProgress,
  onForceSync,
}: OfflineStatusBarProps) {
  if (isSyncing) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border-b border-blue-500/20 text-xs" dir="rtl">
        <RefreshCw className="w-3.5 h-3.5 text-blue-500 animate-spin" />
        <span className="text-blue-700 dark:text-blue-300 font-medium">
          جاري المزامنة... {syncProgress.current}/{syncProgress.total}
        </span>
        <Progress value={(syncProgress.current / Math.max(syncProgress.total, 1)) * 100} className="h-1.5 w-24" />
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="flex items-center justify-between px-3 py-1.5 bg-red-500/10 border-b border-red-500/20 text-xs" dir="rtl">
        <div className="flex items-center gap-2">
          <WifiOff className="w-3.5 h-3.5 text-red-500" />
          <span className="text-red-700 dark:text-red-300 font-semibold">غير متصل — وضع عمل بدون إنترنت</span>
          {pendingCount > 0 && (
            <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
              {pendingCount} بانتظار الترحيل
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1 text-muted-foreground">
          <AlertTriangle className="w-3 h-3" />
          <span>العمليات تُحفظ محلياً</span>
        </div>
      </div>
    );
  }

  // Online
  const lastSyncText = lastSyncAt
    ? formatDistanceToNow(new Date(lastSyncAt), { addSuffix: true, locale: ar })
    : 'لم تتم بعد';

  return (
    <div className="flex items-center justify-between px-3 py-1 bg-emerald-500/5 border-b border-emerald-500/10 text-xs" dir="rtl">
      <div className="flex items-center gap-2">
        <Wifi className="w-3.5 h-3.5 text-emerald-500" />
        <span className="text-emerald-700 dark:text-emerald-300">متصل</span>
        <span className="text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" />
          آخر مزامنة: {lastSyncText}
        </span>
        {pendingCount > 0 && (
          <>
            <Badge variant="outline" className="text-[10px] h-5 px-1.5 border-amber-400 text-amber-600">
              {pendingCount} بانتظار
            </Badge>
            <Button variant="ghost" size="sm" className="h-5 px-2 text-[10px]" onClick={onForceSync}>
              <RefreshCw className="w-3 h-3 ml-1" /> مزامنة الآن
            </Button>
          </>
        )}
        {quarantinedCount > 0 && (
          <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
            ⚠️ {quarantinedCount} في الحجر
          </Badge>
        )}
      </div>
    </div>
  );
}
