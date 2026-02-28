import { cn } from "@/lib/utils";
import {
  Calculator, ShoppingCart, Users, Package, ShoppingBag, DollarSign,
  BarChart3, Store, Settings, FileSpreadsheet, ArrowLeftRight, Landmark,
  Monitor, Puzzle, LayoutGrid, Sparkles, FileCheck, UserCog,
} from "lucide-react";

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
  sales:       { accent: "#F97316", bg: "rgba(249,115,22,0.15)" },
  customers:   { accent: "#14B8A6", bg: "rgba(20,184,166,0.15)" },
  team:        { accent: "#6366F1", bg: "rgba(99,102,241,0.15)" },
  tax:         { accent: "#F97316", bg: "rgba(249,115,22,0.15)" },
  marketing:   { accent: "#EAB308", bg: "rgba(234,179,8,0.15)" },
  reports:     { accent: "#F43F5E", bg: "rgba(244,63,94,0.15)" },
  inventory:   { accent: "#14B8A6", bg: "rgba(20,184,166,0.15)" },
  ai:          { accent: "#22C55E", bg: "rgba(34,197,94,0.15)" },
  cheques:     { accent: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
  hr:          { accent: "#8B5CF6", bg: "rgba(139,92,246,0.15)" },
  home:        { accent: "#22C55E", bg: "rgba(34,197,94,0.15)" },
  settings:    { accent: "#94A3B8", bg: "rgba(148,163,184,0.15)" },
  purchases:   { accent: "#0EA5E9", bg: "rgba(14,165,233,0.15)" },
  pos:         { accent: "#10B981", bg: "rgba(16,185,129,0.15)" },
  finance:     { accent: "#10B981", bg: "rgba(16,185,129,0.15)" },
  ecommerce:   { accent: "#F59E0B", bg: "rgba(245,158,11,0.15)" },
  import:      { accent: "#06B6D4", bg: "rgba(6,182,212,0.15)" },
  currency:    { accent: "#6366F1", bg: "rgba(99,102,241,0.15)" },
  assets:      { accent: "#78716C", bg: "rgba(120,113,108,0.15)" },
  customization: { accent: "#EC4899", bg: "rgba(236,72,153,0.15)" },
};

const sizes = {
  sm: { container: "w-8 h-8", icon: 16 },
  md: { container: "w-10 h-10", icon: 20 },
  lg: { container: "w-12 h-12", icon: 24 },
};

// Map modules to Lucide icons
const moduleIcons: Record<string, React.ElementType> = {
  home: LayoutGrid,
  accounting: Calculator,
  expenses: DollarSign,
  sales: ShoppingCart,
  customers: Users,
  team: Users,
  tax: DollarSign,
  marketing: Store,
  reports: BarChart3,
  inventory: Package,
  ai: Sparkles,
  cheques: FileCheck,
  hr: UserCog,
  settings: Settings,
  purchases: ShoppingBag,
  pos: Monitor,
  finance: DollarSign,
  ecommerce: Store,
  import: FileSpreadsheet,
  currency: ArrowLeftRight,
  assets: Landmark,
  customization: Puzzle,
};

const ModuleIcon = ({ module, size = "md", active = false, className }: ModuleIconProps) => {
  const colors = moduleColors[module] || moduleColors.accounting;
  const sizeConfig = sizes[size];
  const IconComponent = moduleIcons[module] || LayoutGrid;

  return (
    <div
      className={cn(
        sizeConfig.container,
        "rounded-xl flex items-center justify-center flex-shrink-0 transition-all duration-200",
        active ? "ring-2 ring-offset-1 ring-offset-background" : "",
        className
      )}
      style={{
        backgroundColor: active ? colors.accent : colors.bg,
        boxShadow: active ? `0 0 12px ${colors.accent}40` : "none",
        ...(active ? { ringColor: colors.accent } : {}),
      }}
    >
      <IconComponent
        size={sizeConfig.icon}
        className="flex-shrink-0"
        style={{ color: active ? "#FFFFFF" : colors.accent }}
        strokeWidth={2}
      />
    </div>
  );
};

export default ModuleIcon;
export { moduleColors };
