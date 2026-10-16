import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useBootstrap } from "@/hooks/useBootstrap";

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

/**
 * Shared subscription state for the signed-in user.
 *
 * يقرأ الآن من حزمة البدء الموحّدة (useBootstrap) — الاشتراك يصل مع نفس
 * الطلب الواحد الذي يجلب الأدوار والصلاحيات، بدل طلبَي profiles ثم
 * subscriptions المنفصلين. مالك الفوترة محسوم على الخادم (get_team_owner_id)
 * فحسابات الفريق ترث اشتراك مالك الشركة تلقائياً.
 *
 * Behaviour is unchanged: same shape, same fields, `refresh()` still forces a
 * re-read (used after the trial auto-expire update).
 */
export function useSubscription() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const bootstrap = useBootstrap();

  const subscription = useMemo((): SubscriptionData | null => {
    const sub = bootstrap.data?.subscription;
    if (!sub) return null;

    const isTrial = sub.status === "trial" || sub.status === "trialing";
    const expiresAt = isTrial && sub.trial_ends_at
      ? new Date(sub.trial_ends_at)
      : new Date(sub.current_period_end);
    const startsAt = new Date(sub.current_period_start);
    const now = new Date();

    const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const totalDays = Math.ceil((expiresAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60 * 24));

    return {
      id: sub.id,
      status: sub.status,
      billing_cycle: sub.billing_cycle,
      current_period_end: sub.current_period_end,
      current_period_start: sub.current_period_start,
      trial_ends_at: sub.trial_ends_at,
      plan_name: sub.plan_name,
      plan_name_ar: sub.plan_name_ar,
      plan_key: sub.plan_key,
      monthly_price: sub.monthly_price,
      daysLeft,
      totalDays: Math.max(totalDays, 1),
      isExpired: daysLeft <= 0,
      isTrial,
      tier: sub.tier || "basic",
      enabledModules: (sub.enabled_modules as string[]) || [],
      maxUsers: sub.max_users ?? 1,
      maxInvoicesPerMonth: sub.max_invoices_per_month ?? -1,
    };
  }, [bootstrap.data?.subscription]);

  // Stable identity — consumers put `refresh` in effect dependency arrays.
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["bootstrap", user?.id ?? null] });
  }, [queryClient, user?.id]);

  return {
    subscription,
    loading: !!user?.id && bootstrap.isLoading,
    refresh,
  };
}
