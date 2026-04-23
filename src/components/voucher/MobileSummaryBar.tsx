import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ArrowDown, ArrowUp, FileText, ShoppingCart, RotateCcw, Plus } from "lucide-react";
import SmartSummaryPanel from "./SmartSummaryPanel";
import type { ComponentProps } from "react";

type Props = ComponentProps<typeof SmartSummaryPanel> & {
  currencySymbol?: string;
};

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Mobile-only collapsed summary card.
 * Shows the headline number + party + status as a sticky bar.
 * Tap to expand into the full SmartSummaryPanel for the current variant.
 */
export default function MobileSummaryBar(props: Props) {
  const [open, setOpen] = useState(false);
  const { variant, currencySymbol = "₪", partyName } = props;
  const isReceipt = variant === "receipt";
  const isPayment = variant === "payment";
  const isVoucher = isReceipt || isPayment;
  const isInvoice = variant === "invoice";
  const isCreditNote = variant === "credit_note";
  const isDebitNote = variant === "debit_note";

  // Pull the right "headline number" depending on variant
  const headline =
    isVoucher
      ? Number((props as any).amount || 0)
      : Number((props as any).total || 0);
  const balanceBefore = (props as any).balanceBefore as number | null | undefined;
  const before = balanceBefore ?? 0;

  // Compute "after" impact for the badge on the right
  let after = before;
  if (isReceipt) after = before - headline;
  else if (isPayment) after = before + headline;
  else if (isInvoice) {
    const kind = (props as any).invoiceKind as "sales" | "purchase" | undefined;
    const remaining = Number((props as any).remainingAmount || 0);
    after = before + (kind === "purchase" ? -remaining : remaining);
  } else if (isCreditNote) {
    const remaining = Number((props as any).remainingAmount || 0);
    after = before - remaining;
  } else if (isDebitNote) {
    const remaining = Number((props as any).remainingAmount || 0);
    after = before + remaining;
  }

  const tone =
    isReceipt
      ? { bg: "bg-emerald-500/15", text: "text-emerald-700", Icon: ArrowDown }
      : isPayment
        ? { bg: "bg-rose-500/15", text: "text-rose-700", Icon: ArrowUp }
        : isCreditNote
          ? { bg: "bg-amber-500/15", text: "text-amber-700", Icon: RotateCcw }
          : isDebitNote
            ? { bg: "bg-violet-500/15", text: "text-violet-700", Icon: Plus }
            : ((props as any).invoiceKind === "purchase")
              ? { bg: "bg-sky-500/15", text: "text-sky-700", Icon: ShoppingCart }
              : { bg: "bg-emerald-500/15", text: "text-emerald-700", Icon: FileText };
  const Icon = tone.Icon;

  const headlineLabel =
    isReceipt ? "وارد"
    : isPayment ? "صادر"
    : isCreditNote ? "إشعار دائن"
    : isDebitNote ? "إشعار مدين"
    : ((props as any).invoiceKind === "purchase") ? "مشتريات"
    : "مبيعات";

  return (
    <div className="lg:hidden sticky top-0 z-30 -mx-2 mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full bg-card border border-border/60 rounded-xl shadow-sm px-3 py-2.5 flex items-center justify-between gap-2 active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${tone.bg} ${tone.text}`}
            title={headlineLabel}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 text-right">
            <div
              className={`text-base font-bold leading-tight ${tone.text}`}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {currencySymbol}{fmt(headline)}
            </div>
            {partyName && (
              <div className="text-[10px] text-muted-foreground truncate max-w-[180px]">{partyName}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {partyName && balanceBefore !== null && balanceBefore !== undefined && (
            <div className="text-left">
              <div className="text-[9px] text-muted-foreground leading-none">بعد</div>
              <div
                className={`text-[11px] font-bold leading-tight ${
                  after > 0.005 ? "text-rose-600" : after < -0.005 ? "text-emerald-600" : "text-foreground"
                }`}
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {currencySymbol}{fmt(Math.abs(after))}
              </div>
            </div>
          )}
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="bg-card border border-t-0 border-border/60 rounded-b-xl px-3 py-3 -mt-px">
              <SmartSummaryPanel {...props} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}