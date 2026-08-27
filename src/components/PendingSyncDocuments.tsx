import { AlertTriangle, CloudUpload, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import useAccountingOutbox from "@/hooks/useAccountingOutbox";

/**
 * Floating indicator + review sheet for accounting documents captured while
 * offline. Nothing is hidden from the operator: pending, failed and
 * quarantined documents are all listed with the exact server error.
 */
export function PendingSyncDocuments() {
  const {
    entries,
    pendingCount,
    quarantinedCount,
    isSyncing,
    isOnline,
    syncNow,
    requeue,
    discard,
  } = useAccountingOutbox();

  const visible = entries.filter((e) => e.sync_status !== "synced");
  if (visible.length === 0) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <button
          dir="rtl"
          className="fixed bottom-12 left-4 z-[9998] flex items-center gap-2 rounded-full bg-amber-500 px-4 py-2 text-[13px] font-bold text-white shadow-lg"
        >
          {isSyncing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CloudUpload className="h-4 w-4" />
          )}
          <span>{visible.length} مستند بانتظار الترحيل</span>
          {quarantinedCount > 0 && <AlertTriangle className="h-4 w-4" />}
        </button>
      </SheetTrigger>

      <SheetContent side="left" dir="rtl" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader className="text-right">
          <SheetTitle>مستندات بانتظار الترحيل</SheetTitle>
          <SheetDescription>
            محفوظة محلياً ومشفّرة. يتم ترحيلها تلقائياً عند عودة الإنترنت بمفتاح واحد يمنع
            التكرار.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-4 flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {pendingCount} بانتظار · {quarantinedCount} بحاجة مراجعة
          </span>
          <Button size="sm" variant="outline" disabled={!isOnline || isSyncing} onClick={() => syncNow()}>
            <RefreshCw className={`h-3.5 w-3.5 ml-1 ${isSyncing ? "animate-spin" : ""}`} />
            ترحيل الآن
          </Button>
        </div>

        <div className="mt-4 space-y-3">
          {visible.map((entry) => (
            <div key={entry.id} className="rounded-lg border p-3 text-right">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{entry.summary.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.summary.doc_date} ·{" "}
                    {entry.summary.amount?.toLocaleString("en-US", { minimumFractionDigits: 2 })}{" "}
                    {entry.summary.currency}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-bold ${
                    entry.sync_status === "quarantined"
                      ? "bg-destructive/10 text-destructive"
                      : entry.sync_status === "failed"
                        ? "bg-amber-500/10 text-amber-600"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {entry.sync_status === "quarantined"
                    ? "بحاجة مراجعة"
                    : entry.sync_status === "failed"
                      ? `فشل (${entry.retry_count})`
                      : "بانتظار"}
                </span>
              </div>

              {entry.error && (
                <p className="mt-2 rounded bg-muted/50 p-2 text-[11px] text-destructive">
                  {entry.error}
                </p>
              )}

              <div className="mt-2 flex justify-end gap-2">
                <Button size="sm" variant="ghost" onClick={() => requeue(entry.id)} disabled={!isOnline}>
                  إعادة المحاولة
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => {
                    if (window.confirm("حذف هذا المستند نهائياً من الطابور؟ لن يتم ترحيله.")) {
                      void discard(entry.id);
                    }
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default PendingSyncDocuments;
