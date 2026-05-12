import { useEffect, useState } from "react";
import { FileText, RotateCcw, Trash2, ShoppingCart, Receipt } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  listInvoiceDrafts,
  getInvoiceDraft,
  removeInvoiceDraft,
  type InvoiceDraftMeta,
} from "@/lib/invoiceDraftsRegistry";

interface DraftsHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scope: string;
  /** Called with the parsed draft data when user clicks restore. */
  onRestore: (draft: any, meta: InvoiceDraftMeta) => void;
  currencySymbol: string;
}

function formatTime(ts: number) {
  try {
    return new Date(ts).toLocaleString("ar", {
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

const DraftsHistoryDialog = ({
  open,
  onOpenChange,
  scope,
  onRestore,
  currencySymbol,
}: DraftsHistoryDialogProps) => {
  const [drafts, setDrafts] = useState<InvoiceDraftMeta[]>([]);

  const refresh = () => setDrafts(listInvoiceDrafts(scope));

  useEffect(() => {
    if (open) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scope]);

  const handleRestore = (meta: InvoiceDraftMeta) => {
    const data = getInvoiceDraft(meta.storageKey);
    if (!data) return;
    onRestore(data, meta);
    onOpenChange(false);
  };

  const handleDelete = (meta: InvoiceDraftMeta) => {
    removeInvoiceDraft(meta.storageKey);
    refresh();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" />
            سجل مسودات الفواتير
          </DialogTitle>
          <DialogDescription>
            مسودات محفوظة محلياً (تُحذف تلقائياً بعد 7 أيام). اختر مسودة لاستعادتها أو احذفها.
          </DialogDescription>
        </DialogHeader>

        {drafts.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            لا توجد مسودات محفوظة حالياً.
          </div>
        ) : (
          <div className="max-h-[60vh] overflow-y-auto divide-y divide-border/40 -mx-2">
            {drafts.map((d) => (
              <div
                key={d.storageKey}
                className="flex items-start justify-between gap-3 px-3 py-3 hover:bg-muted/30 rounded-md transition-colors"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-[10px] gap-1">
                      {d.type === "sales" ? <Receipt className="h-3 w-3" /> : <ShoppingCart className="h-3 w-3" />}
                      {d.type === "sales" ? "مبيعات" : "مشتريات"}
                    </Badge>
                    <span className="text-[12px] font-semibold text-foreground truncate">
                      {d.contactName}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground flex items-center gap-3 flex-wrap tabular-nums">
                    <span>{formatTime(d.savedAt)}</span>
                    <span>•</span>
                    <span>{d.itemCount} {d.itemCount === 1 ? "بند" : "بنود"}</span>
                    <span>•</span>
                    <span className="font-semibold text-foreground">
                      {currencySymbol}
                      {d.totalApprox.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="default"
                    size="sm"
                    className="h-8 gap-1 text-[11px]"
                    onClick={() => handleRestore(d)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    استعادة
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-destructive/70 hover:text-destructive hover:bg-destructive/10"
                    onClick={() => handleDelete(d)}
                    title="حذف المسودة"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DraftsHistoryDialog;