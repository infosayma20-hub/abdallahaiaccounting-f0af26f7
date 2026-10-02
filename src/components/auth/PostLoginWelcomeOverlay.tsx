import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

export const POST_LOGIN_WELCOME_KEY = "unify:post-login-welcome";
export const POST_LOGIN_WELCOME_START_EVENT = "unify:post-login-welcome-start";
export const POST_LOGIN_ROUTE_READY_EVENT = "unify:post-login-route-ready";
export const POST_LOGIN_APPS_READY_EVENT = "unify:post-login-apps-ready";
export const POST_LOGIN_SHELL_READY_EVENT = "unify:post-login-shell-ready";
export const POST_LOGIN_WELCOME_FINISHED_EVENT = "unify:post-login-welcome-finished";

export const markPostLoginWelcome = (targetPath?: string, options?: { silent?: boolean }) => {
  try {
    sessionStorage.setItem(POST_LOGIN_WELCOME_KEY, String(Date.now()));
  } catch {
    // The welcome layer is cosmetic; authentication must continue if storage is unavailable.
  }
  // silent: only remember the pending welcome (e.g. before leaving for Google);
  // the popup appears once the user actually returns signed in.
  if (options?.silent) return;
  window.dispatchEvent(new CustomEvent(POST_LOGIN_WELCOME_START_EVENT, { detail: { targetPath } }));
};

export const showPostLoginWelcome = () =>
  window.dispatchEvent(new CustomEvent(POST_LOGIN_WELCOME_START_EVENT, { detail: {} }));

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
  const waitsForLauncher = targetPath === "/apps";
  window.dispatchEvent(new CustomEvent(POST_LOGIN_ROUTE_READY_EVENT, {
    detail: { targetPath, releaseWelcome: !waitsForLauncher },
  }));

  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    window.removeEventListener(POST_LOGIN_WELCOME_FINISHED_EVENT, finish);
    resolve();
  };
  window.addEventListener(POST_LOGIN_WELCOME_FINISHED_EVENT, finish, { once: true });
  // The launcher's own four-second watchdog releases its readiness signal.
  // Keep this longer fallback only for unexpected mounting/runtime failures.
  window.setTimeout(finish, waitsForLauncher ? 5500 : 2400);
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
  const [targetPath, setTargetPath] = useState<string | null>(null);
  const [routeReady, setRouteReady] = useState(false);
  const [appsReady, setAppsReady] = useState(false);
  const [shellReady, setShellReady] = useState(false);
  const [success, setSuccess] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const shownAtRef = useRef(Date.now());

  useEffect(() => {
    const handleStart = (event: Event) => {
      const targetPath = (event as CustomEvent<{ targetPath?: string }>).detail?.targetPath || null;
      shownAtRef.current = Date.now();
      setVisible(true);
      setSuccess(false);
      setLeaving(false);
      setRouteReady(false);
      setAppsReady(false);
      setShellReady(false);
      setTargetPath(targetPath);
    };
    const handleRouteReady = (event: Event) => {
      const detail = (event as CustomEvent<{ targetPath?: string; releaseWelcome?: boolean }>).detail;
      if (!detail?.targetPath) return;
      // Only the login flow's own signal (it carries releaseWelcome) decides
      // the destination. Route guards re-broadcast their guessed path on every
      // page (e.g. "/apps" for super admins), which used to reset the timers
      // and leave the welcome spinning forever.
      if (detail.releaseWelcome === undefined) return;
      setTargetPath(detail.targetPath);
      if (detail.releaseWelcome) setRouteReady(true);
    };
    const handleAppsReady = () => {
      setTargetPath("/apps");
      setAppsReady(true);
    };
    const handleShellReady = () => setShellReady(true);
    window.addEventListener(POST_LOGIN_WELCOME_START_EVENT, handleStart);
    window.addEventListener(POST_LOGIN_ROUTE_READY_EVENT, handleRouteReady);
    window.addEventListener(POST_LOGIN_APPS_READY_EVENT, handleAppsReady);
    window.addEventListener(POST_LOGIN_SHELL_READY_EVENT, handleShellReady);
    return () => {
      window.removeEventListener(POST_LOGIN_WELCOME_START_EVENT, handleStart);
      window.removeEventListener(POST_LOGIN_ROUTE_READY_EVENT, handleRouteReady);
      window.removeEventListener(POST_LOGIN_APPS_READY_EVENT, handleAppsReady);
      window.removeEventListener(POST_LOGIN_SHELL_READY_EVENT, handleShellReady);
    };
  }, []);

  useEffect(() => {
    const readyToFinish = targetPath === "/apps" ? appsReady && shellReady : routeReady;
    if (!visible || !readyToFinish) return;
    // دورتان كاملتان على الأقل (2 × 780ms)، ويستمر الدوران إن تأخر التجهيز.
    const minimumOrbitMs = 1560;
    const successDelay = Math.max(0, minimumOrbitMs - (Date.now() - shownAtRef.current));
    const successTimer = window.setTimeout(() => setSuccess(true), successDelay);
    const leaveTimer = window.setTimeout(() => setLeaving(true), successDelay + 750);
    const hideTimer = window.setTimeout(() => {
      clearPendingWelcome();
      setVisible(false);
      window.dispatchEvent(new Event(POST_LOGIN_WELCOME_FINISHED_EVENT));
    }, successDelay + 1250);
    return () => {
      window.clearTimeout(successTimer);
      window.clearTimeout(leaveTimer);
      window.clearTimeout(hideTimer);
    };
  }, [appsReady, routeReady, shellReady, targetPath, visible]);

  // Safety net: the welcome is cosmetic and must never block the app.
  useEffect(() => {
    if (!visible) return;
    const t = window.setTimeout(() => {
      clearPendingWelcome();
      setVisible(false);
      window.dispatchEvent(new Event(POST_LOGIN_WELCOME_FINISHED_EVENT));
    }, 9000);
    return () => window.clearTimeout(t);
  }, [visible]);

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
        <div className={`post-login-welcome__check ${success ? "post-login-welcome__check--success" : ""}`} aria-hidden="true">
          <span className="post-login-welcome__orbit" />
          <Check className="post-login-welcome__checkmark h-8 w-8" strokeWidth={3} />
        </div>
        <h1 className="mt-3 text-xl font-bold text-foreground">أهلاً بك</h1>
      </main>
    </div>
  );
};

export default PostLoginWelcomeOverlay;