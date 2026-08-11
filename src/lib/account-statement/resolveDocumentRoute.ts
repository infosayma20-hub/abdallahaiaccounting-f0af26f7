import { supabase } from "@/integrations/supabase/client";

/**
 * Resolves a statement row (transaction) to the route of its ORIGINAL document
 * page (invoice view / receipt / payment / journal voucher).
 *
 * Returns `null` when the row has no dedicated document page (POS lines,
 * opening balances, reversals, purchase_invoices legacy rows…), in which case
 * callers should fall back to the detail drawer.
 *
 * Lookup strategy (careful, order matters — some prefixes such as `REP-` exist
 * in BOTH `invoices` and `vouchers`, so the transaction_type decides which
 * table is probed first):
 *   1. vouchers / receipt_vouchers when the row is a voucher-type transaction
 *   2. invoices by invoice_number
 *   3. link by `linked_transaction_id` as a last resort
 */
export async function resolveDocumentRoute(params: {
  ownerId: string;
  reference: string | null | undefined;
  transactionType: string | null | undefined;
  transactionId: string;
}): Promise<string | null> {
  const { ownerId, transactionId } = params;
  if (!ownerId) return null;

  const ref = (params.reference || "").trim();
  const txType = (params.transactionType || "").toLowerCase();

  // Never deep-link these — no single source document to open.
  if (
    txType.includes("opening_balance") ||
    txType.includes("pos") ||
    txType.includes("reversal") ||
    /^(POS|OB|REV)-/i.test(ref)
  ) {
    return null;
  }

  const isReceipt = txType.includes("receipt") || txType.includes("قبض") || /^(REC|RV|BRV)-/i.test(ref);
  const isPayment =
    txType.includes("payment") ||
    txType.includes("صرف") ||
    txType.includes("employee_salary") ||
    txType.includes("employee_advance") ||
    /^(PV|BPV)-/i.test(ref);
  const isJournal =
    txType.includes("journal") || txType.includes("قيد") || /^(JV|QV)-/i.test(ref);
  const isVoucherLike = isReceipt || isPayment || isJournal;

  const voucherRoute = (v: { id: string; type?: string | null; subtype?: string | null }) => {
    if (v.type === "journal") return `/finance/journal/new?edit=${v.id}`;
    const kind = v.type === "receipt" ? "receipt" : v.type === "payment" ? "payment" : isReceipt ? "receipt" : "payment";
    const bulk = v.subtype === "bulk" || /^B(RV|PV)-/i.test(ref);
    return bulk ? `/finance/${kind}/bulk/${v.id}/edit` : `/finance/${kind}/${v.id}/edit`;
  };

  const findInvoice = async (): Promise<string | null> => {
    if (!ref) return null;
    // Returns (PR- purchase / SR- sales) live in `returns`, not `invoices`.
    const { data } = await supabase
      .from("invoices")
      .select("id")
      .eq("user_id", ownerId)
      .eq("invoice_number", ref)
      .limit(1);
    const inv = ((data as any[]) || [])[0];
    return inv?.id ? `/invoices/new?edit=${inv.id}` : null;
  };

  const findReturn = async (): Promise<string | null> => {
    if (!ref) return null;
    const { data } = await supabase
      .from("returns" as any)
      .select("id, return_type")
      .eq("user_id", ownerId)
      .eq("return_number", ref)
      .limit(1);
    const r = ((data as any[]) || [])[0];
    if (!r?.id) return null;
    const base = r.return_type === "sales" ? "/sales/returns/new" : "/purchases/returns/new";
    return `${base}?view=${r.id}`;
  };

  const findVoucherByRef = async (): Promise<string | null> => {
    if (!ref) return null;
    // Receipt vouchers live in their own table (REC-…)
    if (isReceipt || /^REC-/i.test(ref)) {
      const { data: rv } = await supabase
        .from("receipt_vouchers")
        .select("id")
        .eq("user_id", ownerId)
        .eq("receipt_number", ref)
        .limit(1);
      const rvRow = ((rv as any[]) || [])[0];
      if (rvRow?.id) return `/finance/receipt/${rvRow.id}/edit`;
    }
    const { data: rows } = await supabase
      .from("vouchers")
      .select("id, type, subtype")
      .eq("user_id", ownerId)
      .eq("ref_number", ref)
      .neq("status", "cancelled")
      .limit(5);
    const list = (rows as any[]) || [];
    if (!list.length) return null;
    const preferred =
      (isJournal && list.find(v => v.type === "journal")) ||
      (isReceipt && list.find(v => v.type === "receipt")) ||
      (isPayment && list.find(v => v.type === "payment")) ||
      list[0];
    return preferred ? voucherRoute(preferred) : null;
  };

  const findByLinkedTx = async (): Promise<string | null> => {
    const { data: rv } = await supabase
      .from("receipt_vouchers")
      .select("id")
      .eq("user_id", ownerId)
      .eq("linked_transaction_id", transactionId)
      .limit(1);
    const rvRow = ((rv as any[]) || [])[0];
    if (rvRow?.id) return `/finance/receipt/${rvRow.id}/edit`;
    const { data: v } = await supabase
      .from("vouchers")
      .select("id, type, subtype")
      .eq("user_id", ownerId)
      .eq("linked_transaction_id", transactionId)
      .limit(1);
    const vRow = ((v as any[]) || [])[0];
    return vRow?.id ? voucherRoute(vRow as any) : null;
  };

  const isReturn = /^(PR|SR)-/i.test(ref) || txType.includes("return") || txType.includes("مردود");

  try {
    const order = isReturn
      ? [findReturn, findInvoice, findVoucherByRef, findByLinkedTx]
      : isVoucherLike
      ? [findVoucherByRef, findInvoice, findByLinkedTx]
      : [findInvoice, findReturn, findVoucherByRef, findByLinkedTx];
    for (const step of order) {
      const route = await step();
      if (route) return route;
    }
  } catch (err) {
    console.error("resolveDocumentRoute failed:", err);
  }
  return null;
}
