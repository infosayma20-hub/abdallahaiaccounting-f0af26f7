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

// ZIDNI Brand color map per module
const moduleColors: Record<string, { accent: string; bg: string }> = {
  accounting:  { accent: "#00B4D8", bg: "rgba(0,180,216,0.12)" },
  expenses:    { accent: "#006D8F", bg: "rgba(0,109,143,0.12)" },
  sales:       { accent: "#C9A84C", bg: "rgba(201,168,76,0.12)" },
  customers:   { accent: "#00B4D8", bg: "rgba(0,180,216,0.12)" },
  team:        { accent: "#006D8F", bg: "rgba(0,109,143,0.12)" },
  tax:         { accent: "#D97706", bg: "rgba(217,119,6,0.12)" },
  marketing:   { accent: "#C9A84C", bg: "rgba(201,168,76,0.12)" },
  reports:     { accent: "#DC2626", bg: "rgba(220,38,38,0.12)" },
  inventory:   { accent: "#16A34A", bg: "rgba(22,163,74,0.12)" },
  ai:          { accent: "#00B4D8", bg: "rgba(0,180,216,0.12)" },
  cheques:     { accent: "#C9A84C", bg: "rgba(201,168,76,0.12)" },
  hr:          { accent: "#006D8F", bg: "rgba(0,109,143,0.12)" },
  home:        { accent: "#00B4D8", bg: "rgba(0,180,216,0.12)" },
  settings:    { accent: "#8B9BB4", bg: "rgba(139,155,180,0.12)" },
  purchases:   { accent: "#006D8F", bg: "rgba(0,109,143,0.12)" },
  pos:         { accent: "#00B4D8", bg: "rgba(0,180,216,0.12)" },
  finance:     { accent: "#16A34A", bg: "rgba(22,163,74,0.12)" },
  ecommerce:   { accent: "#C9A84C", bg: "rgba(201,168,76,0.12)" },
  import:      { accent: "#00B4D8", bg: "rgba(0,180,216,0.12)" },
  currency:    { accent: "#006D8F", bg: "rgba(0,109,143,0.12)" },
  assets:      { accent: "#C9A84C", bg: "rgba(201,168,76,0.12)" },
  customization: { accent: "#006D8F", bg: "rgba(0,109,143,0.12)" },
};

const sizes = {
  sm: { container: "w-8 h-8", icon: 16 },
  md: { container: "w-10 h-10", icon: 20 },
  lg: { container: "w-12 h-12", icon: 24 },
};

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
        "rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-150",
        className
      )}
      style={{
        backgroundColor: active ? colors.accent : colors.bg,
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
