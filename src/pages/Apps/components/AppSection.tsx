import { useState, useEffect, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { SECTION_ACCENTS, SECTION_LABELS, type AppSection as SectionKey } from "../data/appsRegistry";

interface Props {
  section: SectionKey;
  isPremium?: boolean;
  children: ReactNode;
}

export default function AppSection({ section, isPremium, children }: Props) {
  const accent = SECTION_ACCENTS[section];
  const { title, description } = SECTION_LABELS[section];
  const storageKey = `amwali:apps:section:${section}:collapsed`;
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(storageKey) === "1"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem(storageKey, collapsed ? "1" : "0"); } catch {}
  }, [collapsed, storageKey]);

  return (
    <section style={{ padding: "18px 0 8px" }}>
      {/* Section header */}
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
        style={{
          display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "4px 6px",
          width: "100%", background: "transparent", border: "none", cursor: "pointer",
          borderRadius: 8, transition: "background 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(13,27,46,0.04)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      >
        <div
          aria-hidden="true"
          style={{
            width: 3,
            height: 14,
            borderRadius: 2,
            background: accent,
            flexShrink: 0,
          }}
        />
        <h3
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "#0D1B2E",
            margin: 0,
            fontFamily: "Cairo, Tajawal, sans-serif",
          }}
        >
          {title}
        </h3>
        {isPremium && (
          <span
            style={{
              background: "#EEEDFE",
              color: "#3C3489",
              fontSize: 11,
              fontWeight: 500,
              padding: "2px 8px",
              borderRadius: 999,
              fontFamily: "Cairo, Tajawal, sans-serif",
            }}
          >
            Premium
          </span>
        )}
        {description && (
          <span
            style={{
              fontSize: 12,
              fontWeight: 400,
              color: "#9CA3AF",
              fontFamily: "Cairo, Tajawal, sans-serif",
            }}
          >
            {description}
          </span>
        )}
        <ChevronDown
          size={16}
          style={{
            color: "#94a3b8",
            marginInlineStart: "auto",
            transition: "transform 0.2s",
            transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
          }}
        />
      </button>

      {/* Apps grid */}
      {!collapsed && <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(3, 1fr)",
        }}
        className="amwali-apps-grid"
      >
        {children}
      </div>}

      <style>{`
        @media (max-width: 374px) {
          .amwali-apps-grid { gap: 8px !important; }
        }
        @media (min-width: 768px) {
          .amwali-apps-grid { grid-template-columns: repeat(3, 1fr) !important; }
        }
        @media (min-width: 1024px) {
          .amwali-apps-grid { grid-template-columns: repeat(4, 1fr) !important; }
        }
      `}</style>
    </section>
  );
}
