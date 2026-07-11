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
import { fetchAllRows } from "@/lib/fetch-all-rows";
import { resolveStatementDebitCredit } from "@/lib/accounting/statement-side";

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
  foreign_amount?: number | null;
  currency?: string | null;
  exchange_rate?: number | null;
  debit_account_code: string | null;
  credit_account_code: string | null;
}

export const getStatementBalanceAccountRoots = (contactType: ContactBalanceContactType): string[] => {
  // Unified roots matching AccountStatementV2Page (SOA) — must stay in sync so
  // side-panels, drawers, and summary boxes never diverge from the printed statement.
  //   113%  → Accounts Receivable + sub-accounts
  //   211%  → Accounts Payable + customer prepayments (2115)
  //   1146% → Supplier prepayments (Advances to Suppliers)
  //   2180% → Employee/related-party clearing accounts
  // Hybrid contacts ("عميل ومورد") MUST include both AR and AP families or the
  // summary panel silently drops half of the ledger.
  void contactType; // kept for API stability; nature is inferred from the ledger sign
  return ["113", "211", "2180", "1146"];
};

const normalizeCurrencyName = (currency?: string | null): string => {
  if (!currency) return "شيكل";
  const map: Record<string, string> = {
    ILS: "شيكل",
    شيكل: "شيكل",
    USD: "دولار",
    دولار: "دولار",
    JOD: "دينار",
    دينار: "دينار",
    EUR: "يورو",
    يورو: "يورو",
  };
  return map[currency] || currency;
};

const currencyNameToCode: Record<string, string> = {
  شيكل: "ILS",
  دولار: "USD",
  دينار: "JOD",
  يورو: "EUR",
  ILS: "ILS",
  USD: "USD",
  JOD: "JOD",
  EUR: "EUR",
};

function getDisplayAmount(tx: LedgerBalanceTx, displayCurrency?: string | null, displayExchangeRate?: number | null): number {
  const amount = Number(tx.amount || 0);
  const displayName = normalizeCurrencyName(displayCurrency);
  const displayCode = currencyNameToCode[displayName] || currencyNameToCode[String(displayCurrency || "")] || "ILS";
  if (!displayCurrency || displayCode === "ILS") return amount;

  const txName = normalizeCurrencyName(tx.currency);
  const txCode = currencyNameToCode[txName] || "ILS";
  const foreignAmount = Number(tx.foreign_amount || 0);
  const displayRate = Number(displayExchangeRate || 0);

  // Same foreign currency: Account Statement displays the stored original amount.
  if (txCode === displayCode && foreignAmount > 0) return foreignAmount;

  // ILS source displayed in a foreign currency: convert using the selected/current display rate.
  if (txCode === "ILS" && displayRate > 0) return amount / displayRate;

  // Cross-currency foreign rows: convert through ILS using the row's historic rate.
  if (txCode !== "ILS" && txCode !== displayCode && displayRate > 0) {
    const txRate = Number(tx.exchange_rate || 0);
    if (txRate > 0) {
      const ilsValue = foreignAmount > 0 ? foreignAmount * txRate : amount;
      return ilsValue / displayRate;
    }
  }

  return amount;
}

export function calculateStatementBalanceFromTransactions(
  transactions: LedgerBalanceTx[],
  contactType: ContactBalanceContactType,
  options?: { displayCurrency?: string | null; displayExchangeRate?: number | null },
  ownAccountCodes?: Iterable<string | null | undefined>,
): number {
  void contactType;
  return transactions.reduce((balance, tx) => {
    const amount = getDisplayAmount(tx, options?.displayCurrency, options?.displayExchangeRate);
    let next = balance;
    const { isDebit, isCredit, isAmbiguous } = resolveStatementDebitCredit(tx, ownAccountCodes);
    if (isAmbiguous) return next;
    if (isDebit) next += amount;
    if (isCredit) next -= amount;
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
  displayCurrency?: string | null;
  displayExchangeRate?: number | null;
}): Promise<number> {
  if (!options.contactId || !options.userId) return 0;
  try {
    const { data: contact } = await supabase
      .from("contacts")
      .select("linked_account_code")
      .eq("id", options.contactId)
      .eq("user_id", options.userId)
      .maybeSingle();
    const data = await fetchAllRows<LedgerBalanceTx>((from, to) => {
      let q = supabase
        .from("transactions")
        .select("amount, foreign_amount, currency, exchange_rate, debit_account_code, credit_account_code")
        .eq("user_id", options.userId)
        .eq("contact_id", options.contactId)
        .or("is_deleted.eq.false,reversed_by_id.not.is.null");
      if (options.asOfDate) q = q.lte("transaction_date", options.asOfDate);
      if (options.currency && !options.displayCurrency) q = q.eq("currency", options.currency);
      return q.range(from, to) as any;
    });
    return calculateStatementBalanceFromTransactions(data, options.contactType, {
      displayCurrency: options.displayCurrency,
      displayExchangeRate: options.displayExchangeRate,
    }, [(contact as any)?.linked_account_code]);
  } catch (e: any) {
    console.warn("[contact-balance] statement query error:", e?.message);
    return 0;
  }
}

export async function fetchManyContactStatementBalances(
  contacts: { id: string; contact_type?: ContactBalanceContactType; linked_account_code?: string | null }[],
  options: { userId: string; asOfDate?: string; currency?: string | null },
): Promise<Record<string, number>> {
  if (!contacts.length || !options.userId) return {};
  let data: LedgerBalanceTx[] = [];
  try {
    data = await fetchAllRows<LedgerBalanceTx>((from, to) => {
      let q = supabase
        .from("transactions")
        .select("contact_id, amount, debit_account_code, credit_account_code")
        .eq("user_id", options.userId)
        .in("contact_id", contacts.map((c) => c.id))
        .or("is_deleted.eq.false,reversed_by_id.not.is.null");
      if (options.asOfDate) q = q.lte("transaction_date", options.asOfDate);
      if (options.currency) q = q.eq("currency", options.currency);
      return q.range(from, to) as any;
    });
  } catch (e: any) {
    console.warn("[contact-balance] batch statement query error:", e?.message);
    return {};
  }

  const typeById = Object.fromEntries(contacts.map((c) => [c.id, c.contact_type]));
  const linkedById = Object.fromEntries(contacts.map((c) => [c.id, c.linked_account_code || null]));
  const grouped: Record<string, LedgerBalanceTx[]> = {};
  for (const tx of data) {
    if (!tx.contact_id) continue;
    (grouped[tx.contact_id] ||= []).push(tx);
  }
  return Object.fromEntries(
    contacts.map((c) => [c.id, calculateStatementBalanceFromTransactions(grouped[c.id] || [], typeById[c.id], undefined, [linkedById[c.id]])]),
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