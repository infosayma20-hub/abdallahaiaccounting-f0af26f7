import { useCallback, useEffect, useRef } from "react";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { useUserRoles } from "@/hooks/useUserRoles";
import { supabase } from "@/integrations/supabase/client";

export function useSubscriptionGuard() {
  const { subscription, loading, refresh } = useSubscription();
  const { user } = useAuth();
  // Roles come from the shared cache instead of a dedicated user_roles query
  // per mount (same source of truth, one round trip for the whole app).
  const { roles, loading: rolesLoading } = useUserRoles();

  const hasAutoExpired = useRef(false);
  const resolvedIsSuperAdmin = !!user?.id && roles.includes("super_admin");
  const roleLoading = !!user?.id && rolesLoading;
  const guardLoading = loading || roleLoading;


  const daysLeft = subscription?.daysLeft ?? 999;
  const isTrial = subscription?.isTrial ?? false;
  const isTrialExpired = daysLeft <= 0 && isTrial;
  const isExpired = subscription?.isExpired ?? false;
  const isStatusExpired = subscription?.status === "expired";
  const isPaidActive = subscription?.status === "active" && !isTrial;

  // Auto-update status to 'expired' when trial ends
  useEffect(() => {
    if (guardLoading || resolvedIsSuperAdmin || !subscription?.id || hasAutoExpired.current) return;
    if (isTrialExpired && subscription.status !== "expired") {
      hasAutoExpired.current = true;
      supabase
        .from("subscriptions")
        .update({ status: "expired" })
        .eq("id", subscription.id)
        .then(() => refresh());
    }
  }, [guardLoading, resolvedIsSuperAdmin, isTrialExpired, subscription?.id, subscription?.status, refresh]);

  // Fetch user data counts for conversion modals
  const fetchUserDataCounts = useCallback(async (userId: string) => {
    const [invoices, contacts, transactions] = await Promise.all([
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("transactions").select("id", { count: "exact", head: true }).eq("user_id", userId),
    ]);
    return {
      invoiceCount: invoices.count ?? 0,
      contactCount: contacts.count ?? 0,
      transactionCount: transactions.count ?? 0,
    };
  }, []);

  return {
    subscription,
    loading: guardLoading,
    daysLeft,
    isTrial,
    isTrialExpired: resolvedIsSuperAdmin ? false : (isTrialExpired || isStatusExpired),
    isExpired: resolvedIsSuperAdmin ? false : (isExpired || isStatusExpired),
    isPaidActive: resolvedIsSuperAdmin ? true : isPaidActive,
    isSuperAdmin: resolvedIsSuperAdmin,
    refresh,
    fetchUserDataCounts,
  };
}
