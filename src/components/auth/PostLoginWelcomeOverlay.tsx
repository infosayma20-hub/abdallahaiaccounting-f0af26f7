import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { RefreshCw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useCompany } from "@/hooks/useCompanyContext";
import { supabase } from "@/integrations/supabase/client";

export const POST_LOGIN_WELCOME_KEY = "unify:post-login-welcome";
export const POST_LOGIN_WELCOME_START_EVENT = "unify:post-login-welcome-start";
export const POST_LOGIN_ROUTE_READY_EVENT = "unify:post-login-route-ready";
export const POST_LOGIN_APPS_READY_EVENT = "unify:post-login-apps-ready";

export const markPostLoginWelcome = () => {
  try {
    sessionStorage.setItem(POST_LOGIN_WELCOME_KEY, String(Date.now()));
  } catch {
    // The welcome layer is cosmetic; authentication must continue if storage is unavailable.
  }
  window.dispatchEvent(new Event(POST_LOGIN_WELCOME_START_EVENT));
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

  useEffect(() => {
    const handleStart = () => {
      setVisible(true);
      setLeaving(false);
      setStalled(false);
      setRouteReady(false);
      setResolvedTarget(null);
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
      className={`post-login-welcome fixed inset-0 z-[10000] flex min-h-[100dvh] items-center justify-center overflow-hidden bg-primary px-5 text-primary-foreground ${leaving ? "post-login-welcome--leaving" : ""}`}
      dir="rtl"
      role="status"
      aria-live="polite"
      aria-label="جاري تجهيز حسابك"
    >
      <div className="post-login-welcome__pattern" aria-hidden="true" />
      <main className="relative z-10 flex w-full max-w-md flex-col items-center text-center">
        <div className="post-login-welcome__logos flex min-h-24 items-center justify-center gap-5">
          {company.logo_url ? (
            <div className="flex h-20 w-20 items-center justify-center rounded-md border border-primary-foreground/15 bg-primary-foreground/95 p-2 shadow-lg">
              <img src={company.logo_url} alt={company.name || "شعار الشركة"} className="max-h-full max-w-full object-contain" />
            </div>
          ) : null}
          <img src="/logos/unify-logo-white.png" alt="يونيفاي" className="h-auto w-40 max-w-[45vw] object-contain" />
        </div>

        <div className="mt-9 min-h-24">
          <p className="text-sm font-medium text-primary-foreground/65">مرحباً بعودتك</p>
          <h1 className="mt-2 text-2xl font-bold sm:text-3xl">
            {displayName ? `أهلاً بك، ${displayName}` : "أهلاً بك"}
          </h1>
          {company.name ? <p className="mt-2 text-sm text-primary-foreground/70">{company.name}</p> : null}
        </div>

        {!stalled ? (
          <div className="mt-9 w-56 max-w-[65vw]" aria-hidden="true">
            <div className="h-1 overflow-hidden rounded-full bg-primary-foreground/15">
              <div className="post-login-welcome__progress h-full rounded-full bg-accent" />
            </div>
            <p className="mt-4 text-xs text-primary-foreground/60">نجهّز تطبيقاتك وصلاحياتك</p>
          </div>
        ) : (
          <div className="mt-8 w-full rounded-md border border-primary-foreground/15 bg-primary-foreground/5 p-4">
            <p className="text-sm font-semibold">التجهيز يأخذ وقتاً أطول من المعتاد</p>
            <p className="mt-1 text-xs text-primary-foreground/65">تحقق من اتصال الإنترنت ثم أعد المحاولة.</p>
            <div className="mt-4 flex justify-center gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => window.location.reload()} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                إعادة المحاولة
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-2 border-primary-foreground/25 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
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