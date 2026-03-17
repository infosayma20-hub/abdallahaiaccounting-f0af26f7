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

// QOYOD unified brand colors — navy + gold only
const brandNavy = "#1B3A5C";
const brandGold = "#C9A84C";

const moduleColors: Record<string, { accent: string; bg: string; gradient?: string }> = {};
// All modules use the same navy color
const defaultColor = { accent: brandNavy, bg: `rgba(27, 58, 92, 0.08)`, gradient: undefined };
[
  "accounting", "expenses", "sales", "customers", "team", "tax", "marketing",
  "reports", "inventory", "ai", "cheques", "hr", "home", "dashboard", "settings",
  "purchases", "pos", "finance", "ecommerce", "import", "currency", "assets",
  "customization", "reps",
].forEach(k => { moduleColors[k] = defaultColor; });

const sizes = {
  sm: { container: "w-8 h-8", icon: 16 },
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
  customization: Puzzle,
};

const DashboardIcon = ({ size, color }: { size: number; color?: string }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
  >
    <rect x="3" y="3" width="8" height="9" rx="1.5" fill={color || brandNavy} />
    <rect x="13" y="3" width="8" height="4" rx="1.5" fill={color || brandNavy} />
    <rect x="13" y="10" width="8" height="9" rx="1.5" fill={color || brandNavy} />
    <rect x="3" y="15" width="8" height="4" rx="1.5" fill={color || brandNavy} />
    <rect x="3" y="3" width="8" height="9" rx="1.5" fill="none" stroke={`${color || brandNavy}30`} strokeWidth="0.5" />
    <rect x="13" y="3" width="8" height="4" rx="1.5" fill="none" stroke={`${color || brandNavy}30`} strokeWidth="0.5" />
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
          "rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200",
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
        "rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-200",
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
