import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { singleFlight } from "@/lib/single-flight";

/**
 * Resolve the effective data-owner id for tenant-scoped reads.
 *
 * Pattern (mirrors src/pages/ProfitLoss.tsx and POS reports):
 *   - For owners, returns auth.user.id.
 *   - For team members invited by an owner, returns the OWNER's id
 *     so they read the same dataset as the owner (RLS allows it).
 *
 * Use this for filtering data tables: transactions, accounts, contacts,
 * invoices, purchase_invoices, vouchers, receipt_vouchers, cheques,
 * stock_movements, products, warehouses, employees, fixed_assets,
 * cash_boxes, bank_accounts, exchange_rates, etc.
 *
 * Do NOT use this to read per-user UI tables like profiles or
 * company_settings — those should still key off auth.user.id.
 */
const OWNER_CACHE_PREFIX = "amwali:data-owner:";
const OWNER_CACHE_VERSION = 2;
const OWNER_CACHE_TTL_MS = 30 * 60 * 1000;

type OwnerCache = { ownerId: string | null; fresh: boolean };

function readCachedOwnerMeta(userId: string): OwnerCache {
  try {
    const raw = sessionStorage.getItem(OWNER_CACHE_PREFIX + userId);
    if (!raw) return { ownerId: null, fresh: false };

    // Legacy cache used to be a raw UUID with no version/TTL. Treat it as a
    // warm hint only, never as fresh, so accountant/team accounts with an old
    // cached auth.uid() are revalidated and moved back to the tenant owner.
    if (!raw.trim().startsWith("{")) return { ownerId: raw, fresh: false };

    const parsed = JSON.parse(raw) as { v?: number; ownerId?: string; ts?: number };
    const ownerId = parsed.ownerId || null;
    const fresh = Boolean(
      ownerId &&
      parsed.v === OWNER_CACHE_VERSION &&
      parsed.ts &&
      Date.now() - parsed.ts < OWNER_CACHE_TTL_MS
    );
    return { ownerId, fresh };
  } catch { return { ownerId: null, fresh: false }; }
}

function readCachedOwner(userId: string): string | null {
  return readCachedOwnerMeta(userId).ownerId;
}
function writeCachedOwner(userId: string, ownerId: string) {
  try { sessionStorage.setItem(OWNER_CACHE_PREFIX + userId, JSON.stringify({ v: OWNER_CACHE_VERSION, ownerId, ts: Date.now() })); } catch { /* ignore */ }
}

export function useDataOwnerId(): { dataOwnerId: string | null; userId: string | null } {
  const { user } = useAuth();
  // Seed from sessionStorage synchronously so the first render already has
  // the owner id — avoids the null→uuid flip that caused every dependent
  // useEffect to fire twice on every page mount.
  const [dataOwnerId, setDataOwnerId] = useState<string | null>(() => {
    if (!user?.id) return null;
    return readCachedOwner(user.id);
  });

  useEffect(() => {
    if (!user) {
      setDataOwnerId(null);
      return;
    }
    // Serve a fresh versioned cache instantly. Legacy/stale cache is only used
    // as a temporary hint and is revalidated below to avoid hiding owner data
    // from accountant/team accounts after owner-resolution fixes.
    const cached = readCachedOwnerMeta(user.id);
    if (cached.ownerId && cached.ownerId !== dataOwnerId) setDataOwnerId(cached.ownerId);
    if (cached.fresh) {
      return;
    }
    let cancelled = false;
    (async () => {
      // Several hooks resolve the owner at the same moment on a page open —
      // share one RPC round trip instead of firing it five times.
      const { data, error } = await singleFlight(`owner:${user.id}`, () =>
        Promise.resolve(supabase.rpc("get_team_owner_id", { _user_id: user.id })),
      );
      if (cancelled) return;


      if (!error && data) {
        setDataOwnerId(data as string);
        writeCachedOwner(user.id, data as string);
        return;
      }

      // Safety net for team accounts: never silently fall back to auth.uid()
      // before checking profiles.invited_by, otherwise HR managers read an empty tenant.
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("invited_by")
        .eq("user_id", user.id)
        .maybeSingle();

      if (cancelled) return;
      if (profileError) console.error("[useDataOwnerId] owner resolution failed", { error, profileError });
      const resolved = ((profile as any)?.invited_by as string | null) || user.id;
      setDataOwnerId(resolved);
      // Do not persist a self fallback when both owner-resolution paths errored;
      // a transient failure would otherwise poison the session cache for Sarah
      // and other accountants, causing new posted entries to disappear.
      if (!profileError || (profile as any)?.invited_by) writeCachedOwner(user.id, resolved);
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  return { dataOwnerId, userId: user?.id ?? null };
}

export default useDataOwnerId;