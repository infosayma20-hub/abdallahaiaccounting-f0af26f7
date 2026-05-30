import { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Unified finance modal — Microsoft Dynamics 365 Finance style.
 *
 *  - Quiet header: small Lucide icon + title + optional description (no gradients, no emoji).
 *  - Scrollable body with consistent spacing.
 *  - Sticky footer: one Primary action + one outline "إلغاء". No exotic colors.
 *
 * Use across all cash-box / voucher / journal modals so the whole finance
 * surface speaks the same visual language.
 */
export interface FinanceModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Primary action label (e.g. "تأكيد التحويل"). */
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  cancelLabel?: string;
  /** Tailwind max-width class for DialogContent. */
  size?: "sm" | "md" | "lg";
  children: ReactNode;
}

const SIZE_CLASS: Record<NonNullable<FinanceModalProps["size"]>, string> = {
  sm: "sm:max-w-md",
  md: "sm:max-w-lg",
  lg: "sm:max-w-2xl",
};

export function FinanceModal({
  open,
  onOpenChange,
  icon: Icon,
  title,
  description,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryLoading,
  cancelLabel = "إلغاء",
  size = "sm",
  children,
}: FinanceModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(SIZE_CLASS[size], "p-0 gap-0 max-h-[92dvh] flex flex-col")} dir="rtl">
        <DialogHeader className="px-5 pt-4 pb-3 border-b border-border space-y-1">
          <DialogTitle className="text-base font-semibold text-foreground flex items-center gap-2">
            {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
            {title}
          </DialogTitle>
          {description && (
            <DialogDescription className="text-xs text-muted-foreground">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {children}
        </div>

        <div className="px-5 py-3 border-t border-border bg-muted/30 flex items-center justify-end gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-9 min-w-[88px]"
            onClick={() => onOpenChange(false)}
            disabled={primaryLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            size="sm"
            className="h-9 min-w-[140px] gap-2"
            onClick={onPrimary}
            disabled={primaryDisabled || primaryLoading}
          >
            {primaryLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {primaryLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default FinanceModal;