/**
 * Generic Supabase paginator.
 *
 * PostgREST returns at most 1000 rows per request (project cap). Any
 * page that displays "all" data for a large tenant (statements, ledgers,
 * KPI aggregators, reports) must paginate — otherwise the tail silently
 * disappears and balances/KPIs go wrong.
 *
 * Usage:
 *   const rows = await fetchAllRows<Row>((from, to) =>
 *     supabase.from("transactions").select("...").eq("user_id", uid).range(from, to)
 *   );
 *
 * The builder MUST NOT set .limit() — this helper controls the window
 * through .range(from, to). Chain .order() and filters as usual.
 */
import type { PostgrestSingleResponse } from "@supabase/supabase-js";

export async function fetchAllRows<T = any>(
  buildQuery: (from: number, to: number) => PromiseLike<PostgrestSingleResponse<T[]>>,
  pageSize = 1000,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = (data as T[] | null) || [];
    all.push(...chunk);
    if (chunk.length < pageSize) break;
    // Safety cap: avoid runaway loops (very large tenants > 200k rows / query).
    if (all.length >= 200_000) break;
  }
  return all;
}