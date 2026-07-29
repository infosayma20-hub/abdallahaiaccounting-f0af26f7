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
  concurrency = 6,
): Promise<T[]> {
  const all: T[] = [];
  let offset = 0;
  // Pages are fetched in parallel rounds (same ranges, same order as the old
  // sequential loop) — results are concatenated strictly by page index, so the
  // returned array is identical to the previous implementation, just faster.
  for (;;) {
    const round = await Promise.all(
      Array.from({ length: concurrency }, (_, i) => {
        const from = offset + i * pageSize;
        return buildQuery(from, from + pageSize - 1);
      }),
    );
    let done = false;
    for (const { data, error } of round) {
      if (error) throw error;
      const chunk = (data as T[] | null) || [];
      if (!done) all.push(...chunk);
      if (chunk.length < pageSize) { done = true; }
    }
    offset += concurrency * pageSize;
    // Safety cap: avoid runaway loops (very large tenants > 200k rows / query).
    if (done || all.length >= 200_000) break;
  }
  return all;
}