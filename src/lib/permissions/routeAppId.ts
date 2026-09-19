/**
 * Single source of truth: map a route (path + query) to its app id.
 * Used by useLockedModules (route locking) and ModuleGuard (render guard),
 * so per-user "deny" overrides apply to every screen of an app — including
 * screens whose URL does not start with the app name (e.g. /invoices).
 */

/** Simple prefix map: first match wins (longest prefixes listed first). */
const ROUTE_TO_APP_ID: Array<[string, string]> = [
  ["/pos-users", "pos"],
  ["/pos", "pos"],
  ["/employees", "hr"],
  ["/hr", "hr"],
  ["/inventory", "inventory"],
  ["/fixed-assets", "fixed-assets"],
  ["/projects", "contracting"],
  ["/workshops", "workshops"],
  ["/call-center", "call-center"],
  ["/warranty", "warranty"],
  ["/tourism", "tourism"],
  ["/ecommerce", "ecommerce"],
  ["/tasks", "tasks"],
  ["/ai-accountant", "ai-accountant"],
  // ── sales screens (URLs that don't start with /sales) ──
  ["/sales", "sales"],
  ["/credit-notes", "sales"],
  ["/delivery-notes", "sales"],
  ["/quotations", "sales"],
  ["/orders", "sales"],
  // ── purchases screens (URLs that don't start with /purchases) ──
  ["/purchases", "purchases"],
  ["/debit-notes", "purchases"],
  ["/procurement", "purchases"],
  ["/purchase-point", "purchases"],
  // ── rest ──
  ["/finance", "finance"],
  ["/accounting", "finance"],
  ["/tax", "tax"],
  ["/crm", "crm"],
  ["/reports", "reports"],
  ["/dashboards", "dashboards"],
  ["/dashboard", "dashboard"],
  ["/print-templates", "print-templates"],
  ["/van-sales", "van-sales"],
  ["/travel", "travel"],
  ["/contractor", "contractor"],
  ["/settings", "settings"],
];

export const APP_NAMES_AR: Record<string, string> = {
  pos: "نقطة البيع",
  hr: "الموارد البشرية",
  inventory: "المخزون",
  "fixed-assets": "الأصول الثابتة",
  contracting: "المقاولات",
  workshops: "الورشات",
  "call-center": "مركز الاتصال",
  warranty: "إدارة الكفالات",
  tourism: "السياحة والسفر",
  ecommerce: "التجارة الإلكترونية",
  tasks: "المهام",
  "ai-accountant": "المحاسب الذكي",
  sales: "المبيعات",
  purchases: "المشتريات",
  finance: "المالية",
  tax: "المحاسبة الضريبية",
  crm: "إدارة علاقات العملاء",
  reports: "التقارير",
  dashboards: "لوحات التحكم",
  dashboard: "لوحة المعلومات",
  "print-templates": "نماذج للطباعة",
  "van-sales": "البائع المتجول",
  travel: "السياحة والسفر",
  contractor: "المقاولات",
};

/**
 * /invoices is a shared screen for both sales and purchase invoices,
 * distinguished only by the `type` query param (default = sales).
 */
function invoicesAppId(search?: string): string {
  if (!search) return "sales";
  const type = new URLSearchParams(search.startsWith("?") ? search : `?${search}`).get("type");
  return type === "purchase" || type === "purchases" ? "purchases" : "sales";
}

/** Resolve the app id that owns a given route, or null when unknown. */
export function resolveRouteAppId(fullPath: string, search?: string): string | null {
  const qIndex = fullPath.indexOf("?");
  const path = qIndex >= 0 ? fullPath.slice(0, qIndex) : fullPath;
  const query = search || (qIndex >= 0 ? fullPath.slice(qIndex) : undefined);

  if (path === "/invoices" || path.startsWith("/invoices/")) {
    return invoicesAppId(query);
  }
  for (const [prefix, appId] of ROUTE_TO_APP_ID) {
    if (path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`)) {
      return appId;
    }
  }
  return null;
}
