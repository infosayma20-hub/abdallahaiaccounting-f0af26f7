import { type ReactNode } from "react";

/**
 * Sparta "Finance Shell" UI primitives — Microsoft Dynamics-inspired.
 * All components are unstyled wrappers that rely on classes defined in
 * `src/styles/sparta-theme.css` (`.sparta-app` scope) so the burgundy
 * + soft-pink header look from the Holding Console is consistent everywhere.
 */

export function SpartaPageHeader({
  eyebrow,
  title,
  actions,
}: {
  eyebrow?: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="sparta-page-header">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <div className="accent-bar" />
      </div>
      {actions && <div className="flex gap-2 items-center flex-wrap">{actions}</div>}
    </div>
  );
}

export function SpartaKpiCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div className="sparta-kpi">
      <div className="label">{label}</div>
      <div className="value" style={accent ? { color: "#9E2B43" } : undefined}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function SpartaKpiGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: 16,
        marginBottom: 24,
      }}
    >
      {children}
    </div>
  );
}

export function SpartaPill({
  children,
  bg = "#FBEAF1",
  fg = "#9E2B43",
}: {
  children: ReactNode;
  bg?: string;
  fg?: string;
}) {
  return (
    <span className="sparta-pill" style={{ background: bg, color: fg }}>
      {children}
    </span>
  );
}

/** Card/surface wrapper that picks up the Sparta border + radius. */
export function SpartaSurface({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div data-sparta-surface className={`overflow-x-auto ${className}`}>
      {children}
    </div>
  );
}