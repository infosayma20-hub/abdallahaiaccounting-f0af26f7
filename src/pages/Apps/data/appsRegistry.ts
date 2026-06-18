/**
 * AMWALI Apps Registry — Phase 1
 * يصف كل تطبيق بفئته اللونية وقسمه (Core / Operations / Premium)
 * لا يكرر بيانات navigationConfig، فقط يضيف Metadata بصرية
 */

export type AppSection = "core" | "operations" | "premium";

export interface AppVisualMeta {
  id: string;          // matches navigationConfig NavItem.id
  iconColor: string;   // hex from category palette
  section: AppSection;
  isAIFeature?: boolean;
  isPremiumApp?: boolean; // متقدم/مدفوع
}

/* ───── AMWALI Category Color Palette (per brand spec) ───── */
export const PALETTE = {
  purple:   "#534AB7", // Dashboard / Analytics
  green:    "#1D9E75", // Finance / Accounting
  orange:   "#D85A30", // Sales / POS / Invoicing
  pink:     "#D4537E", // CRM
  blue:     "#378ADD", // Inventory
  lime:     "#639922", // POS Retail
  amber:    "#EF9F27", // VAT / Tax
  teal:     "#0F6E56", // Fixed Assets
  indigo:   "#185FA5", // HR / Payroll
  red:      "#A32D2D", // Reports
  violet:   "#7F77DD", // Workshops
  mint:     "#5DCAA5", // Purchases
  rust:     "#72243E", // Print Templates
  charcoal: "#444441", // Settings
  navy:     "#0D1B2E", // AI Accountant
  gray:     "#888780", // Tasks
  // Premium darker tones
  coralDark:  "#712B13",
  purpleDark: "#3C3489",
  tealDark:   "#27500A",
  amberDark:  "#633806",
} as const;

/* ───── Section accent colors ───── */
export const SECTION_ACCENTS: Record<AppSection, string> = {
  core:       "#0D1B2E",
  operations: "#D1D5DB",
  premium:    "#7F77DD",
};

export const SECTION_LABELS: Record<AppSection, { title: string; description?: string }> = {
  core:       { title: "الأساسية", description: "— الأكثر استخداماً في شركتك" },
  operations: { title: "العمليات والإدارة" },
  premium:    { title: "تطبيقات متقدمة" },
};

/* ───── App → visual metadata mapping ───── */
export const APPS_VISUAL_META: AppVisualMeta[] = [
  // CORE (الأساسية)
  { id: "dashboard",       iconColor: PALETTE.purple, section: "core" },
  { id: "finance",         iconColor: PALETTE.green,  section: "core" },
  { id: "sales",           iconColor: PALETTE.orange, section: "core" },
  { id: "crm",             iconColor: PALETTE.pink,   section: "core" },
  { id: "inventory",       iconColor: PALETTE.blue,   section: "core" },
  { id: "pos",             iconColor: PALETTE.lime,   section: "core" },
  { id: "ai-accountant",   iconColor: PALETTE.navy,   section: "core", isAIFeature: true },
  { id: "tax",             iconColor: PALETTE.amber,  section: "core" },

  // OPERATIONS (العمليات والإدارة)
  { id: "tasks",           iconColor: PALETTE.gray,     section: "operations" },
  { id: "notifications",   iconColor: PALETTE.red,      section: "operations" },
  { id: "workshops",       iconColor: PALETTE.violet,   section: "operations" },
  { id: "fixed-assets",    iconColor: PALETTE.teal,     section: "operations" },
  { id: "van-sales",       iconColor: PALETTE.blue,     section: "operations" },
  { id: "hr",              iconColor: PALETTE.indigo,   section: "operations" },
  { id: "reports",         iconColor: PALETTE.red,      section: "operations" },
  { id: "purchases",       iconColor: PALETTE.mint,     section: "operations" },
  { id: "print-templates", iconColor: PALETTE.rust,     section: "operations" },
  { id: "settings",        iconColor: PALETTE.charcoal, section: "operations" },

  // PREMIUM (متقدمة)
  { id: "travel",          iconColor: PALETTE.coralDark,  section: "premium", isPremiumApp: true },
  { id: "ecommerce",       iconColor: PALETTE.purpleDark, section: "premium", isPremiumApp: true },
  { id: "contractor",      iconColor: PALETTE.tealDark,   section: "premium", isPremiumApp: true },
  { id: "warranty",        iconColor: PALETTE.amberDark,  section: "premium", isPremiumApp: true },
];

export const getAppMeta = (id: string): AppVisualMeta | undefined =>
  APPS_VISUAL_META.find(a => a.id === id);
