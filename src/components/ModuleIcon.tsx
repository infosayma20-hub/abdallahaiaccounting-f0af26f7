import { cn } from "@/lib/utils";
import {
  Calculator, ShoppingCart, Users, Package, ShoppingBag, DollarSign,
  BarChart3, Store, Settings, FileSpreadsheet, ArrowLeftRight, Landmark,
  Monitor, Puzzle, LayoutGrid, Sparkles, FileCheck, UserCog, ClipboardList, Plane,
  Building2, Wrench,
} from "lucide-react";

interface ModuleIconProps {
  module: string;
  size?: "sm" | "md" | "lg";
  active?: boolean;
  className?: string;
}

// FINIX Brand color map per module
const moduleColors: Record<string, { accent: string; bg: string; gradient?: string }> = {
  accounting:  { accent: "#92400E", bg: "rgba(146,64,14,0.12)", gradient: "linear-gradient(135deg, #92400E, #B45309)" },
  expenses:    { accent: "#1E3A5F", bg: "rgba(30,58,95,0.12)", gradient: "linear-gradient(135deg, #1E3A5F, #2D5A8E)" },
  sales:       { accent: "#DC2626", bg: "rgba(220,38,38,0.12)", gradient: "linear-gradient(135deg, #DC2626, #EF4444)" },
  customers:   { accent: "#0D1B2A", bg: "rgba(13,27,42,0.12)", gradient: "linear-gradient(135deg, #0D1B2A, #1E3A5F)" },
  team:        { accent: "#1E3A5F", bg: "rgba(30,58,95,0.12)", gradient: "linear-gradient(135deg, #1E3A5F, #2D5A8E)" },
  tax:         { accent: "#D97706", bg: "rgba(217,119,6,0.12)", gradient: "linear-gradient(135deg, #D97706, #F59E0B)" },
  marketing:   { accent: "#E8A020", bg: "rgba(232,160,32,0.12)", gradient: "linear-gradient(135deg, #E8A020, #F5B83D)" },
  reports:     { accent: "#DC2626", bg: "rgba(220,38,38,0.12)", gradient: "linear-gradient(135deg, #DC2626, #EF4444)" },
  inventory:   { accent: "#16A34A", bg: "rgba(22,163,74,0.12)", gradient: "linear-gradient(135deg, #16A34A, #22C55E)" },
  ai:          { accent: "#7C3AED", bg: "rgba(124,58,237,0.12)", gradient: "linear-gradient(135deg, #7C3AED, #A855F7)" },
  cheques:     { accent: "#B45309", bg: "rgba(180,83,9,0.12)", gradient: "linear-gradient(135deg, #B45309, #D97706)" },
  hr:          { accent: "#1E3A5F", bg: "rgba(30,58,95,0.12)", gradient: "linear-gradient(135deg, #1E3A5F, #2D5A8E)" },
  home:        { accent: "#92400E", bg: "rgba(146,64,14,0.12)", gradient: "linear-gradient(135deg, #92400E, #B45309)" },
  dashboard:   { accent: "#1D4ED8", bg: "rgba(29,78,216,0.12)", gradient: "linear-gradient(135deg, #1D4ED8, #3B82F6)" },
  settings:    { accent: "#475569", bg: "rgba(71,85,105,0.12)", gradient: "linear-gradient(135deg, #475569, #64748B)" },
  purchases:   { accent: "#7C3AED", bg: "rgba(124,58,237,0.12)", gradient: "linear-gradient(135deg, #7C3AED, #A855F7)" },
  pos:         { accent: "#00B4D8", bg: "rgba(0,180,216,0.12)", gradient: "linear-gradient(135deg, #00B4D8, #22D3EE)" },
  finance:     { accent: "#16A34A", bg: "rgba(22,163,74,0.12)", gradient: "linear-gradient(135deg, #16A34A, #22C55E)" },
  ecommerce:   { accent: "#C9A84C", bg: "rgba(201,168,76,0.12)", gradient: "linear-gradient(135deg, #C9A84C, #E8C860)" },
  import:      { accent: "#0891B2", bg: "rgba(8,145,178,0.12)", gradient: "linear-gradient(135deg, #0891B2, #06B6D4)" },
  currency:    { accent: "#006D8F", bg: "rgba(0,109,143,0.12)", gradient: "linear-gradient(135deg, #006D8F, #0891B2)" },
  assets:      { accent: "#C9A84C", bg: "rgba(201,168,76,0.12)", gradient: "linear-gradient(135deg, #C9A84C, #E8C860)" },
  contractor:  { accent: "#EA580C", bg: "rgba(234,88,12,0.12)", gradient: "linear-gradient(135deg, #EA580C, #F97316)" },
  workshops:   { accent: "#EA580C", bg: "rgba(234,88,12,0.12)", gradient: "linear-gradient(135deg, #EA580C, #F97316)" },
  customization: { accent: "#006D8F", bg: "rgba(0,109,143,0.12)", gradient: "linear-gradient(135deg, #006D8F, #0891B2)" },
  reps:        { accent: "#EA580C", bg: "rgba(234,88,12,0.12)", gradient: "linear-gradient(135deg, #EA580C, #F97316)" },
  tasks:       { accent: "#1B3A5C", bg: "rgba(27,58,92,0.12)", gradient: "linear-gradient(135deg, #1B3A5C, #2D5A8E)" },
  travel:      { accent: "#0891B2", bg: "rgba(8,145,178,0.12)", gradient: "linear-gradient(135deg, #0891B2, #06B6D4)" },
};

const sizes = {
  sm: { container: "w-9 h-9", icon: 18 },
  md: { container: "w-10 h-10", icon: 20 },
  lg: { container: "w-12 h-12", icon: 24 },
};

const moduleIcons: Record<string, React.ElementType> = {
  home: LayoutGrid,
  dashboard: LayoutGrid, // placeholder, overridden by custom SVG
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
  contractor: Building2,
  workshops: Wrench,
  customization: Puzzle,
  tasks: ClipboardList,
  travel: Plane,
};

const DashboardIcon = ({ size }: { size: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
  >
    <rect x="3" y="3" width="8" height="9" rx="1.5" fill="white" />
    <rect x="13" y="3" width="8" height="4" rx="1.5" fill="white" />
    <rect x="13" y="10" width="8" height="9" rx="1.5" fill="white" />
    <rect x="3" y="15" width="8" height="4" rx="1.5" fill="white" />
    <rect x="3" y="3" width="8" height="9" rx="1.5" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
    <rect x="13" y="3" width="8" height="4" rx="1.5" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="0.5" />
  </svg>
);

const activeGradient = "linear-gradient(135deg, #E8A020, #F45E0C)";

const ModuleIcon = ({ module, size = "md", active = false, className }: ModuleIconProps) => {
  const colors = moduleColors[module] || moduleColors.accounting;
  const sizeConfig = sizes[size];
  const isDashboard = module === "dashboard";

  if (isDashboard) {
    return (
      <div
        className={cn(
          sizeConfig.container,
          "rounded-[10px] flex items-center justify-center flex-shrink-0 transition-all duration-200",
          className
        )}
        style={{
          background: active ? activeGradient : colors.gradient,
          boxShadow: active
            ? "0 2px 10px rgba(232,160,32,0.45)"
            : `0 2px 8px rgba(29,78,216,0.35)`,
          transform: active ? "scale(1.05)" : "scale(1)",
        }}
      >
        <DashboardIcon size={sizeConfig.icon} />
      </div>
    );
  }

  const IconComponent = moduleIcons[module] || LayoutGrid;

  return (
    <div
      className={cn(
        sizeConfig.container,
        "rounded-[10px] flex items-center justify-center flex-shrink-0 transition-all duration-200",
        className
      )}
      style={{
        background: active ? activeGradient : (colors.gradient || colors.bg),
        boxShadow: active
          ? "0 2px 10px rgba(232,160,32,0.45)"
          : `0 2px 8px ${colors.accent}30`,
        transform: active ? "scale(1.05)" : "scale(1)",
      }}
    >
      <IconComponent
        size={sizeConfig.icon}
        className="flex-shrink-0"
        style={{ color: "#FFFFFF" }}
        strokeWidth={2}
      />
    </div>
  );
};

export default ModuleIcon;
export { moduleColors };
