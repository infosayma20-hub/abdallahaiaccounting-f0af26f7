import { motion } from "framer-motion";
import { Lock, Sparkles } from "lucide-react";
import type { NavItem } from "@/config/navigationConfig";
import type { AppVisualMeta } from "../data/appsRegistry";

interface Props {
  app: NavItem;
  meta: AppVisualMeta;
  index: number;
  onNavigate: (path: string) => void;
  disabled?: boolean;       // hidden by super admin
  isPremiumLocked?: boolean;
  onPremiumClick?: () => void;
}

/**
 * AppCardV2 — AMWALI brand-spec card (Phase 1)
 * - 44×44 colored icon container
 * - 13px name / 11px subtitle (Cairo)
 * - Hover: navy border + lift -2px
 * - Inline styles only, hex values per brand convention
 */
export default function AppCardV2({
  app, meta, index, onNavigate, disabled, isPremiumLocked, onPremiumClick,
}: Props) {
  const isInert = disabled;

  const handleClick = () => {
    if (isInert) return;
    if (isPremiumLocked) { onPremiumClick?.(); return; }
    onNavigate(app.path);
  };

  return (
    <motion.button
      type="button"
      role="button"
      tabIndex={0}
      onClick={handleClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.02, duration: 0.25, ease: "easeOut" }}
      disabled={isInert}
      style={{
        position: "relative",
        background: "#FFFFFF",
        border: "0.5px solid #E5E7EB",
        borderRadius: 12,
        padding: "16px 12px",
        textAlign: "center",
        cursor: isInert ? "not-allowed" : "pointer",
        transition: "all 0.2s ease",
        opacity: isInert ? 0.45 : isPremiumLocked ? 0.9 : 1,
        fontFamily: "Cairo, Tajawal, sans-serif",
      }}
      onMouseEnter={(e) => {
        if (isInert) return;
        e.currentTarget.style.borderColor = "#0D1B2E";
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 4px 12px rgba(13, 27, 46, 0.08)";
      }}
      onMouseLeave={(e) => {
        if (isInert) return;
        e.currentTarget.style.borderColor = "#E5E7EB";
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "none";
      }}
      onFocus={(e) => {
        if (isInert) return;
        e.currentTarget.style.outline = "2px solid #0D1B2E";
        e.currentTarget.style.outlineOffset = "2px";
      }}
      onBlur={(e) => { e.currentTarget.style.outline = "none"; }}
    >
      {/* AI Badge — only for AI Accountant */}
      {meta.isAIFeature && !isInert && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 8,
            insetInlineStart: 8,
            background: "linear-gradient(90deg, #7F77DD, #D4537E)",
            color: "#FFFFFF",
            fontSize: 9,
            fontWeight: 500,
            padding: "2px 6px",
            borderRadius: 4,
            letterSpacing: 0.3,
          }}
        >
          AI
        </span>
      )}

      {/* Lock — premium */}
      {isPremiumLocked && (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            top: 8,
            insetInlineStart: 8,
            width: 20,
            height: 20,
            borderRadius: 999,
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Lock size={10} color="#9CA3AF" strokeWidth={2.5} />
        </span>
      )}

      {/* Icon */}
      <div
        style={{
          width: 44,
          height: 44,
          margin: "0 auto 10px",
          borderRadius: 10,
          background: isInert ? "#E5E7EB" : meta.iconColor,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "transform 0.2s ease",
        }}
      >
        {meta.isAIFeature ? (
          <Sparkles size={22} color="#FFFFFF" strokeWidth={2} aria-hidden="true" />
        ) : (
          <app.icon size={22} color="#FFFFFF" strokeWidth={2} aria-hidden="true" />
        )}
      </div>

      {/* Name */}
      <div
        style={{
          fontSize: 13,
          fontWeight: 500,
          color: isInert ? "#9CA3AF" : "#0D1B2E",
          marginBottom: 3,
          lineHeight: 1.4,
        }}
      >
        {app.label}
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontSize: 11,
          fontWeight: 400,
          color: "#9CA3AF",
          lineHeight: 1.5,
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
          overflow: "hidden",
          minHeight: 33,
        }}
      >
        {isInert ? "غير متاح" : isPremiumLocked ? "ترقية للاستخدام" : app.description}
      </div>
    </motion.button>
  );
}
