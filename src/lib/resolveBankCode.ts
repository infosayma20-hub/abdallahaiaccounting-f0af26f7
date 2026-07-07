/**
 * Resolve a valid **leaf** bank account GL code for the given user.
 *
 * Background: parent 1120 (البنك) must never be posted to directly. After the
 * hierarchy backfill, every configured bank account points at a leaf under
 * 1120 (e.g. 1121, 1126…). Legacy code paths, however, still fall back to the
 * hardcoded parent "1120" when a specific bank isn't provided — which now
 * breaks the posting-constraint rule and shows nothing on the visa/bank
 * account statement.
 *
 * This helper is the single source of truth for that fallback:
 *   1. If the caller already resolved a leaf code, use it.
 *   2. Else read `company_settings.default_bank_account` (a leaf after backfill).
 *   3. Else pick the first active leaf under 1120 in the user's chart of accounts.
 *   4. Only as a very last resort return "1120" (should never happen post-backfill,
 *      but we keep the string so calls never crash on legacy tenants without banks).
 *
 * The result is cached in-memory per user for the current session to avoid
 * hammering the DB on every voucher / cheque / return posting.
 */
import { supabase } from "@/integrations/supabase/client";

const cache = new Map<string, string>();

export async function resolveBankAccountCode(
  userId: string,
  providedCode?: string | null
): Promise<string> {
  // 1. If caller has a code and it's not the parent, trust it.
  if (providedCode && providedCode !== "1120") return providedCode;

  if (cache.has(userId)) return cache.get(userId)!;

  // 2. Read the company default.
  try {
    const { data: settings } = await supabase
      .from("company_settings")
      .select("default_bank_account")
      .eq("user_id", userId)
      .maybeSingle();
    const def = (settings as any)?.default_bank_account as string | undefined;
    if (def && def !== "1120") {
      cache.set(userId, def);
      return def;
    }
  } catch {
    // ignore and fall through to leaf lookup
  }

  // 3. Pick the first active leaf under 1120.
  try {
    const { data: leaves } = await supabase
      .from("accounts")
      .select("account_code")
      .eq("user_id", userId)
      .eq("parent_code", "1120")
      .eq("is_active", true)
      .order("account_code", { ascending: true })
      .limit(1);
    const leaf = leaves?.[0]?.account_code;
    if (leaf) {
      cache.set(userId, leaf);
      return leaf;
    }
  } catch {
    // ignore
  }

  // 4. Last resort — no banks defined for this tenant. Keep the parent code
  //    so the call itself doesn't fail; the DB posting-constraint trigger will
  //    surface a clear error to the user prompting them to define a bank.
  return "1120";
}

/** Clear the in-memory cache (e.g. after adding/removing a bank account). */
export function clearBankCodeCache(userId?: string) {
  if (userId) cache.delete(userId);
  else cache.clear();
}
