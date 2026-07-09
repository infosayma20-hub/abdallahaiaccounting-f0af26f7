export type AmwaliPricingType =
  | "fixed"
  | "per_pos"
  | "per_kiosk"
  | "per_hr_employee"
  | "per_crm_user"
  | "per_system_user"
  | "annual_only"
  | "onetime_only"
  | "custom";

export interface AmwaliCounters {
  pos_points: number;
  kiosk_points: number;
  hr_employees: number;
  crm_users: number;
  system_users: number;
}

export interface AmwaliItem {
  id: string;
  catalog_code?: string | null;
  name: string;
  description: string;
  pricing_type: AmwaliPricingType;
  qty: number;
  onetime_price: number;
  annual_price: number;
  sort_order: number;
}

export interface CalcTotals {
  subtotalOnetime: number;
  subtotalAnnual: number;
  subtotal: number;
  discount: number;
  taxable: number;
  taxAmount: number;
  grandTotal: number;
  lines: (AmwaliItem & { lineOnetime: number; lineAnnual: number; lineTotal: number })[];
}

export const PRICING_TYPE_LABEL: Record<AmwaliPricingType, string> = {
  fixed: "كمية ثابتة",
  per_pos: "لكل نقطة بيع POS",
  per_kiosk: "لكل نقطة كيوسك",
  per_hr_employee: "لكل موظف HR",
  per_crm_user: "لكل مستخدم CRM",
  per_system_user: "لكل مستخدم نظام",
  annual_only: "سنوي فقط",
  onetime_only: "لمرة واحدة فقط",
  custom: "يدوي مخصص",
};

export const qtyFromCounters = (
  type: AmwaliPricingType,
  counters: AmwaliCounters,
  fallback: number
): number => {
  switch (type) {
    case "per_pos": return counters.pos_points || 0;
    case "per_kiosk": return counters.kiosk_points || 0;
    case "per_hr_employee": return counters.hr_employees || 0;
    case "per_crm_user": return counters.crm_users || 0;
    case "per_system_user": return counters.system_users || 0;
    default: return fallback;
  }
};

export const isCounterDriven = (t: AmwaliPricingType) =>
  ["per_pos", "per_kiosk", "per_hr_employee", "per_crm_user", "per_system_user"].includes(t);

export const calcQuotationTotals = (
  items: AmwaliItem[],
  discount: number,
  taxRate: number
): CalcTotals => {
  const lines = items.map((it) => {
    const q = Number(it.qty) || 0;
    const o = (Number(it.onetime_price) || 0) * q;
    const a = (Number(it.annual_price) || 0) * q;
    return { ...it, lineOnetime: o, lineAnnual: a, lineTotal: o + a };
  });
  const subtotalOnetime = lines.reduce((s, r) => s + r.lineOnetime, 0);
  const subtotalAnnual = lines.reduce((s, r) => s + r.lineAnnual, 0);
  const subtotal = subtotalOnetime + subtotalAnnual;
  const d = Math.max(0, Number(discount) || 0);
  const taxable = Math.max(0, subtotal - d);
  const taxAmount = taxable * ((Number(taxRate) || 0) / 100);
  const grandTotal = taxable + taxAmount;
  return { subtotalOnetime, subtotalAnnual, subtotal, discount: d, taxable, taxAmount, grandTotal, lines };
};

export const currencySymbol = (code: string) =>
  code === "USD" ? "$" : code === "ILS" ? "₪" : code === "EUR" ? "€" : code === "JOD" ? "JD" : code;

export const fmtMoney = (n: number) =>
  (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });