/**
 * Single Source of Truth for invoice type literals.
 * Historically, the rep_sale RPC briefly wrote `'sales'` (plural) before being
 * patched to `'sale'` (singular). To prevent legacy drift from breaking reports,
 * always filter via these constants — never hardcode `'sale'` or `'sales'` alone.
 */
export const SALES_INVOICE_TYPES = ["sale", "sales"] as const;
export const PURCHASE_INVOICE_TYPES = ["purchase"] as const;

export const isSalesInvoiceType = (t: string | null | undefined) =>
  !!t && (SALES_INVOICE_TYPES as readonly string[]).includes(t);
