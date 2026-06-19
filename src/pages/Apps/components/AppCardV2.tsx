import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Lock, Clock, ChevronDown } from "lucide-react";
import type { NavItem } from "@/config/navigationConfig";
import type { AppVisualMeta } from "../data/appsRegistry";
import FavoriteStar from "./FavoriteStar";
import AppMenuPopover from "./AppMenuPopover";

interface Props {
  app: NavItem;
  meta: AppVisualMeta;
  index: number;
  onNavigate: (path: string) => void;
  disabled?: boolean;       // hidden by super admin (legacy: hard-disable)
  isPremiumLocked?: boolean;
  /** التطبيق معطّل من الإدارة → يظهر في Premium بانتظار التفعيل */
  pendingActivation?: boolean;
  onPremiumClick?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

/**
 * AppCardV2 — Restored classic AMWALI cards with subtle 3D effect.
 * - White card, blue tint border, layered 3D shadows.
 * - Apps with `groups` open a popover menu (sub-sections) instead of navigating.
 * - Apps without `groups` (or `isDirect`) navigate immediately.
 */
export default function AppCardV2({
  app, meta, index, onNavigate, disabled, isPremiumLocked, pendingActivation, onPremiumClick,
  isFavorite, onToggleFavorite,
}: Props) {
  const isInert = disabled;
  const cardRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const hasMenu = !!(app.groups && app.groups.length > 0 && !app.isDirect);

  const handleClick = () => {
    if (isInert) return;
    if (isPremiumLocked) { onPremiumClick?.(); return; }
    if (hasMenu) { setMenuOpen((v) => !v); return; }
    onNavigate(app.path);
  };

  // Resting 3D shadow (soft layered)
  const restShadow =
    "0 1px 2px rgba(13, 27, 46, 0.04), 0 2px 6px rgba(13, 27, 46, 0.05), 0 8px 16px -8px rgba(13, 27, 46, 0.06)";
  // Hover 3D shadow (lifted, more depth)
  const hoverShadow =
    "0 2px 4px rgba(13, 27, 46, 0.05), 0 8px 16px rgba(13, 27, 46, 0.08), 0 20px 40px -12px rgba(59, 130, 246, 0.18), 0 0 0 3px #eff6ff";

  return (
    <>
    <style>{`
      @media (max-width: 767px) {
        .amwali-app-card { border-radius: 14px !important; }
        .amwali-app-card .amwali-app-btn { padding: 14px 8px 12px !important; gap: 8px !important; }
        .amwali-app-card .amwali-app-icon {
          width: 48px !important; height: 48px !important; border-radius: 14px !important;
        }
        .amwali-app-card .amwali-app-label { font-size: 13px !important; line-height: 1.25 !important; }
        .amwali-app-card .amwali-app-desc { display: none !important; }
        .amwali-app-card .amwali-app-meta-row { gap: 4px !important; flex-wrap: wrap; justify-content: center; }
        .amwali-app-card .amwali-app-badge-ai,
        .amwali-app-card .amwali-app-badge-crm,
        .amwali-app-card .amwali-app-badge-new { font-size: 8px !important; padding: 1px 5px !important; }
      }
      @media (max-width: 374px) {
        .amwali-app-card .amwali-app-btn { padding: 12px 6px 10px !important; }
        .amwali-app-card .amwali-app-icon { width: 44px !important; height: 44px !important; }
        .amwali-app-card .amwali-app-label { font-size: 12px !important; }
      }
    `}</style>
    <motion.div
      ref={cardRef as any}
      id={`app-${app.id}`}
      data-tour-id={`app-${app.id}`}
      className="amwali-app-card"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03, duration: 0.35, ease: "easeOut" }}
      style={{
        position: "relative",
        borderRadius: 16,
        background: isPremiumLocked ? "#f8fafc" : "#ffffff",
        border: isPremiumLocked ? "1.5px solid #e2e8f0" : "1.5px solid #dbeafe",
        boxShadow: restShadow,
        transition: "transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease",
        opacity: isInert ? 0.45 : 1,
        cursor: isInert ? "not-allowed" : "pointer",
        overflow: "hidden",
        fontFamily: "Cairo, Tajawal, sans-serif",
      }}
      onMouseEnter={(e) => {
        if (isInert) return;
        e.currentTarget.style.borderColor = "#3b82f6";
        e.currentTarget.style.boxShadow = hoverShadow;
        e.currentTarget.style.transform = "translateY(-3px) scale(1.01)";
      }}
      onMouseLeave={(e) => {
        if (isInert) return;
        e.currentTarget.style.borderColor = isPremiumLocked ? "#e2e8f0" : "#dbeafe";
        e.currentTarget.style.boxShadow = restShadow;
        e.currentTarget.style.transform = "translateY(0) scale(1)";
      }}
    >
      {/* Subtle inner top highlight for 3D feel */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          borderRadius: 16,
          pointerEvents: "none",
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.9) 0%, rgba(255,255,255,0) 30%)",
        }}
      />

      {/* ⭐ Favorite toggle */}
      {!isInert && onToggleFavorite && (
        <FavoriteStar active={!!isFavorite} onToggle={onToggleFavorite} />
      )}

      <button
        type="button"
        onClick={handleClick}
        disabled={isInert}
        className="amwali-app-btn w-full flex flex-col items-center gap-2 p-5 pb-4 text-center group relative z-10"
        style={{
          background: "transparent",
          border: "none",
          cursor: isInert ? "not-allowed" : "pointer",
        }}
      >
        {/* Icon container — uses original app.color/bgColor classes */}
        <div
          className={`amwali-app-icon w-[52px] h-[52px] rounded-2xl flex items-center justify-center transition-all duration-300 ${
            isInert
              ? "grayscale"
              : `${app.bgColor || "bg-primary/8"} group-hover:scale-110`
          }`}
          style={{
            // Layered 3D for the icon tile itself
            boxShadow: isInert
              ? "none"
              : "0 1px 2px rgba(0,0,0,0.06), 0 4px 10px -2px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.4)",
          }}
        >
          {pendingActivation ? (
            <Clock className="h-5 w-5" style={{ color: "#7F77DD" }} strokeWidth={2.2} />
          ) : isPremiumLocked ? (
            <Lock className="h-5 w-5" style={{ color: "#cbd5e1" }} />
          ) : (
            <app.icon
              className={`h-5 w-5 ${app.color || "text-primary"} transition-transform duration-300 group-hover:scale-105`}
            />
          )}
        </div>

        {/* Name + description */}
        <div className="space-y-1">
          <div className="amwali-app-meta-row flex items-center justify-center gap-1.5">
            <p
              className="amwali-app-label"
              style={{
                fontSize: 15,
                fontWeight: 600,
                color: isInert ? "#94a3b8" : "#0D1B2E",
                margin: 0,
              }}
            >
              {app.label}
            </p>
            {hasMenu && !isInert && !isPremiumLocked && (
              <ChevronDown
                size={13}
                strokeWidth={2.4}
                style={{
                  color: "#94a3b8",
                  transition: "transform 0.2s ease",
                  transform: menuOpen ? "rotate(180deg)" : "rotate(0deg)",
                }}
              />
            )}
            {!isInert && app.isNew && !pendingActivation && (
              <span className="amwali-app-badge-new text-[9px] font-medium px-2 py-0.5 rounded-full bg-info/10 text-info">
                جديد
              </span>
            )}
            {pendingActivation && (
              <span
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: 999,
                  background: "rgba(127,119,221,0.12)",
                  color: "#5b51c4",
                  border: "1px solid rgba(127,119,221,0.25)",
                }}
              >
                بانتظار التفعيل
              </span>
            )}
            {!isInert && meta.isAIFeature && !pendingActivation && (
              <span
                className="amwali-app-badge-ai"
                style={{
                  fontSize: 9,
                  fontWeight: 600,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "linear-gradient(90deg, #7F77DD, #D4537E)",
                  color: "#ffffff",
                  letterSpacing: 0.3,
                }}
              >
                AI
              </span>
            )}
            {!isInert && app.id === "crm" && !pendingActivation && (
              <span
                className="amwali-app-badge-crm"
                style={{
                  fontSize: 9,
                  fontWeight: 700,
                  padding: "2px 6px",
                  borderRadius: 4,
                  background: "#4f46e5",
                  color: "#ffffff",
                  letterSpacing: 0.5,
                }}
              >
                CRM
              </span>
            )}
          </div>
          <p
            className="amwali-app-desc line-clamp-2"
            style={{
              fontSize: 12,
              color: pendingActivation ? "#7c75c4" : isPremiumLocked ? "#94a3b8" : "#64748b",
              lineHeight: 1.5,
              maxWidth: 200,
              margin: "0 auto",
            }}
          >
            {pendingActivation
              ? "اطلب من الإدارة تفعيله"
              : isPremiumLocked
              ? "🔒 ترقية للاستخدام"
              : isInert
              ? "غير مفعّل"
              : app.description}
          </p>
        </div>
      </button>
    </motion.div>

    {hasMenu && (
      <AppMenuPopover
        anchorEl={cardRef.current}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        title={app.label}
        groups={app.groups || []}
        accentColor={meta.iconColor}
        onNavigate={onNavigate}
      />
    )}
    </>
  );
}
