// Print template theming system
// Each company can have a custom theme; default is AMWALI standard

export interface PrintTheme {
  id: string;
  // Colors
  primaryColor: string;     // Main brand color
  accentColor: string;      // Accent/gold
  textColor: string;        // Body text
  amountColor: string;      // For monetary amounts
  lightBg: string;          // Light backgrounds
  headerBg: string;         // Header/footer background
  headerText: string;       // Header/footer text color
  // Typography
  fontFamily: string;
  // Layout
  showWatermark: boolean;
  watermarkOpacity: number;
  showEnglishName: boolean;
  englishName: string;
  tagline: string;
  // Header style
  headerStyle: "standard" | "premium";
  // Separator style
  separatorWeight: number;  // px
  // Amount display
  showAmountInWords: boolean;
  amountFontSize: number;   // px
  // Footer style
  footerStyle: "simple" | "branded";
  // Signature block
  signatureStyle: "standard" | "formal";
  signatureText: string;
}

export const DEFAULT_THEME: PrintTheme = {
  id: "default",
  primaryColor: "#0D1B2E",
  accentColor: "#6B7280",
  textColor: "#111827",
  amountColor: "#111827",
  lightBg: "#F9FAFB",
  headerBg: "transparent",
  headerText: "#111827",
  fontFamily: "'Cairo', Arial, sans-serif",
  showWatermark: false,
  watermarkOpacity: 0,
  showEnglishName: false,
  englishName: "",
  tagline: "",
  headerStyle: "standard",
  separatorWeight: 1.5,
  showAmountInWords: false,
  amountFontSize: 13,
  footerStyle: "simple",
  signatureStyle: "standard",
  signatureText: "المدير",
};

export const DOULIA_THEME: PrintTheme = {
  id: "doulia",
  primaryColor: "#1B2B4B",
  accentColor: "#C9A84C",
  textColor: "#1A1A2E",
  amountColor: "#C0392B",
  lightBg: "#F8F9FA",
  headerBg: "#1B2B4B",
  headerText: "#FFFFFF",
  fontFamily: "'Cairo', Arial, sans-serif",
  showWatermark: true,
  watermarkOpacity: 0.06,
  showEnglishName: true,
  englishName: "Doulia Kitchen ®",
  tagline: "ورش ومناجر",
  headerStyle: "premium",
  separatorWeight: 2.5,
  showAmountInWords: true,
  amountFontSize: 28,
  footerStyle: "branded",
  signatureStyle: "formal",
  signatureText: "ختم الشركة وتوقيع المدير",
};

// Map user email to theme
const THEME_MAP: Record<string, PrintTheme> = {
  "douliakitchens@gmail.com": DOULIA_THEME,
};

export function getThemeForUser(email?: string | null): PrintTheme {
  if (!email) return DEFAULT_THEME;
  return THEME_MAP[email.toLowerCase()] || DEFAULT_THEME;
}

export function isDoulia(email?: string | null): boolean {
  return email?.toLowerCase() === "douliakitchens@gmail.com";
}
