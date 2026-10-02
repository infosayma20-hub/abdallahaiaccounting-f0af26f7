import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";
import authHeroMainAsset from "@/assets/auth-hero-main.png.asset.json";
import unifyLogoVertical from "@/assets/unify-logo-vertical.webp";

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

  const needsApps = resolvedTarget === "/apps" || (!resolvedTarget && location.pathname === "/apps");
  const ready = !authLoading && !!user && !companyLoading && routeReady && (!needsApps || appsReady);

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

  const loadingMessage = progress < 45
    ? "نتحقق من حسابك وصلاحياتك"
    : progress < 82
      ? "نجهّز تطبيقاتك ومساحة عملك"
      : progress < 100
        ? "بقي القليل، أهلاً بك في يونيفاي"
        : "اكتمل التجهيز";

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
      <main className="post-login-welcome__dialog relative z-10 flex w-full max-w-md flex-col items-center border border-primary-foreground/20 bg-background/90 p-6 text-center text-foreground shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="post-login-welcome__logos flex min-h-20 items-center justify-center gap-4">
          {company.logo_url ? (
            <div className="flex h-16 w-16 items-center justify-center rounded-md border border-border bg-card p-2 shadow-md sm:h-20 sm:w-20">
              <img src={company.logo_url} alt={company.name || "شعار الشركة"} className="max-h-full max-w-full object-contain" />
            </div>
          ) : null}
          {company.logo_url ? <span className="h-10 w-px bg-border" aria-hidden="true" /> : null}
          <img src={unifyLogoVertical} alt="يونيفاي" className="h-auto w-24 max-w-[32vw] object-contain sm:w-28" />
        </div>

        <div className="mt-6 min-h-20">
          <p className="text-sm font-medium text-muted-foreground">مرحباً بعودتك</p>
          <h1 className="mt-2 text-2xl font-bold text-foreground sm:text-3xl">
            {displayName ? `أهلاً بك، ${displayName}` : "أهلاً بك"}
          </h1>
          {company.name ? <p className="mt-2 text-sm text-muted-foreground">{company.name}</p> : null}
        </div>

        {!stalled ? (
          <div className="mt-7 w-full" aria-hidden="true">
            <div className="mb-2 flex items-center justify-between px-1 text-xs font-semibold text-primary">
              <span>{loadingMessage}</span>
              <span dir="ltr">{progress}%</span>
            </div>
            <div className="post-login-welcome__track h-4 overflow-hidden rounded-full border border-border bg-muted p-0.5">
              <div
                className="post-login-welcome__progress relative h-full overflow-hidden rounded-full bg-primary transition-[width] duration-500 ease-out"
                style={{ width: `${progress}%` }}
              >
                <span className="post-login-welcome__stripes absolute inset-0" />
              </div>
            </div>
            <p className="mt-5 text-xs text-muted-foreground">يتم تجهيز حسابك بأمان، لا تغلق الصفحة</p>
          </div>
        ) : (
          <div className="mt-8 w-full rounded-md border border-border bg-muted/70 p-4">
            <p className="text-sm font-semibold">التجهيز يأخذ وقتاً أطول من المعتاد</p>
            <p className="mt-1 text-xs text-muted-foreground">تحقق من اتصال الإنترنت ثم أعد المحاولة.</p>
            <div className="mt-4 flex justify-center gap-2">
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