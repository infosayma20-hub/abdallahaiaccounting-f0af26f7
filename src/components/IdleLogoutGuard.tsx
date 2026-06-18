import { useLocation } from "react-router-dom";
import { Lock, LogOut, ShieldCheck } from "lucide-react";
import { useIdleLogout } from "@/hooks/useIdleLogout";
import { useAuth } from "@/hooks/useAuth";
import { performSessionTimeout } from "@/lib/sessionLogout";

/**
 * Routes where the inactivity watcher must NOT run.
 *  - /auth, /reset-password, /auth/verify: pre-login or post-signout flows.
 *  - /pos and /pos/*: POS uses its own shift lifecycle (6 AM cutoff +
 *    business-day rules — see Memory: POS System). Idle logout here would
 *    interrupt long-running cashier sessions in production.
 *  - /employee and /employee/*: Employee portal — موظفو الملكي يحتاجون
 *    استقبال الإشعارات حتى لو تركوا الجهاز، فلا نسجّل خروج صامت لهم.
 *  - Public marketing pages: no user context, nothing to guard.
 */
const DISABLED_PREFIXES = [
  "/auth",
  "/reset-password",
  "/pos",
  "/employee",
  "/terms",
  "/privacy",
  "/pricing",
  "/features",
  "/blog",
  "/landing",
  "/share",
  "/branch-display",
  "/setup",
  "/blocked",
  "/unsubscribe",
];

function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

/**
 * Global idle-logout watcher. Mounted once at the App root inside
 * AuthProvider; checks the current route and the auth state to decide
 * whether to engage. Renders only a warning modal when the timeout is
 * about to fire — the actual sign-out + redirect happens inside the hook.
 */
export default function IdleLogoutGuard() {
  const { user, signOut } = useAuth();
  const location = useLocation();

  const path = location.pathname || "/";
  const isDisabledRoute = DISABLED_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
  const active = !!user && !isDisabledRoute;

  const { showWarning, remainingSec, bump } = useIdleLogout(active);

  if (!active || !showWarning) return null;

  const handleStay = () => bump();

  const handleLogoutNow = async () => {
    // Treat the explicit "logout now" click as a normal manual logout,
    // not an idle timeout — uses the wrapped signOut so audit log fires
    // with event_type="logout" and the redirect goes to a clean /auth.
    try {
      await signOut();
    } catch {
      // Defensive fallback: still kick the user out so they aren't stuck
      // staring at the warning modal if signOut throws.
      void performSessionTimeout(
        user
          ? {
              id: user.id,
              email: user.email ?? null,
              full_name:
                (user.user_metadata as { full_name?: string })?.full_name ??
                null,
            }
          : null,
      );
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-warning-title"
    >
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" />
      <div className="relative w-full max-w-md mx-4 bg-card rounded-2xl border border-border/50 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-8 text-center space-y-5">
          <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
            <Lock className="h-8 w-8 text-accent" />
          </div>
          <div>
            <h3 id="idle-warning-title" className="text-lg font-bold text-foreground mb-1">
              هل لا تزال هنا؟
            </h3>
            <p className="text-sm text-muted-foreground">
              سيتم تسجيل خروجك تلقائياً خلال:
            </p>
          </div>
          <div className="inline-flex items-center justify-center px-6 py-3 rounded-xl bg-accent/10 border border-accent/20">
            <span className="text-3xl font-mono font-bold text-accent tracking-wider">
              {formatTime(remainingSec)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">لحماية بياناتك المالية</p>
          <div className="flex gap-3">
            <button
              onClick={handleLogoutNow}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-secondary transition-colors flex items-center justify-center gap-2"
            >
              <LogOut className="h-4 w-4" />
              تسجيل الخروج الآن
            </button>
            <button
              onClick={handleStay}
              className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2"
            >
              <ShieldCheck className="h-4 w-4" />
              أنا هنا! ابقَ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
