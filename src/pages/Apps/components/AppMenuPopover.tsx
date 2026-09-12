import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft } from "lucide-react";
import type { NavGroup } from "@/config/navigationConfig";
import { useTT } from "@/i18n/dict";

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
  const tt = useTT();
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [isMobile, setIsMobile] = useState<boolean>(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Position popover under anchor (uses viewport coords + position:fixed)
  useEffect(() => {
    if (!open || !anchorEl || isMobile) return;

    const update = () => {
      const rect = anchorEl.getBoundingClientRect();
      const vh = window.innerHeight;
      const vw = window.innerWidth;
      const margin = 12;
      const width = Math.min(Math.max(280, rect.width), vw - margin * 2);
      const rawLeft = rect.left + rect.width / 2 - width / 2;
      const left = Math.min(Math.max(margin, rawLeft), vw - width - margin);
      const spaceBelow = vh - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      let top: number;
      let maxHeight: number;
      // Prefer below; flip above if much more room there
      if (spaceBelow >= 240 || spaceBelow >= spaceAbove) {
        top = rect.bottom + 8;
        maxHeight = Math.max(200, spaceBelow);
      } else {
        maxHeight = Math.max(200, spaceAbove);
        top = Math.max(margin, rect.top - 8 - maxHeight);
      }
      setPos({ top, left, width, maxHeight });
    };

    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorEl, isMobile]);

  // Close on outside click / Esc
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: Event) => {
      const target = e.target as Node;
      if (popRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const t = setTimeout(() => {
      window.addEventListener("mousedown", handleClick);
      window.addEventListener("touchstart", handleClick);
    }, 0);
    window.addEventListener("keydown", handleKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("touchstart", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [open, anchorEl, onClose]);

  if (!open) return null;
  if (!isMobile && !pos) return null;

  const body = (
    <>
      {/* Header strip */}
      <div
        style={{
          padding: isMobile ? "14px 16px" : "10px 14px",
          borderBottom: "1px solid #f1f5f9",
          background: `linear-gradient(135deg, ${accentColor}10, transparent)`,
          borderRadius: isMobile ? "18px 18px 0 0" : "14px 14px 0 0",
          position: "sticky",
          top: 0,
          zIndex: 1,
        }}
      >
        {isMobile && (
          <div
            aria-hidden="true"
            style={{ width: 40, height: 4, borderRadius: 999, background: "#e2e8f0", margin: "0 auto 10px" }}
          />
        )}
        <p style={{ fontSize: isMobile ? 14 : 12, fontWeight: 700, color: "#0D1B2E", margin: 0 }}>
          {title}
        </p>
        <p style={{ fontSize: isMobile ? 11 : 10, color: "#94a3b8", margin: "2px 0 0 0" }}>
          اختر القسم المطلوب للانتقال السريع
        </p>
      </div>

      {/* Groups */}
      <div style={{ padding: isMobile ? "8px 10px calc(16px + env(safe-area-inset-bottom))" : "6px" }}>
        {groups.map((g, gi) => (
          <div key={gi} style={{ marginBottom: gi === groups.length - 1 ? 0 : 4 }}>
            {g.groupLabel && (
              <p
                style={{
                  fontSize: isMobile ? 11 : 10,
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
                className="w-full flex items-center justify-between gap-2 transition-colors active:opacity-70"
                style={{
                  padding: isMobile ? "13px 12px" : "8px 10px",
                  minHeight: isMobile ? 46 : undefined,
                  borderRadius: isMobile ? 12 : 8,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "right",
                  fontSize: isMobile ? 14 : 12.5,
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
                <span className="truncate">{tt(c.label)}</span>
                <ChevronLeft size={isMobile ? 15 : 13} style={{ color: "#cbd5e1", flexShrink: 0 }} />
              </button>
            ))}
          </div>
        ))}
      </div>
    </>
  );

  if (isMobile) {
    return createPortal(
      <>
        <div
          onClick={onClose}
          style={{ position: "fixed", inset: 0, background: "rgba(13,27,46,0.35)", zIndex: 59 }}
          className="animate-in fade-in duration-150"
        />
        <div
          ref={popRef}
          dir="rtl"
          className="animate-in slide-in-from-bottom duration-200"
          style={{
            position: "fixed",
            insetInline: 0,
            bottom: 0,
            maxHeight: "80dvh",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            overscrollBehavior: "contain",
            zIndex: 60,
            background: "#ffffff",
            borderRadius: "18px 18px 0 0",
            boxShadow: "0 -12px 32px -8px rgba(13,27,46,0.25)",
            fontFamily: "Cairo, Tajawal, sans-serif",
          }}
        >
          {body}
        </div>
      </>,
      document.body
    );
  }

  return createPortal(
    <div
      ref={popRef}
      dir="rtl"
      className="animate-in fade-in zoom-in-95 duration-150"
      style={{
        position: "fixed",
        top: pos!.top,
        left: pos!.left,
        width: pos!.width,
        maxHeight: pos!.maxHeight,
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
      {body}
    </div>,
    document.body
  );
