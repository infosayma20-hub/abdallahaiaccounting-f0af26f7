import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { fetchOnboardingStatus, type OnboardingStatus } from "@/lib/authRedirect";

/**
 * Guards owner-facing routes (the admin app at /apps and its children, and
 * the /onboarding wizard itself) so that:
 *  - A brand-new owner who has not finished onboarding is sent to /onboarding
 *    when trying to open /apps or any general app route.
 *  - An owner who already finished onboarding is sent to /apps when they hit
 *    /onboarding manually.
 *  - Employees, cashiers, sales reps, portal/feedback-only users are unaffected
 *    (their own role-based redirects already route them away from this tree).
 *  - There is no redirect loop: the gate only redirects when the destination
 *    differs from the current path.
 */
const sessionStatusCache = new Map<string, OnboardingStatus>();

export const OnboardingGate = ({ children }: { children: React.ReactNode }) => {
  const { user, loading: authLoading } = useAuth();
  const location = useLocation();
  const [status, setStatus] = useState<OnboardingStatus | "loading">(() => {
    if (user?.id && sessionStatusCache.has(user.id)) {
      const cached = sessionStatusCache.get(user.id)!;
      // On the wizard route, never trust a stale "incomplete" value from
      // earlier in the same session. Re-read the backend first so a finished
      // wizard cannot appear to restart from step 1.
      if (location.pathname === "/onboarding" && cached !== "completed") return "loading";
      return cached;
    }
    return "loading";
  });

  useEffect(() => {
    if (authLoading || !user) return;
    const cached = sessionStatusCache.get(user.id);
    const mustRevalidate = location.pathname === "/onboarding" && cached !== "completed";
    if (cached && !mustRevalidate) {
      setStatus(cached);
      return;
    }
    let cancelled = false;
    setStatus("loading");
    (async () => {
      const next = await fetchOnboardingStatus(user.id);
      if (cancelled) return;
      sessionStatusCache.set(user.id, next);
      setStatus(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading, location.pathname]);

  // Invalidate cache when leaving /onboarding so the next visit re-reads
  // whether the user just finished it.
  useEffect(() => {
    if (!user) return;
    if (location.pathname === "/onboarding") return;
    // no-op: kept for clarity. Cache is cleared explicitly in clearOnboardingStatusCache.
  }, [location.pathname, user]);

  if (authLoading || status === "loading") {
    if (location.pathname === "/onboarding") {
      return (
        <div className="flex min-h-screen w-full items-center justify-center bg-background">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
        </div>
      );
    }
    // Render children optimistically while resolving to avoid a blank flash.
    // Once resolved we redirect if needed.
    return <>{children}</>;
  }

  if (status === "incomplete" && location.pathname !== "/onboarding") {
    return <Navigate to="/onboarding" replace />;
  }
  if (status === "completed" && location.pathname === "/onboarding") {
    return <Navigate to="/apps" replace />;
  }
  return <>{children}</>;
};

export const clearOnboardingStatusCache = (userId?: string) => {
  if (userId) sessionStatusCache.delete(userId);
  else sessionStatusCache.clear();
};