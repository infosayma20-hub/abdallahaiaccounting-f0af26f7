import type { CSSProperties } from "react";

export const NAVY = "#0D1B2E";
export const BORDER = "#E3E7EE";
export const MUTED = "#5B6676";
export const SOFT = "#F5F7FA";

export const card: CSSProperties = {
  background: "#FFFFFF", border: `1px solid ${BORDER}`, borderRadius: 10, padding: 16,
};
export const label: CSSProperties = { fontSize: 12, fontWeight: 600, color: MUTED, marginBottom: 4, display: "block" };
export const input: CSSProperties = {
  width: "100%", border: `1px solid ${BORDER}`, borderRadius: 8, padding: "8px 10px", fontSize: 14,
  fontFamily: "Cairo, sans-serif", color: NAVY, background: "#FFFFFF", outline: "none",
};
export const textarea: CSSProperties = { ...input, minHeight: 72, resize: "vertical", lineHeight: 1.7 };
export const btnPrimary: CSSProperties = {
  background: NAVY, color: "#FFFFFF", border: "none", borderRadius: 8, padding: "8px 16px",
  fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "Cairo, sans-serif",
};
export const btnGhost: CSSProperties = {
  background: "#FFFFFF", color: NAVY, border: `1px solid ${BORDER}`, borderRadius: 8, padding: "7px 14px",
  fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Cairo, sans-serif",
};
export const th: CSSProperties = {
  textAlign: "right", fontSize: 12, fontWeight: 700, color: MUTED, padding: "10px 12px",
  borderBottom: `1px solid ${BORDER}`, background: SOFT, whiteSpace: "nowrap",
};
export const td: CSSProperties = { padding: "10px 12px", fontSize: 13, color: NAVY, borderBottom: `1px solid ${BORDER}` };

export const LEAD_STATUSES: { value: string; label: string }[] = [
  { value: "new", label: "جديد" },
  { value: "contacted", label: "تم التواصل" },
  { value: "quoted", label: "أُرسل عرض" },
  { value: "won", label: "تعاقد" },
  { value: "closed", label: "مغلق" },
];
