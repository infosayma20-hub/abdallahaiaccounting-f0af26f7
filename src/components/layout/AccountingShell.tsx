/**
 * AccountingShell — Hybrid layout wrapper for heavy financial data-entry screens.
 * Mirrors the Hesabate / Odoo / QuickBooks model:
 *   • Inner content keeps its full readable width (min 1280px)
 *   • A horizontal scrollbar appears on smaller screens (laptops 13", tablets, mobile)
 *   • Fields and numbers stay legible — no shrinking under pressure
 *
 * Use this around journals, invoices, vouchers, credit/debit notes,
 * cheques, transfers, deliveries, imports — any screen where
 * accountant-level precision matters more than mobile fluidity.
 */
import React from "react";
import { cn } from "@/lib/utils";

interface AccountingShellProps {
  children: React.ReactNode;
  /** Extra classes for the OUTER scroll container. */
  className?: string;
  /** Extra classes for the INNER fixed-width content. */
  innerClassName?: string;
  /** Override the min-width (default 1280px). Pass e.g. "1400px" for stricter layouts. */
  minWidth?: string;
}

const AccountingShell: React.FC<AccountingShellProps> = ({
  children,
  className,
  innerClassName,
  minWidth,
}) => {
  return (
    <div className={cn("accounting-fixed-scroll", className)}>
      <div
        className={cn("accounting-fixed-inner", innerClassName)}
        style={minWidth ? { minWidth } : undefined}
      >
        {children}
      </div>
    </div>
  );
};

export default AccountingShell;