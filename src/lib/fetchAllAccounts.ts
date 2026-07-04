import { supabase } from "@/integrations/supabase/client";

const PAGE_SIZE = 1000;

/**
 * Lovable Cloud/PostgREST returns up to 1000 rows per request by default.
 * The chart of accounts can exceed that, so account-heavy screens must page
 * through the full tenant tree instead of silently showing the first page only.
 */
export async function fetchAllAccountsForOwner<T = any>(ownerId: string, columns = "*"): Promise<T[]> {
  const allRows: T[] = [];

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("accounts")
      .select(columns)
      .eq("user_id", ownerId)
      .order("account_code", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw error;

    const rows = (data ?? []) as T[];
    allRows.push(...rows);

    if (rows.length < PAGE_SIZE) break;
  }

  return allRows;
}