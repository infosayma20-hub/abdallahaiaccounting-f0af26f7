import type { AppSection } from "../data/appsRegistry";
import { Star, LayoutGrid, Layers, Briefcase, Crown } from "lucide-react";

export type CategoryFilter = "all" | "favorites" | AppSection;

interface Props {
  active: CategoryFilter;
  onChange: (filter: CategoryFilter) => void;
  counts: Record<CategoryFilter, number>;
}

const PILLS: { key: CategoryFilter; label: string; icon: any; color: string }[] = [
  { key: "all",        label: "الكل",        icon: LayoutGrid, color: "#1B3A5C" },
  { key: "favorites",  label: "المفضلة",     icon: Star,       color: "#f59e0b" },
  { key: "core",       label: "الأساسية",    icon: Layers,     color: "#0D1B2E" },
  { key: "operations", label: "العمليات",    icon: Briefcase,  color: "#6B7280" },
  { key: "premium",    label: "متقدمة",      icon: Crown,      color: "#7F77DD" },
];

/**
 * CategoryPills — شريط فلترة أفقي بأقسام التطبيقات + المفضلة.
 * يتغير اللون حسب القسم النشط مع عدّاد بجانب الاسم.
 */
export default function CategoryPills({ active, onChange, counts }: Props) {
  return (
    <div
      className="flex flex-wrap items-center justify-center gap-2 mb-6"
      role="tablist"
      aria-label="تصنيف التطبيقات"
    >
      {PILLS.map(({ key, label, icon: Icon, color }) => {
        const isActive = active === key;
        const count = counts[key] ?? 0;
        if (key !== "all" && key !== "favorites" && count === 0) return null;
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(key)}
            className="flex items-center gap-2 transition-all duration-200"
            style={{
              height: 36,
              padding: "0 14px",
              borderRadius: 999,
              background: isActive ? color : "#ffffff",
              border: isActive ? `1px solid ${color}` : "1px solid #e2e8f0",
              color: isActive ? "#ffffff" : "#1B3A5C",
              fontSize: 13,
              fontWeight: isActive ? 600 : 500,
              cursor: "pointer",
              boxShadow: isActive ? "0 4px 12px rgba(13,27,46,0.15)" : "none",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = color;
                e.currentTarget.style.background = "#f8fafc";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.borderColor = "#e2e8f0";
                e.currentTarget.style.background = "#ffffff";
              }
            }}
          >
            <Icon
              size={15}
              strokeWidth={2}
              style={{
                color: isActive ? "#ffffff" : color,
                fill: key === "favorites" && isActive ? "#ffffff" : "transparent",
              }}
            />
            <span>{label}</span>
            {count > 0 && (
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: "1px 7px",
                  borderRadius: 999,
                  background: isActive ? "rgba(255,255,255,0.22)" : "#f1f5f9",
                  color: isActive ? "#ffffff" : "#64748b",
                  minWidth: 20,
                  textAlign: "center",
                }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
