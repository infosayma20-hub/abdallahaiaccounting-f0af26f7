import { CloudUpload, Loader2, WifiOff } from "lucide-react";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import useAccountingOutbox from "@/hooks/useAccountingOutbox";
import { OUTBOX_REVIEW_EVENT } from "@/components/PendingSyncDocuments";

/**
 * Header chip: shows the real connectivity state and how many accounting
 * documents are still waiting to be posted. Clicking it opens the review sheet
 * rendered by <PendingSyncDocuments /> (global, in App.tsx).
 */
export default function OfflineStatusChip() {
  const { isOnline, quality } = useNetworkStatus();
  const { pendingCount, quarantinedCount, isSyncing } = useAccountingOutbox();

  const waiting = pendingCount + quarantinedCount;
  if (isOnline && waiting === 0 && !isSyncing) return null;

  const open = () => window.dispatchEvent(new CustomEvent(OUTBOX_REVIEW_EVENT));

  const tone = !isOnline
    ? "bg-red-500/15 text-red-200 border-red-400/40"
    : quarantinedCount > 0
      ? "bg-amber-500/15 text-amber-200 border-amber-400/40"
      : "bg-emerald-500/15 text-emerald-200 border-emerald-400/40";

  const label = !isOnline
    ? waiting > 0
      ? `غير متصل · ${waiting}`
      : "غير متصل"
    : isSyncing
      ? "جاري الترحيل…"
      : `${waiting} بانتظار الترحيل`;

  return (
    <button
      type="button"
      onClick={open}
      dir="rtl"
      title={
        !isOnline
          ? "لا يوجد اتصال — المستندات تُحفظ محلياً وتُرحَّل تلقائياً"
          : "مستندات بانتظار الترحيل — اضغط للمراجعة"
      }
      className={`flex items-center gap-1.5 h-8 px-2.5 rounded-lg border text-[11px] font-bold transition-all flex-shrink-0 ${tone}`}
    >
      {isSyncing ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : !isOnline ? (
        <WifiOff className="h-3.5 w-3.5" />
      ) : (
        <CloudUpload className="h-3.5 w-3.5" />
      )}
      <span className="hidden sm:inline">{label}</span>
      {waiting > 0 && <span className="sm:hidden">{waiting}</span>}
    </button>
  );
}
