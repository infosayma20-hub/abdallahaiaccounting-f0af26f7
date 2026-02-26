import { cn } from "@/lib/utils";

/**
 * Premium abstract geometric icon system
 * Inspired by QuickBooks-style but fully original
 * Each icon uses geometric shapes inside a dark circular container
 */

interface ModuleIconProps {
  module: string;
  size?: "sm" | "md" | "lg";
  active?: boolean;
  className?: string;
}

// Color map per module
const moduleColors: Record<string, { accent: string; bg: string }> = {
  accounting:  { accent: "#22C55E", bg: "rgba(34,197,94,0.15)" },
  expenses:    { accent: "#3B82F6", bg: "rgba(59,130,246,0.15)" },
  sales:       { accent: "#06B6D4", bg: "rgba(6,182,212,0.15)" },
  customers:   { accent: "#14B8A6", bg: "rgba(20,184,166,0.15)" },
  team:        { accent: "#6366F1", bg: "rgba(99,102,241,0.15)" },
  tax:         { accent: "#F97316", bg: "rgba(249,115,22,0.15)" },
  marketing:   { accent: "#EAB308", bg: "rgba(234,179,8,0.15)" },
  reports:     { accent: "#8B5CF6", bg: "rgba(139,92,246,0.15)" },
  inventory:   { accent: "#10B981", bg: "rgba(16,185,129,0.15)" },
  ai:          { accent: "#22C55E", bg: "rgba(34,197,94,0.15)" },
  cheques:     { accent: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
  hr:          { accent: "#EC4899", bg: "rgba(236,72,153,0.15)" },
  home:        { accent: "#22C55E", bg: "rgba(34,197,94,0.15)" },
  settings:    { accent: "#94A3B8", bg: "rgba(148,163,184,0.15)" },
  purchases:   { accent: "#F472B6", bg: "rgba(244,114,182,0.15)" },
};

const sizes = {
  sm: { container: "w-8 h-8", svg: 16 },
  md: { container: "w-10 h-10", svg: 20 },
  lg: { container: "w-12 h-12", svg: 24 },
};

// Abstract geometric SVG shapes per module
const ModuleShape = ({ module, color, size }: { module: string; color: string; size: number }) => {
  const s = size;
  const half = s / 2;
  const strokeW = s > 20 ? 2.5 : 2;

  switch (module) {
    case "home":
      // Abstract dashboard: four quadrants grid
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="8" height="8" rx="2" stroke={color} strokeWidth={strokeW} />
          <rect x="13" y="3" width="8" height="8" rx="2" stroke={color} strokeWidth={strokeW} />
          <rect x="3" y="13" width="8" height="8" rx="2" stroke={color} strokeWidth={strokeW} />
          <rect x="13" y="13" width="8" height="8" rx="2" stroke={color} strokeWidth={strokeW} />
        </svg>
      );
    case "accounting":
      // Book/ledger: abstract open book
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" />
          <line x1="9" y1="7" x2="16" y2="7" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          <line x1="9" y1="11" x2="14" y2="11" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
        </svg>
      );
    case "expenses":
      // Outgoing arrow from wallet
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeW} fill="none" />
          <path d="M12 8v8M8 12l4-4 4 4" stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "sales":
      // Shopping bag abstract
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke={color} strokeWidth={strokeW} strokeLinejoin="round" fill="none" />
          <line x1="3" y1="6" x2="21" y2="6" stroke={color} strokeWidth={strokeW} />
          <path d="M16 10a4 4 0 0 1-8 0" stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "customers":
      // Two people abstract
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <circle cx="9" cy="7" r="3" stroke={color} strokeWidth={strokeW} />
          <path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          <circle cx="17" cy="8" r="2.5" stroke={color} strokeWidth={strokeW} />
          <path d="M21 21v-1.5a3 3 0 0 0-2-2.83" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
        </svg>
      );
    case "team":
      // Group of people
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="6" r="3" stroke={color} strokeWidth={strokeW} />
          <path d="M6 21v-2a4 4 0 0 1 8 0v2" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          <circle cx="5" cy="9" r="2" stroke={color} strokeWidth={strokeW} />
          <circle cx="19" cy="9" r="2" stroke={color} strokeWidth={strokeW} />
          <path d="M2 21v-1a3 3 0 0 1 3-3" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          <path d="M22 21v-1a3 3 0 0 0-3-3" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
        </svg>
      );
    case "tax":
      // Percentage symbol abstract
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <circle cx="8.5" cy="8.5" r="2.5" stroke={color} strokeWidth={strokeW} />
          <circle cx="15.5" cy="15.5" r="2.5" stroke={color} strokeWidth={strokeW} />
          <line x1="18" y1="6" x2="6" y2="18" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
        </svg>
      );
    case "marketing":
      // Megaphone abstract
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path d="M19 5L5 9h3l2 10h2l-1-6h2l8-4V5z" stroke={color} strokeWidth={strokeW} strokeLinejoin="round" fill="none" />
          <line x1="19" y1="5" x2="19" y2="13" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
        </svg>
      );
    case "reports":
      // Bar chart abstract
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <rect x="4" y="12" width="4" height="8" rx="1" stroke={color} strokeWidth={strokeW} fill="none" />
          <rect x="10" y="6" width="4" height="14" rx="1" stroke={color} strokeWidth={strokeW} fill="none" />
          <rect x="16" y="9" width="4" height="11" rx="1" stroke={color} strokeWidth={strokeW} fill="none" />
        </svg>
      );
    case "inventory":
      // Box/package abstract
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path d="M21 8L12 2 3 8v8l9 6 9-6V8z" stroke={color} strokeWidth={strokeW} strokeLinejoin="round" />
          <line x1="12" y1="22" x2="12" y2="12" stroke={color} strokeWidth={strokeW} />
          <path d="M3 8l9 4 9-4" stroke={color} strokeWidth={strokeW} strokeLinejoin="round" />
        </svg>
      );
    case "ai":
      // Sparkle/star abstract
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" stroke={color} strokeWidth={strokeW} strokeLinejoin="round" fill="none" />
        </svg>
      );
    case "cheques":
      // Receipt/cheque abstract
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <rect x="4" y="4" width="16" height="16" rx="2" stroke={color} strokeWidth={strokeW} />
          <line x1="8" y1="9" x2="16" y2="9" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          <line x1="8" y1="13" x2="13" y2="13" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          <path d="M14 16l2 2 3-4" stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "hr":
      // Person with briefcase
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="6" r="3" stroke={color} strokeWidth={strokeW} />
          <rect x="7" y="13" width="10" height="8" rx="2" stroke={color} strokeWidth={strokeW} />
          <line x1="10" y1="13" x2="10" y2="11" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
          <line x1="14" y1="13" x2="14" y2="11" stroke={color} strokeWidth={strokeW} strokeLinecap="round" />
        </svg>
      );
    case "purchases":
      // Incoming arrow
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="9" stroke={color} strokeWidth={strokeW} fill="none" />
          <path d="M12 16V8M8 12l4 4 4-4" stroke={color} strokeWidth={strokeW} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "settings":
      // Gear abstract
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="3" stroke={color} strokeWidth={strokeW} />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke={color} strokeWidth={strokeW} />
        </svg>
      );
    default:
      // Generic diamond
      return (
        <svg width={s} height={s} viewBox="0 0 24 24" fill="none">
          <rect x="4" y="4" width="16" height="16" rx="3" stroke={color} strokeWidth={strokeW} transform="rotate(45 12 12)" />
        </svg>
      );
  }
};

const ModuleIcon = ({ module, size = "md", active = false, className }: ModuleIconProps) => {
  const colors = moduleColors[module] || moduleColors.accounting;
  const sizeConfig = sizes[size];

  return (
    <div
      className={cn(
        sizeConfig.container,
        "rounded-full flex items-center justify-center flex-shrink-0 transition-all duration-200",
        active ? "ring-2 ring-offset-1 ring-offset-background" : "",
        className
      )}
      style={{
        backgroundColor: active ? colors.accent : "hsl(var(--icon-bg))",
        boxShadow: active ? `0 0 12px ${colors.accent}40` : "none",
        ...(active ? { ringColor: colors.accent } : {}),
      }}
    >
      <ModuleShape
        module={module}
        color={active ? "#FFFFFF" : colors.accent}
        size={sizeConfig.svg}
      />
    </div>
  );
};

export default ModuleIcon;
export { moduleColors };
