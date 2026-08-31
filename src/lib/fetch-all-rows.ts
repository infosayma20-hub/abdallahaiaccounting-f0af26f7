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

// App-wide cap on simultaneous page requests. The backend connection pool is
// shared with POS/cashiers, so parallel paging must never flood it: at most
// MAX_INFLIGHT page requests are in the air across ALL callers in this tab.
const MAX_INFLIGHT = 8;
let inflight = 0;
const waiters: Array<() => void> = [];

async function acquire() {
  if (inflight < MAX_INFLIGHT) { inflight++; return; }
  await new Promise<void>(resolve => waiters.push(resolve));
  inflight++;
}

function release() {
  inflight--;
  const next = waiters.shift();
  if (next) next();
}

async function runLimited<T>(fn: () => PromiseLike<T>): Promise<T> {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

export async function fetchAllRows<T = any>(
  buildQuery: (from: number, to: number) => PromiseLike<PostgrestSingleResponse<T[]>>,
  pageSize = 1000,
  concurrency = 4,
): Promise<T[]> {
  const all: T[] = [];

  // Page 1 is always fetched alone. Datasets that fit in one page (the vast
  // majority of callers: POS, invoices, inventory…) therefore issue exactly
  // ONE request, exactly like the previous sequential implementation — no
  // extra load. Only genuinely large datasets escalate to parallel paging.
  const first = await runLimited(() => buildQuery(0, pageSize - 1));
  if (first.error) throw first.error;
  const firstChunk = (first.data as T[] | null) || [];
  all.push(...firstChunk);
  if (firstChunk.length < pageSize) return all;

  let offset = pageSize;
  // Remaining pages are fetched in parallel rounds using the SAME ranges as
  // the old sequential loop, and concatenated strictly by page index — so the
  // returned array is byte-for-byte identical, just faster.
  for (;;) {
    const round = await Promise.all(
      Array.from({ length: concurrency }, (_, i) => {
        const from = offset + i * pageSize;
        return runLimited(() => buildQuery(from, from + pageSize - 1));
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