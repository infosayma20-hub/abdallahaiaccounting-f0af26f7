import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ArrowDown, ArrowUp } from "lucide-react";
import SmartSummaryPanel from "./SmartSummaryPanel";
import type { ComponentProps } from "react";

type Props = ComponentProps<typeof SmartSummaryPanel> & {
  variant: "receipt" | "payment";
  amount: number;
  currencySymbol?: string;
};

const fmt = (n: number) =>
  Number(n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Mobile-only collapsed summary card.
 * Shows amount + party + status as a sticky bar; tap to expand into full SmartSummaryPanel.
 */
export default function MobileSummaryBar(props: Props) {
  const [open, setOpen] = useState(false);
  const { variant, amount, currencySymbol = "₪", partyName, balanceBefore } = props;
  const isReceipt = variant === "receipt";
  const before = balanceBefore ?? 0;
  const after = isReceipt ? before - amount : before + amount;

  return (
    <div className="lg:hidden sticky top-0 z-30 -mx-2 mb-2">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full bg-card border border-border/60 rounded-xl shadow-sm px-3 py-2.5 flex items-center justify-between gap-2 active:scale-[0.99] transition-transform"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`shrink-0 w-7 h-7 rounded-lg flex items-center justify-center ${
              isReceipt ? "bg-emerald-500/15 text-emerald-700" : "bg-rose-500/15 text-rose-700"
            }`}
          >
            {isReceipt ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0 text-right">
            <div
              className={`text-base font-bold leading-tight ${
                isReceipt ? "text-emerald-700" : "text-rose-700"
              }`}
              style={{ fontVariantNumeric: "tabular-nums" }}
            >
              {currencySymbol}{fmt(amount)}
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