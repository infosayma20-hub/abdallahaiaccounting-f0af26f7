import { ReactNode } from "react";

/**
 * Unified HR table primitives for Employee360.
 * - RTL by default
 * - Navy primary header matching Attendance Center / Employees grid
 * - Consistent paddings, font sizing, and row hover
 *
 * DOM column order = visual right-to-left order (first <th> appears on the right).
 */

export function HRTable({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full text-sm border-collapse" dir="rtl">
        {children}
      </table>
    </div>
  );
}

export function HRTHead({ children }: { children: ReactNode }) {
  return (
    <thead>
      <tr className="bg-primary text-primary-foreground">{children}</tr>
    </thead>
  );
}

export function HRTH({
  children,
  align = "right",
  className = "",
}: {
  children: ReactNode;
  align?: "right" | "left" | "center";
  className?: string;
}) {
  const a = align === "left" ? "text-left" : align === "center" ? "text-center" : "text-right";
  return (
    <th className={`px-3 py-3 ${a} text-xs font-semibold whitespace-nowrap ${className}`}>
      {children}
    </th>
  );
}

export function HRTR({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <tr className={`border-t border-border/60 hover:bg-muted/40 odd:bg-muted/10 text-right ${className}`}>{children}</tr>
  );
}

export function HRTD({
  children,
  align = "right",
  className = "",
  numeric = false,
}: {
  children: ReactNode;
  align?: "right" | "left" | "center";
  className?: string;
  numeric?: boolean;
}) {
  const a = align === "left" ? "text-left" : align === "center" ? "text-center" : "text-right";
  return (
    <td className={`px-3 py-2 ${a} ${numeric ? "tabular-nums" : ""} ${className}`}>{children}</td>
  );
}

/** Inline currency rendering: amount + symbol, RTL-safe. */
export function HRMoney({
  value,
  currency = "₪",
  className = "",
}: {
  value: number | string;
  currency?: string;
  className?: string;
}) {
  const num = Number(value || 0);
  const formatted = new Intl.NumberFormat("ar", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(num);
  return (
    <span className={`tabular-nums whitespace-nowrap ${className}`}>
      {formatted} {currency}
    </span>
  );
}