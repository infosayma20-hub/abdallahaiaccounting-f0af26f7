import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import type { NavGroup } from "@/config/navigationConfig";

interface Props {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  title: string;
  groups: NavGroup[];
  accentColor: string;
  onNavigate: (path: string) => void;
}

/**
 * AppMenuPopover — قائمة منسدلة تظهر فوق بطاقة التطبيق
 * تعرض أقسام التطبيق (groups) وروابطها الفرعية للوصول السريع
 * بدون فتح الصفحة الرئيسية للتطبيق.
 */
export default function AppMenuPopover({
  anchorEl, open, onClose, title, groups, accentColor, onNavigate,
}: Props) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  // Position popover under anchor (uses viewport coords + position:fixed)
  useEffect(() => {
    if (!open || !anchorEl) return;

    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      const width = Math.max(280, rect.width);
      const left = rect.left + rect.width / 2 - width / 2;
      const top = rect.bottom + 8;
      setPos({ top, left: Math.max(8, left), width });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorEl]);

  // Close on outside click / Esc
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    setTimeout(() => {
      window.addEventListener("mousedown", handleClick);
    }, 0);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, anchorEl, onClose]);

  if (!open || !pos) return null;

  return createPortal(
    <div
      ref={popRef}
      dir="rtl"
      className="animate-in fade-in zoom-in-95 duration-150"
      style={{
        position: "absolute",
        top: pos.top,
        left: pos.left,
        width: pos.width,
        maxHeight: "70vh",
        overflowY: "auto",
        zIndex: 60,
        background: "#ffffff",
        borderRadius: 14,
        border: "1px solid #e2e8f0",
        boxShadow:
          "0 12px 32px -8px rgba(13,27,46,0.18), 0 4px 12px -2px rgba(13,27,46,0.08), 0 0 0 1px rgba(255,255,255,0.6) inset",
        fontFamily: "Cairo, Tajawal, sans-serif",
      }}
    >
      {/* Header strip */}
      <div
        style={{
          padding: "10px 14px",
          borderBottom: "1px solid #f1f5f9",
          background: `linear-gradient(135deg, ${accentColor}10, transparent)`,
          borderRadius: "14px 14px 0 0",
        }}
      >
        <p style={{ fontSize: 12, fontWeight: 700, color: "#0D1B2E", margin: 0 }}>
          {title}
        </p>
        <p style={{ fontSize: 10, color: "#94a3b8", margin: "2px 0 0 0" }}>
          اختر القسم المطلوب للانتقال السريع
        </p>
      </div>

      {/* Groups */}
      <div style={{ padding: "6px" }}>
        {groups.map((g, gi) => (
          <div key={gi} style={{ marginBottom: gi === groups.length - 1 ? 0 : 4 }}>
            {g.groupLabel && (
              <p
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: "#94a3b8",
                  margin: "8px 10px 4px 10px",
                  letterSpacing: 0.3,
                }}
              >
                {g.groupLabel}
              </p>
            )}
            {g.children.map((c, ci) => (
              <button
                key={`${gi}-${ci}`}
                type="button"
                onClick={() => {
                  onNavigate(c.path);
                  onClose();
                }}
                className="w-full flex items-center justify-between gap-2 transition-colors"
                style={{
                  padding: "8px 10px",
                  borderRadius: 8,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "right",
                  fontSize: 12.5,
                  color: "#0D1B2E",
                  fontWeight: 500,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = `${accentColor}0d`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                }}
              >
                <span className="truncate">{c.label}</span>
                <ChevronLeft size={13} style={{ color: "#cbd5e1", flexShrink: 0 }} />
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}
