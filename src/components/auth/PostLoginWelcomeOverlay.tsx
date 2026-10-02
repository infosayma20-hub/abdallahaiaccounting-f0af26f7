import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import authHeroMainAsset from "@/assets/auth-hero-main.png.asset.json";

export const POST_LOGIN_WELCOME_KEY = "unify:post-login-welcome";
export const POST_LOGIN_WELCOME_START_EVENT = "unify:post-login-welcome-start";
export const POST_LOGIN_ROUTE_READY_EVENT = "unify:post-login-route-ready";
export const POST_LOGIN_APPS_READY_EVENT = "unify:post-login-apps-ready";

export const markPostLoginWelcome = (targetPath?: string) => {
  try {
    sessionStorage.setItem(POST_LOGIN_WELCOME_KEY, String(Date.now()));
  } catch {
    // The welcome layer is cosmetic; authentication must continue if storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(POST_LOGIN_WELCOME_START_EVENT, { detail: { targetPath } }));
};

const hasPendingWelcome = () => {
  try {
    const value = Number(sessionStorage.getItem(POST_LOGIN_WELCOME_KEY));
    if (!Number.isFinite(value) || Date.now() - value > 60_000) {
      sessionStorage.removeItem(POST_LOGIN_WELCOME_KEY);
      return false;
    }
    return true;
  } catch {
    return false;
  }
};

const clearPendingWelcome = () => {
  try {
    sessionStorage.removeItem(POST_LOGIN_WELCOME_KEY);
  } catch {
    // Best effort only.
  }
};

const PostLoginWelcomeOverlay = () => {
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();
  const { company, loading: companyLoading } = useCompany();
  const [visible, setVisible] = useState(hasPendingWelcome);
  const [routeReady, setRouteReady] = useState(false);
  const [resolvedTarget, setResolvedTarget] = useState<string | null>(null);
  const [appsReady, setAppsReady] = useState(false);
  const [stalled, setStalled] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [progress, setProgress] = useState(12);

  useEffect(() => {
    const handleStart = (event: Event) => {
      const targetPath = (event as CustomEvent<{ targetPath?: string }>).detail?.targetPath || null;
      setVisible(true);
      setLeaving(false);
      setStalled(false);
      setProgress(12);
      setRouteReady(!!targetPath);
      setResolvedTarget(targetPath);
      setAppsReady(false);
    };
    const handleRouteReady = (event: Event) => {
      const targetPath = (event as CustomEvent<{ targetPath?: string }>).detail?.targetPath || null;
      setResolvedTarget(targetPath);
      setRouteReady(true);
    };
    const handleAppsReady = () => setAppsReady(true);
    window.addEventListener(POST_LOGIN_WELCOME_START_EVENT, handleStart);
    window.addEventListener(POST_LOGIN_ROUTE_READY_EVENT, handleRouteReady);
    window.addEventListener(POST_LOGIN_APPS_READY_EVENT, handleAppsReady);
    return () => {
      window.removeEventListener(POST_LOGIN_WELCOME_START_EVENT, handleStart);
      window.removeEventListener(POST_LOGIN_ROUTE_READY_EVENT, handleRouteReady);
      window.removeEventListener(POST_LOGIN_APPS_READY_EVENT, handleAppsReady);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const timer = window.setTimeout(() => setStalled(true), 10_000);
    return () => window.clearTimeout(timer);
  }, [visible]);

  const needsApps = resolvedTarget === "/apps" || (!resolvedTarget && location.pathname === "/apps");
  const ready = !authLoading && !!user && !companyLoading && routeReady && (!needsApps || appsReady);

  useEffect(() => {
    if (!visible || stalled) return;
    const timer = window.setInterval(() => {
      setProgress((current) => {
        if (ready) return 100;
        const ceiling = routeReady ? (needsApps ? 88 : 94) : 58;
        if (current >= ceiling) return current;
        return Math.min(ceiling, current + Math.max(1, Math.round((ceiling - current) / 8)));
      });
    }, 180);
    return () => window.clearInterval(timer);
  }, [needsApps, ready, routeReady, stalled, visible]);

  useEffect(() => {
    if (!visible || !ready) return;
    const leaveTimer = window.setTimeout(() => setLeaving(true), 450);
    const hideTimer = window.setTimeout(() => {
      clearPendingWelcome();
      setVisible(false);
    }, 900);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(hideTimer);
    };
  }, [ready, visible]);

  const displayName = useMemo(() => {
    const metadata = user?.user_metadata as { full_name?: string; name?: string } | undefined;
    return metadata?.full_name?.trim() || metadata?.name?.trim() || user?.email?.split("@")[0] || "";
  }, [user]);

  if (!visible) return null;

  return (
    <div
      className={`post-login-welcome fixed inset-0 z-[10000] flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-8 ${leaving ? "post-login-welcome--leaving" : ""}`}
      dir="rtl"
      role="status"
      aria-live="polite"
      aria-label="جاري تجهيز حسابك"
    >
      <div
        className="post-login-welcome__auth-background"
        style={{ backgroundImage: `url(${authHeroMainAsset.url})` }}
        aria-hidden="true"
      />
      <div className="post-login-welcome__scrim" aria-hidden="true" />
      <main className="post-login-welcome__dialog relative z-10 flex w-full max-w-xs flex-col items-center border border-primary-foreground/20 bg-background/90 px-5 py-6 text-center text-foreground shadow-2xl backdrop-blur-xl">
        <div className="post-login-welcome__pulse" aria-hidden="true">
          <span />
          <span />
          <span />
          <b>{progress}%</b>
        </div>

        <h1 className="mt-4 text-xl font-bold text-foreground">
          {displayName ? `أهلاً بك، ${displayName}` : "أهلاً بك"}
        </h1>

        {!stalled ? (
          <div className="mt-4 w-full px-5" aria-hidden="true">
            <div className="post-login-welcome__track h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="post-login-welcome__progress relative h-full overflow-hidden rounded-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="mt-4 w-full rounded-md border border-border bg-muted/70 p-3">
            <p className="text-sm font-semibold">التجهيز يأخذ وقتاً أطول من المعتاد</p>
            <div className="mt-3 flex justify-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => window.location.reload()} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                إعادة المحاولة
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2"
                onClick={async () => {
                  clearPendingWelcome();
                  try { await supabase.auth.signOut(); } catch { /* best effort */ }
                  window.location.href = "/auth";
                }}
              >
                <LogOut className="h-4 w-4" />
                تسجيل الخروج
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default PostLoginWelcomeOverlay;