import { AlertTriangle, ArrowRightLeft, LogOut, Loader2 } from "lucide-react";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Shown when this device tries to use a POS session that is currently being
 * heart-beated by another device for the same cashier user. Cashier can:
 *   • Take over (force-claim) — the other device flips to view-only on its next heartbeat.
 *   • Cancel — go back to the workspace picker.
 */
export function SessionTakeoverDialog({
  open,
  otherLastSeen,
  onTakeover,
  onCancel,
}: {
  open: boolean;
  otherLastSeen: string | null;
  onTakeover: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);

  const handleTakeover = async () => {
    setBusy(true);
    try { await onTakeover(); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open}>
      <DialogContent
        dir="rtl"
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            هذه العهدة مفتوحة على جهاز آخر
          </DialogTitle>
          <DialogDescription className="text-right leading-relaxed pt-2 space-y-2">
            <div>
              نفس حساب الكاشير يعمل حالياً على جهاز آخر
              {otherLastSeen ? ` (آخر نشاط: ${new Date(otherLastSeen).toLocaleTimeString("ar")})` : ""}.
            </div>
            <div className="text-muted-foreground text-xs leading-relaxed">
              لحماية إجماليات الصندوق لا يُسمح بجهازين في نفس الوقت. إذا تابعت
              <strong> "نقل العهدة لهذا الجهاز"</strong>، فالجهاز الآخر سيتحوّل لوضع
              عرض فقط خلال ثوانٍ، ومحتويات سلّته ستُحفظ تلقائياً.
            </div>
            <div className="text-muted-foreground text-[11px]">
              يُنصح بإنشاء حساب كاشير منفصل لكل موظف من إعدادات نقاط البيع لتجنّب هذه الشاشة.
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onCancel} disabled={busy} className="gap-2">
            <LogOut className="h-4 w-4" /> عودة
          </Button>
          <Button onClick={handleTakeover} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
            نقل العهدة لهذا الجهاز
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}