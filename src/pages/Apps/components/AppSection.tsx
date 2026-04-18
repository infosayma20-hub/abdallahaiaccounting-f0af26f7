import type { ReactNode } from "react";
import { SECTION_ACCENTS, SECTION_LABELS, type AppSection as SectionKey } from "../data/appsRegistry";

interface Props {
  section: SectionKey;
  isPremium?: boolean;
  children: ReactNode;
}

export default function AppSection({ section, isPremium, children }: Props) {
  const accent = SECTION_ACCENTS[section];
  const { title, description } = SECTION_LABELS[section];

  return (
    <section style={{ padding: "18px 0 8px" }}>
      {/* Section header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "0 4px" }}>
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
      </div>

      {/* Apps grid */}
      <div
        style={{
          display: "grid",
          gap: 10,
          gridTemplateColumns: "repeat(2, 1fr)",
        }}
        className="amwali-apps-grid"
      >
        {children}
      </div>

      <style>{`
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
