/**
 * P3 — Debug-only integrity loader (read-side, no UI).
 *
 * Runs the five core cross-report checks (A-E) and logs results to the
 * developer console. Safe to call from any admin/debug page.
 *
 * Usage:
 *   import { runIntegrityChecks } from "@/lib/reports/integrity-report";
 *   runIntegrityChecks(dataOwnerId).then(console.table);
 */

import { supabase } from "@/integrations/supabase/client";
import {
  compareTotals,
  compareInventoryValue,
  compareARAP,
  type ReconResult,
  summarize,
} from "./reconciliation";

const REVENUE_PREFIX = "4";
const INVENTORY_CODE = "1140";
const AR_CODE = "1130";
const AP_CODE = "2110";
const OUTPUT_VAT_CODE = "2190";
const INPUT_VAT_CODE = "1190";

const VOID_STATUSES = ["cancelled", "void", "reversed", "draft"];

async function fetchTransactions(uid: string) {
  // Page through to bypass the 1000-row default cap.
  const all: any[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("transactions")
      .select("debit_account_code, credit_account_code, amount, contact_id, is_deleted")
      .eq("user_id", uid)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

function glBalance(txs: any[], code: string, side: "debit" | "credit") {
  const dr = txs.filter(t => t.debit_account_code === code).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const cr = txs.filter(t => t.credit_account_code === code).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  return side === "debit" ? dr - cr : cr - dr;
}

function glPrefix(txs: any[], prefix: string, side: "debit" | "credit") {
  const dr = txs.filter(t => (t.debit_account_code || "").startsWith(prefix)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const cr = txs.filter(t => (t.credit_account_code || "").startsWith(prefix)).reduce((s, t) => s + (Number(t.amount) || 0), 0);
  return side === "debit" ? dr - cr : cr - dr;
}

/** Run all integrity checks for a tenant (dataOwnerId). */
export async function runIntegrityChecks(uid: string): Promise<ReconResult[]> {
  const results: ReconResult[] = [];

  const [txs, invs, prods, taxOut, taxIn] = await Promise.all([
    fetchTransactions(uid),
    supabase
      .from("invoices")
      .select("invoice_type, status, is_voided, subtotal, discount_amount, tax_amount")
      .eq("user_id", uid),
    supabase
      .from("products")
      .select("quantity, buy_price")
      .eq("user_id", uid),
    supabase.from("tax_ledger").select("tax_amount").eq("user_id", uid).eq("tax_type", "output"),
    supabase.from("tax_ledger").select("tax_amount").eq("user_id", uid).eq("tax_type", "input"),
  ]);

  const validSale = (invs.data || []).filter(
    (i: any) => i.invoice_type === "sale" && !i.is_voided && !VOID_STATUSES.includes(String(i.status || "")),
  );

  // A) P&L revenue (GL 4xxx credit balance) vs invoice net (subtotal - discount)
  const glRevenue = glPrefix(txs, REVENUE_PREFIX, "credit");
  const invoiceNet = validSale.reduce((s: number, i: any) => s + (Number(i.subtotal) || 0) - (Number(i.discount_amount) || 0), 0);
  results.push({ ...compareTotals("A_revenue", invoiceNet, glRevenue), note: "GL 4xxx vs Σ(subtotal - discount)" });

  // B) Output VAT GL (2190) vs tax_ledger output total
  const glVatOut = glBalance(txs, OUTPUT_VAT_CODE, "credit");
  const tlVatOut = (taxOut.data || []).reduce((s: number, r: any) => s + (Number(r.tax_amount) || 0), 0);
  results.push({ ...compareTotals("B_vat_output", tlVatOut, glVatOut), note: `GL ${OUTPUT_VAT_CODE} vs tax_ledger output` });

  // B2) Input VAT GL (1190) vs tax_ledger input total — if either side has activity
  const glVatIn = glBalance(txs, INPUT_VAT_CODE, "debit");
  const tlVatIn = (taxIn.data || []).reduce((s: number, r: any) => s + (Number(r.tax_amount) || 0), 0);
  if (glVatIn !== 0 || tlVatIn !== 0) {
    results.push({ ...compareTotals("B_vat_input", tlVatIn, glVatIn), note: `GL ${INPUT_VAT_CODE} vs tax_ledger input` });
  }

  // C) Inventory: live Σ qty*buy_price vs GL 1140 debit balance
  const liveVal = (prods.data || []).reduce(
    (s: number, p: any) => s + Math.max(0, Number(p.quantity) || 0) * (Number(p.buy_price) || 0),
    0,
  );
  const glInventory = glBalance(txs, INVENTORY_CODE, "debit");
  results.push({ ...compareInventoryValue(liveVal, glInventory, 1.0), note: `Σ qty*buy_price vs GL ${INVENTORY_CODE}` });

  // D) AR: Σ contact-tagged 1130 movement vs GL 1130 control balance
  const ar1130 = txs
    .filter(t => (t.debit_account_code === AR_CODE || t.credit_account_code === AR_CODE) && t.contact_id)
    .reduce((s, t) => {
      const a = Number(t.amount) || 0;
      return s + (t.debit_account_code === AR_CODE ? a : -a);
    }, 0);
  const glAr = glBalance(txs, AR_CODE, "debit");
  results.push({ ...compareARAP("ar", ar1130, glAr), note: `Σ customer subledger vs GL ${AR_CODE}` });

  // E) AP: Σ contact-tagged 2110 movement vs GL 2110 control balance
  const ap2110 = txs
    .filter(t => (t.debit_account_code === AP_CODE || t.credit_account_code === AP_CODE) && t.contact_id)
    .reduce((s, t) => {
      const a = Number(t.amount) || 0;
      return s + (t.credit_account_code === AP_CODE ? a : -a);
    }, 0);
  const glAp = glBalance(txs, AP_CODE, "credit");
  results.push({ ...compareARAP("ap", ap2110, glAp), note: `Σ supplier subledger vs GL ${AP_CODE}` });

  // Dev-only console output
  if (typeof window !== "undefined") {
    // eslint-disable-next-line no-console
    console.groupCollapsed(`[P3 integrity] tenant=${uid}`);
    // eslint-disable-next-line no-console
    console.log(summarize(results));
    // eslint-disable-next-line no-console
    console.table(results);
    // eslint-disable-next-line no-console
    console.groupEnd();
  }

  return results;
}