/**
 * Phase 5G — Single Source of Truth for contact balances.
 *
 * Wraps the canonical `get_contact_balance` RPC so that all UI surfaces
 * (ContactsPage, ContactDetailPage, Customer360, etc.) read the same
 * authoritative figure, computed live from `transactions` ledger.
 *
 * NEVER read `contacts.current_balance` for display — use these helpers.
 * The stored column is treated as a stale legacy cache; we keep it in DB
 * (no schema change) but the UI must not present it as truth.
 *
 * Notes / caveats:
 * - Phase 5G.1: the DB function counts the full commercial perimeter:
 *     113%   → Accounts Receivable (1130) + sub-accounts
 *     211%   → Accounts Payable (2110) + customer prepayments (2115)
 *     1146%  → supplier prepayments (Advances to Suppliers, asset)
 *   This matches AccountStatementV2's canonical formula
 *   (customer = 1130 + 2115, supplier = 2110 + 1146).
 * - `balance` sign convention:
 *     positive  → contact owes us (AR debit > credit) OR we paid a supplier
 *     negative  → we owe contact (AP credit > debit) OR customer overpaid
 */
import { supabase } from "@/integrations/supabase/client";

export interface ContactBalanceResult {
  contact_id: string;
  balance: number;
  total_debit: number;
  total_credit: number;
  currency: string;
  as_of_date: string;
  error?: string;
}

export type ContactBalanceContactType = "عميل" | "مورد" | "customer" | "supplier" | string | null | undefined;

export interface LedgerBalanceTx {
  contact_id?: string | null;
  amount: number | null;
  debit_account_code: string | null;
  credit_account_code: string | null;
}

const matchesAccountRoot = (code: string | null | undefined, roots: string[]) =>
  !!code && roots.some((root) => code === root || code.startsWith(root));

export const getStatementBalanceAccountRoots = (contactType: ContactBalanceContactType): string[] => {
  const t = String(contactType || "").toLowerCase();
  if (contactType === "مورد" || t === "supplier" || t === "purchase") return ["211", "1146"];
  return ["113", "2115"];
};

export function calculateStatementBalanceFromTransactions(
  transactions: LedgerBalanceTx[],
  contactType: ContactBalanceContactType,
): number {
  const roots = getStatementBalanceAccountRoots(contactType);
  return transactions.reduce((balance, tx) => {
    const amount = Number(tx.amount || 0);
    let next = balance;
    if (matchesAccountRoot(tx.debit_account_code, roots)) next += amount;
    if (matchesAccountRoot(tx.credit_account_code, roots)) next -= amount;
    return next;
  }, 0);
}

/**
 * Account Statement parity balance for side-panels.
 * Includes active rows plus cancelled rows that have a reversal link so the
 * original and reversal net to zero exactly like AccountStatementV2Page.
 */
export async function fetchContactStatementBalance(options: {
  contactId: string;
  userId: string;
  contactType?: ContactBalanceContactType;
  asOfDate?: string;
  currency?: string | null;
}): Promise<number> {
  if (!options.contactId || !options.userId) return 0;
  let query = supabase
    .from("transactions")
    .select("amount, debit_account_code, credit_account_code")
    .eq("user_id", options.userId)
    .eq("contact_id", options.contactId)
    .or("is_deleted.eq.false,reversed_by_id.not.is.null");

  if (options.asOfDate) query = query.lte("transaction_date", options.asOfDate);
  if (options.currency) query = query.eq("currency", options.currency);

  const { data, error } = await query;
  if (error) {
    console.warn("[contact-balance] statement query error:", error.message);
    return 0;
  }
  return calculateStatementBalanceFromTransactions((data || []) as LedgerBalanceTx[], options.contactType);
}

export async function fetchManyContactStatementBalances(
  contacts: { id: string; contact_type?: ContactBalanceContactType }[],
  options: { userId: string; asOfDate?: string; currency?: string | null },
): Promise<Record<string, number>> {
  if (!contacts.length || !options.userId) return {};
  let query = supabase
    .from("transactions")
    .select("contact_id, amount, debit_account_code, credit_account_code")
    .eq("user_id", options.userId)
    .in("contact_id", contacts.map((c) => c.id))
    .or("is_deleted.eq.false,reversed_by_id.not.is.null");

  if (options.asOfDate) query = query.lte("transaction_date", options.asOfDate);
  if (options.currency) query = query.eq("currency", options.currency);

  const { data, error } = await query;
  if (error) {
    console.warn("[contact-balance] batch statement query error:", error.message);
    return {};
  }

  const typeById = Object.fromEntries(contacts.map((c) => [c.id, c.contact_type]));
  const grouped: Record<string, LedgerBalanceTx[]> = {};
  for (const tx of ((data || []) as LedgerBalanceTx[])) {
    if (!tx.contact_id) continue;
    (grouped[tx.contact_id] ||= []).push(tx);
  }
  return Object.fromEntries(
    contacts.map((c) => [c.id, calculateStatementBalanceFromTransactions(grouped[c.id] || [], typeById[c.id])]),
  );
}

/**
 * Fetch live balance for a single contact from the ledger.
 * Returns 0 on any error so the UI never crashes.
 */
export async function fetchContactBalance(
  contactId: string,
  options?: { asOfDate?: string; currency?: string },
): Promise<number> {
  if (!contactId) return 0;
  try {
    const { data, error } = await supabase.rpc("get_contact_balance", {
      p_contact_id: contactId,
      p_as_of_date: options?.asOfDate ?? new Date().toISOString().split("T")[0],
      p_currency: options?.currency ?? null,
    });
    if (error) {
      // Surface in console but don't break the UI.
      console.warn("[contact-balance] RPC error:", error.message);
      return 0;
    }
    const result = data as unknown as ContactBalanceResult;
    return Number(result?.balance ?? 0);
  } catch (e: any) {
    console.warn("[contact-balance] exception:", e?.message);
    return 0;
  }
}

/**
 * Same as above but returns the full RPC payload (debit, credit, balance).
 */
export async function fetchContactBalanceDetail(
  contactId: string,
  options?: { asOfDate?: string; currency?: string },
): Promise<ContactBalanceResult | null> {
  if (!contactId) return null;
  try {
    const { data, error } = await supabase.rpc("get_contact_balance", {
      p_contact_id: contactId,
      p_as_of_date: options?.asOfDate ?? new Date().toISOString().split("T")[0],
      p_currency: options?.currency ?? null,
    });
    if (error) return null;
    return data as unknown as ContactBalanceResult;
  } catch {
    return null;
  }
}

/**
 * Batch helper for list pages (ContactsPage). Calls the RPC in parallel
 * for each contact id. Returns a map { contactId -> balance }.
 *
 * The RPC is STABLE and SECURITY DEFINER, so per-row calls are cheap.
 * For very large tenants (>1000 contacts) we should switch to a single
 * aggregated SQL view; for now parallel fan-out is acceptable.
 */
export async function fetchManyContactBalances(
  contactIds: string[],
  options?: { asOfDate?: string; currency?: string },
): Promise<Record<string, number>> {
  if (!contactIds || contactIds.length === 0) return {};
  const results = await Promise.all(
    contactIds.map(async (id) => {
      const balance = await fetchContactBalance(id, options);
      return [id, balance] as const;
    }),
  );
  return Object.fromEntries(results);
}

/**
 * Phase 5I — UX unification.
 * Convert a numeric balance into a clear Arabic label so users never have to
 * interpret a +/- sign. The numeric value is preserved verbatim.
 *
 *   balance > 0  → "مدين علينا 500"  (contact owes us / we paid supplier in advance)
 *   balance < 0  → "له عندنا 300"     (we owe contact / customer overpaid)
 *   balance = 0  → "مُسوّى"
 *
 * Pass `contactType` ("عميل" | "مورد") to flip phrasing slightly when known.
 */
export function describeBalance(
  balance: number,
  contactType?: string | null,
): { label: string; tone: "debit" | "credit" | "zero"; absolute: number } {
  const n = Number(balance) || 0;
  if (Math.abs(n) < 0.005) {
    return { label: "مُسوّى", tone: "zero", absolute: 0 };
  }
  const isSupplier = contactType === "مورد" || contactType === "supplier";
  if (n > 0) {
    return {
      label: isSupplier ? `سلفة لدى المورد ${n.toFixed(2)}` : `مدين علينا ${n.toFixed(2)}`,
      tone: "debit",
      absolute: n,
    };
  }
  return {
    label: isSupplier ? `له عندنا ${Math.abs(n).toFixed(2)}` : `دفعة مقدمة ${Math.abs(n).toFixed(2)}`,
    tone: "credit",
    absolute: Math.abs(n),
  };
}