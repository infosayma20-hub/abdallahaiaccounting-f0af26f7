/**
 * Reports Access Matrix — Role-Based filtering for /reports
 *
 * Keys match actual section IDs in src/pages/ReportsPage.tsx:
 *   financial | sales | purchases | inventory | hr | fixed-assets |
 *   currency | receivables-payables | invoice-tracking | orders |
 *   pos | van-sales | management
 *
 * Roles match user_roles.role values + canonical roles from the
 * RBAC standard (mem://auth/role-standardization-rbac-v2).
 */

export type ReportSectionId =
  | "financial"
  | "sales"
  | "purchases"
  | "inventory"
  | "hr"
  | "fixed-assets"
  | "currency"
  | "receivables-payables"
  | "invoice-tracking"
  | "orders"
  | "pos"
  | "van-sales"
  | "management";

const ALL: ReportSectionId[] = [
  "financial",
  "sales",
  "purchases",
  "inventory",
  "hr",
  "fixed-assets",
  "currency",
  "receivables-payables",
  "invoice-tracking",
  "orders",
  "pos",
  "van-sales",
  "management",
];

export const REPORT_ACCESS_MATRIX: Record<string, ReportSectionId[]> = {
  admin: ALL,
  super_admin: ALL,

  // محاسبون
  accountant_senior: [
    "financial",
    "sales",
    "purchases",
    "inventory",
    "currency",
    "receivables-payables",
    "invoice-tracking",
    "fixed-assets",
  ],
  accountant_sales: ["sales", "receivables-payables", "invoice-tracking"],
  accountant_purchases: ["purchases", "receivables-payables"],

  // مندوب — محدود جداً: فقط المبيعات + van sales
  sales_rep: ["sales", "van-sales"],

  // HR
  hr_manager: ["hr"],

  // POS
  cashier: ["pos", "sales"],

  // مخزن / تتبع
  store_tracker: ["inventory", "orders"],

  // مدراء (شامل لكن ليس admin)
  manager: [
    "sales",
    "purchases",
    "inventory",
    "receivables-payables",
    "invoice-tracking",
    "management",
  ],

  // موظف عادي → لا شيء
  employee: [],
  branch_scheduler: [],
  portal: [],
};

/**
 * Resolve allowed sections from a list of roles (union of all roles).
 * Empty roles list → treated as admin (business-owner fallback, matches RoleGuard behaviour).
 */
export function getAllowedSections(roles: string[]): Set<ReportSectionId> {
  const effective = roles.length === 0 ? ["admin"] : roles;
  const allowed = new Set<ReportSectionId>();
  for (const role of effective) {
    const sections = REPORT_ACCESS_MATRIX[role];
    if (sections) sections.forEach((s) => allowed.add(s));
  }
  return allowed;
}