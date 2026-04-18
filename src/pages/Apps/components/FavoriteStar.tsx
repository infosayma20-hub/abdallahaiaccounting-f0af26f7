import { Star } from "lucide-react";

interface Props {
  active: boolean;
  onToggle: (e: React.MouseEvent) => void;
  size?: number;
}

/**
 * FavoriteStar — زر ⭐ صغير يظهر في الزاوية العلوية لبطاقة التطبيق
 * يوقف الانتشار حتى لا يفتح التطبيق عند الضغط عليه.
 */
export default function FavoriteStar({ active, onToggle, size = 16 }: Props) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onToggle(e); }}
      aria-label={active ? "إزالة من المفضلة" : "إضافة للمفضلة"}
      title={active ? "إزالة من المفضلة" : "إضافة للمفضلة"}
      className="absolute z-20 flex items-center justify-center transition-all duration-200"
      style={{
        top: 8,
        left: 8,
        width: 28,
        height: 28,
        borderRadius: 8,
        background: active ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.7)",
        border: active ? "1px solid rgba(245,158,11,0.3)" : "1px solid rgba(226,232,240,0.6)",
        backdropFilter: "blur(4px)",
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = active ? "rgba(245,158,11,0.2)" : "rgba(241,245,249,1)";
        e.currentTarget.style.transform = "scale(1.08)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = active ? "rgba(245,158,11,0.12)" : "rgba(255,255,255,0.7)";
        e.currentTarget.style.transform = "scale(1)";
      }}
    >
      <Star
        size={size}
        strokeWidth={2}
        style={{
          color: active ? "#f59e0b" : "#94a3b8",
          fill: active ? "#f59e0b" : "transparent",
          transition: "all 0.2s ease",
        }}
      />
    </button>
  );
}
