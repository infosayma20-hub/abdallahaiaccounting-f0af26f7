import { AlertTriangle, LogOut, RotateCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * Blocking dialog shown inside /pos when the current shift was closed from
 * another device (or marked deleted). The cashier's local cart is NOT cleared
 * — they can copy contents if needed, then open a new shift or sign out.
 */
export function ShiftClosedElsewhereDialog({
  open,
  closedAt,
  onOpenNewShift,
  onSignOut,
  signOutLabel,
}: {
  open: boolean;
  closedAt: string | null;
  onOpenNewShift: () => void;
  onSignOut: () => void;
  signOutLabel?: string;
}) {
  return (
    <Dialog open={open}>
      <DialogContent dir="rtl" className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onEscapeKeyDown={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            تم إغلاق العهدة من جهاز آخر
          </DialogTitle>
          <DialogDescription className="text-right leading-relaxed pt-2">
            عهدتك الحالية أُغلقت من جلسة أخرى لنفس حسابك
            {closedAt ? ` (${new Date(closedAt).toLocaleString("ar")})` : ""}.
            <br />
            لا يمكن إتمام البيع أو الطباعة أو فتح الدرج على هذه العهدة.
            <br />
            <span className="text-muted-foreground text-xs">
              السلة الحالية محفوظة على هذا الجهاز ولم تُمسح — يمكنك تدوين محتواها قبل المتابعة.
            </span>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onSignOut} className="gap-2">
            <LogOut className="h-4 w-4" /> {signOutLabel || "العودة لشاشة الموظف"}
          </Button>
          <Button onClick={onOpenNewShift} className="gap-2">
            <RotateCw className="h-4 w-4" /> فتح عهدة جديدة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}