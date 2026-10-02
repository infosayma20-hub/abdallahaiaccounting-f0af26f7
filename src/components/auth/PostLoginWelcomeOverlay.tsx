import { useEffect, useState } from "react";
import { Check } from "lucide-react";

export const POST_LOGIN_WELCOME_KEY = "unify:post-login-welcome";
export const POST_LOGIN_WELCOME_START_EVENT = "unify:post-login-welcome-start";
export const POST_LOGIN_ROUTE_READY_EVENT = "unify:post-login-route-ready";
export const POST_LOGIN_APPS_READY_EVENT = "unify:post-login-apps-ready";
export const POST_LOGIN_WELCOME_FINISHED_EVENT = "unify:post-login-welcome-finished";

export const markPostLoginWelcome = (targetPath?: string) => {
  try {
    sessionStorage.setItem(POST_LOGIN_WELCOME_KEY, String(Date.now()));
  } catch {
    // The welcome layer is cosmetic; authentication must continue if storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(POST_LOGIN_WELCOME_START_EVENT, { detail: { targetPath } }));
};

export const hasPendingPostLoginWelcome = () => {
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

export const finishPostLoginWelcome = (targetPath: string) => new Promise<void>((resolve) => {
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    window.removeEventListener(POST_LOGIN_WELCOME_FINISHED_EVENT, finish);
    resolve();
  };
  window.addEventListener(POST_LOGIN_WELCOME_FINISHED_EVENT, finish, { once: true });
  window.dispatchEvent(new CustomEvent(POST_LOGIN_ROUTE_READY_EVENT, { detail: { targetPath } }));
  window.setTimeout(finish, 1800);
});

const clearPendingWelcome = () => {
  try {
    sessionStorage.removeItem(POST_LOGIN_WELCOME_KEY);
  } catch {
    // Best effort only.
  }
};

const PostLoginWelcomeOverlay = () => {
  const [visible, setVisible] = useState(hasPendingPostLoginWelcome);
  const [routeReady, setRouteReady] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const handleStart = (event: Event) => {
      const targetPath = (event as CustomEvent<{ targetPath?: string }>).detail?.targetPath || null;
      setVisible(true);
      setLeaving(false);
      setRouteReady(!!targetPath);
    };
    const handleRouteReady = (event: Event) => {
      const targetPath = (event as CustomEvent<{ targetPath?: string }>).detail?.targetPath || null;
      if (targetPath) setRouteReady(true);
    };
    window.addEventListener(POST_LOGIN_WELCOME_START_EVENT, handleStart);
    window.addEventListener(POST_LOGIN_ROUTE_READY_EVENT, handleRouteReady);
    return () => {
      window.removeEventListener(POST_LOGIN_WELCOME_START_EVENT, handleStart);
      window.removeEventListener(POST_LOGIN_ROUTE_READY_EVENT, handleRouteReady);
    };
  }, []);

  useEffect(() => {
    if (!visible || !routeReady) return;
    const leaveTimer = window.setTimeout(() => setLeaving(true), 650);
    const hideTimer = window.setTimeout(() => {
      clearPendingWelcome();
      setVisible(false);
      window.dispatchEvent(new Event(POST_LOGIN_WELCOME_FINISHED_EVENT));
    }, 1100);
    return () => {
      window.clearTimeout(leaveTimer);
      window.clearTimeout(hideTimer);
    };
  }, [routeReady, visible]);

  if (!visible) return null;

  return (
    <div
      className={`post-login-welcome fixed inset-0 z-[10000] flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-8 ${leaving ? "post-login-welcome--leaving" : ""}`}
      dir="rtl"
      role="status"
      aria-live="polite"
      aria-label="جاري تجهيز حسابك"
    >
      <div className="post-login-welcome__scrim" aria-hidden="true" />
      <main className="post-login-welcome__dialog relative z-10 flex w-full max-w-[240px] flex-col items-center border border-primary-foreground/20 bg-background/95 px-5 py-5 text-center text-foreground shadow-2xl backdrop-blur-xl">
        <div className="post-login-welcome__check" aria-hidden="true">
          <Check className="h-8 w-8" strokeWidth={3} />
        </div>
        <h1 className="mt-3 text-xl font-bold text-foreground">أهلاً بك</h1>
      </main>
    </div>
  );
};

export default PostLoginWelcomeOverlay;