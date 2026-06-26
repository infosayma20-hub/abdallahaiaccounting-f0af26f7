import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/**
 * Canonical Sparta tenancy resolver.
 *
 * All Sparta-scoped tables share one tenant:
 *  - `company_id` (product_batches / batch_movements) → sparta holding id
 *  - `user_id`    (products / warehouses / stock_movements) → holding owner user id
 *
 * Never pass `auth.user.id` directly to Sparta queries; use this hook.
 */
export function useSpartaContext() {
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [ownerUserId, setOwnerUserId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) { setLoading(false); return; }
      setLoading(true);
      const [{ data: holdingId }, { data: ownerId }, { data: membership }] = await Promise.all([
        supabase.rpc("sparta_holding_id"),
        supabase.rpc("sparta_owner_user_id"),
        supabase.rpc("is_sparta_holding_admin", { _user_id: user.id }),
      ]);
      if (cancelled) return;
      setCompanyId((holdingId as any) ?? null);
      setOwnerUserId((ownerId as any) ?? null);
      setIsAdmin(Boolean(membership));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { companyId, ownerUserId, isAdmin, loading };
}