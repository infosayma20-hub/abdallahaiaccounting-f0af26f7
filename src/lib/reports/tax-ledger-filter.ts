import { supabase } from "@/integrations/supabase/client";

/**
 * Drop tax_ledger rows whose source invoice is voided / cancelled / reversed.
 * Keeps rows with no invoice link (manual adjustments) and credit/debit-note rows
 * (reference_type 'credit_note', 'debit_note', 'sales_return', 'purchase_return').
 *
 * Invoice tax_ledger rows are written with reference_type IN ('invoice','purchase')
 * and reference_id = invoices.id (see InvoiceCreatePage / InvoicesPage).
 */
export async function filterOutVoidedInvoiceRows<T extends { reference_type?: string | null; reference_id?: string | null }>(
  uid: string,
  rows: T[],
): Promise<T[]> {
  const invoiceIds = Array.from(
    new Set(
      rows
        .filter(r => r.reference_type === "invoice" || r.reference_type === "purchase")
        .map(r => r.reference_id)
        .filter(Boolean) as string[],
    ),
  );
  if (invoiceIds.length === 0) return rows;
  const { data: invs } = await supabase
    .from("invoices")
    .select("id, is_voided, status")
    .eq("user_id", uid)
    .in("id", invoiceIds);
  const voided = new Set(
    (invs || [])
      .filter((i: any) => i.is_voided === true || ["cancelled", "void", "reversed"].includes(String(i.status || "")))
      .map((i: any) => i.id as string),
  );
  if (voided.size === 0) return rows;
  return rows.filter(r => !(r.reference_id && voided.has(r.reference_id)));
}