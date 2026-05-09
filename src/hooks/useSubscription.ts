import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface SubscriptionData {
  id: string;
  status: string;
  billing_cycle: string;
  current_period_end: string;
  current_period_start: string;
  trial_ends_at: string | null;
  plan_name: string;
  plan_name_ar: string;
  plan_key: string;
  monthly_price: number;
  daysLeft: number;
  totalDays: number;
  isExpired: boolean;
  isTrial: boolean;
  tier: string;
  enabledModules: string[];
  maxUsers: number;
  maxInvoicesPerMonth: number;
}

export function useSubscription() {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSubscription = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    
    try {
      // Resolve billing owner: team accounts (HR manager, accountant, employee, ...)
      // must inherit the subscription of the company owner — never their own.
      const { data: profile } = await supabase
        .from("profiles")
        .select("invited_by")
        .eq("user_id", user.id)
        .maybeSingle();
      const billingOwnerId = profile?.invited_by || user.id;

      const { data: sub } = await supabase
        .from("subscriptions")
        .select("*, plans(*)")
        .eq("user_id", billingOwnerId)
        .in("status", ["active", "trial", "trialing", "grace", "grace_period", "past_due", "expired"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sub || !sub.plans) {
        setSubscription(null);
        setLoading(false);
        return;
      }

      const plan = sub.plans as any;
      const isTrial = sub.status === "trial" || sub.status === "trialing";
      const expiresAt = isTrial && sub.trial_ends_at
        ? new Date(sub.trial_ends_at)
        : new Date(sub.current_period_end);
      const startsAt = new Date(sub.current_period_start);
      const now = new Date();

      const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      const totalDays = Math.ceil((expiresAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60 * 24));

      setSubscription({
        id: sub.id,
        status: sub.status,
        billing_cycle: sub.billing_cycle,
        current_period_end: sub.current_period_end,
        current_period_start: sub.current_period_start,
        trial_ends_at: sub.trial_ends_at,
        plan_name: plan.name,
        plan_name_ar: plan.name_ar,
        plan_key: plan.plan_key,
        monthly_price: plan.monthly_price,
        daysLeft,
        totalDays: Math.max(totalDays, 1),
        isExpired: daysLeft <= 0,
        isTrial,
        tier: plan.tier || 'basic',
        enabledModules: (plan.enabled_modules as string[]) || [],
        maxUsers: plan.max_users ?? 1,
        maxInvoicesPerMonth: plan.max_invoices_per_month ?? -1,
      });
    } catch (err) {
      console.error("Error fetching subscription:", err);
    }
    setLoading(false);
  }, [user?.id]);

  useEffect(() => { fetchSubscription(); }, [fetchSubscription]);

  return { subscription, loading, refresh: fetchSubscription };
}
