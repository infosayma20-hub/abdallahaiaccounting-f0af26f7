import { supabase } from "@/integrations/supabase/client";
import { filterOutVoidedInvoiceRows } from "./tax-ledger-filter";

/**
 * Single source of truth for VAT period summaries.
 * Used by both the Tax Center summary cards and the Periodic Report
 * so the numbers always match for the same {ownerId, year, month}.
 *
 * Rules:
 *  - Source: public.tax_ledger filtered by (user_id, period_year, period_month).
 *  - Voided / cancelled / reversed invoices are excluded via filterOutVoidedInvoiceRows.
 *  - Credit notes (output) and debit notes (input) are detected by
 *    reference_type ('credit_note' / 'debit_note' / 'sales_return' / 'purchase_return')
 *    OR by sign (negative tax_amount for the matching tax_type).
 *  - All currency figures are rounded to 2 decimals with round2.
 */

export interface TaxSummary {
  // Sales side
  standardSalesNet: number;
  standardTax: number;
  zeroSalesNet: number;
  exemptSalesNet: number;
  creditNotesNet: number;   // absolute value
  creditNotesTax: number;   // absolute value
  totalOutputTax: number;   // standardTax - creditNotesTax (net due)

  // Purchases side
  deductiblePurchasesNet: number;
  deductibleInputTax: number;
  nonDeductiblePurchasesNet: number;
  nonDeductibleTax: number;
  zeroPurchasesNet: number;
  exemptPurchasesNet: number;
  debitNotesNet: number;
  debitNotesTax: number;
  totalInputTax: number;    // deductibleInputTax - debitNotesTax (net deductible)

  netTaxDue: number;        // totalOutputTax - totalInputTax
}

export const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const CREDIT_REFS = new Set(["credit_note", "sales_return"]);
const DEBIT_REFS = new Set(["debit_note", "purchase_return"]);

export async function calculateTaxSummary(params: {
  ownerId: string;
  year: number;
  month: number;
}): Promise<TaxSummary> {
  const { ownerId, year, month } = params;
  const empty: TaxSummary = {
    standardSalesNet: 0, standardTax: 0, zeroSalesNet: 0, exemptSalesNet: 0,
    creditNotesNet: 0, creditNotesTax: 0, totalOutputTax: 0,
    deductiblePurchasesNet: 0, deductibleInputTax: 0,
    nonDeductiblePurchasesNet: 0, nonDeductibleTax: 0,
    zeroPurchasesNet: 0, exemptPurchasesNet: 0,
    debitNotesNet: 0, debitNotesTax: 0, totalInputTax: 0,
    netTaxDue: 0,
  };
  if (!ownerId) return empty;

  const { data: ledger } = await supabase
    .from("tax_ledger")
    .select("*")
    .eq("user_id", ownerId)
    .eq("period_year", year)
    .eq("period_month", month);

  const rows = await filterOutVoidedInvoiceRows(ownerId, ledger || []);

  const isCreditNote = (r: any) =>
    CREDIT_REFS.has(String(r.reference_type)) ||
    (r.tax_type === "output" && Number(r.tax_amount) < 0);
  const isDebitNote = (r: any) =>
    DEBIT_REFS.has(String(r.reference_type)) ||
    (r.tax_type === "input" && Number(r.tax_amount) < 0);

  const output = rows.filter((r: any) => r.tax_type === "output");
  const input = rows.filter((r: any) => r.tax_type === "input");

  const creditNotes = output.filter(isCreditNote);
  const debitNotes = input.filter(isDebitNote);
  const regularOutput = output.filter((r: any) => !isCreditNote(r));
  const regularInput = input.filter((r: any) => !isDebitNote(r));

  const sumN = (arr: any[], k: string) => arr.reduce((s, r) => s + Number(r[k] || 0), 0);

  const standardSalesNet = sumN(regularOutput.filter((r: any) => r.tax_category === "standard"), "net_amount");
  const standardTax = sumN(regularOutput.filter((r: any) => r.tax_category === "standard"), "tax_amount");
  const zeroSalesNet = sumN(regularOutput.filter((r: any) => r.tax_category === "zero"), "net_amount");
  const exemptSalesNet = sumN(regularOutput.filter((r: any) => r.tax_category === "exempt"), "net_amount");
  const creditNotesNet = Math.abs(sumN(creditNotes, "net_amount"));
  const creditNotesTax = Math.abs(sumN(creditNotes, "tax_amount"));

  const deductiblePurchasesNet = sumN(regularInput.filter((r: any) => r.is_deductible && r.tax_category === "standard"), "net_amount");
  const deductibleInputTax = sumN(regularInput.filter((r: any) => r.is_deductible && r.tax_category === "standard"), "tax_amount");
  const nonDeductiblePurchasesNet = sumN(regularInput.filter((r: any) => !r.is_deductible), "net_amount");
  const nonDeductibleTax = sumN(regularInput.filter((r: any) => !r.is_deductible), "tax_amount");
  const zeroPurchasesNet = sumN(regularInput.filter((r: any) => r.tax_category === "zero"), "net_amount");
  const exemptPurchasesNet = sumN(regularInput.filter((r: any) => r.tax_category === "exempt"), "net_amount");
  const debitNotesNet = Math.abs(sumN(debitNotes, "net_amount"));
  const debitNotesTax = Math.abs(sumN(debitNotes, "tax_amount"));

  const totalOutputTax = round2(standardTax - creditNotesTax);
  const totalInputTax = round2(deductibleInputTax - debitNotesTax);
  const netTaxDue = round2(totalOutputTax - totalInputTax);

  return {
    standardSalesNet: round2(standardSalesNet),
    standardTax: round2(standardTax),
    zeroSalesNet: round2(zeroSalesNet),
    exemptSalesNet: round2(exemptSalesNet),
    creditNotesNet: round2(creditNotesNet),
    creditNotesTax: round2(creditNotesTax),
    totalOutputTax,
    deductiblePurchasesNet: round2(deductiblePurchasesNet),
    deductibleInputTax: round2(deductibleInputTax),
    nonDeductiblePurchasesNet: round2(nonDeductiblePurchasesNet),
    nonDeductibleTax: round2(nonDeductibleTax),
    zeroPurchasesNet: round2(zeroPurchasesNet),
    exemptPurchasesNet: round2(exemptPurchasesNet),
    debitNotesNet: round2(debitNotesNet),
    debitNotesTax: round2(debitNotesTax),
    totalInputTax,
    netTaxDue,
  };
}