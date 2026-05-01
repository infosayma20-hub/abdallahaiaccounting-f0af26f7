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
 * - The DB function only counts AR (113%) and AP (211%) accounts.
 *   Customer prepayments (2115) and supplier prepayments (1146) are NOT
 *   currently included in `get_contact_balance`. If those need to be
 *   reflected they must be added in the SQL function (out of scope here).
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