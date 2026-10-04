// POS v2 (experimental) — design tokens. All custom colors are applied via
// inline styles from these objects so the v1 POS and global theme are untouched.
export type PosV2Tokens = {
  bg: string; surface: string; card: string; input: string; border: string;
  text: string; muted: string; accent: string; onAccent: string; price: string;
  pay: string; onPay: string; warnBg: string; warnText: string; dark: boolean;
};

export const POS_V2_DARK: PosV2Tokens = {
  bg: "#111318", surface: "#16191F", card: "#1B1F26", input: "#1F232B", border: "#2A2F38",
  text: "#F1F3F6", muted: "#9AA1AD", accent: "#FF7A1A", onAccent: "#111111", price: "#FFB070",
  pay: "#FF7A1A", onPay: "#111111", warnBg: "#3A1D1D", warnText: "#FF9B9B", dark: true,
};

export const POS_V2_LIGHT: PosV2Tokens = {
  bg: "#F4F6FA", surface: "#FFFFFF", card: "#FFFFFF", input: "#F4F6FA", border: "#E2E6EE",
  text: "#141B2B", muted: "#5F6879", accent: "#2563EB", onAccent: "#FFFFFF", price: "#1D4ED8",
  pay: "#16A34A", onPay: "#FFFFFF", warnBg: "#FDECEC", warnText: "#B42318", dark: false,
};

const PALETTE = ["#F59E0B", "#0EA5E9", "#8B5CF6", "#EF4444", "#10B981", "#EC4899", "#14B8A6", "#F97316"];

/** Deterministic category color from its id (same color every time). */
export function posV2CatColor(key: string | null | undefined): string {
  const s = key || "";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export const fmtMoney = (n: number) => `${(Number.isFinite(n) ? n : 0).toFixed(2)} ₪`;
