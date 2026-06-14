import { useEffect, useState, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { normalizeAuthSessionExpiry, releaseAuthRefreshLeadership, startAuthRefreshCoordinator } from "@/lib/auth-cross-tab";
import { redirectToSessionExpired } from "@/lib/sessionExpired";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stopRefreshCoordinator = startAuthRefreshCoordinator();

    // Track whether we had a user before. We intentionally do NOT treat
    // every SIGNED_OUT event as "session expired" because many call sites
    // in the app still invoke `supabase.auth.signOut()` directly (sidebar
    // logout, SessionManager idle-timeout, AuthPage cleanup, etc.) without
    // going through our wrapper. The reliable signals for an *expired*
    // session are: (1) the visibility/focus probe below, (2) accessContext
    // RPCs returning a JWT error, (3) explicit 401s from REST/RPC. Those
    // already call redirectToSessionExpired() directly.
    let hadUser = false;

    const logEvent = async (event_type: string, sess: Session | null) => {
      const u = sess?.user;
      if (!u) return;
      try {
        const dedupeKey = `audit_${event_type}_${u.id}`;
        const last = sessionStorage.getItem(dedupeKey);
        if (last && Date.now() - parseInt(last) < 30000) return;
        sessionStorage.setItem(dedupeKey, String(Date.now()));

        await supabase.functions.invoke("log-security-event", {
          body: {
            user_id: u.id,
            user_email: u.email,
            user_name: u.user_metadata?.full_name || u.user_metadata?.name,
            event_type,
            auth_method: u.app_metadata?.provider || "unknown",
          },
        });
      } catch (e) {
        console.warn("Audit log failed:", e);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      normalizeAuthSessionExpiry(session);
      setSession(session);
      // Only update the user object when the identity actually changes.
      // Supabase fires INITIAL_SESSION, TOKEN_REFRESHED and (on tab focus) extra
      // events with a fresh User object that has the same id — updating state
      // every time forces every `useEffect([user])` consumer to refetch.
      setUser((prev) => {
        const next = session?.user ?? null;
        if (prev?.id === next?.id) return prev;
        return next;
      });
      setLoading(false);

      if (event === "SIGNED_IN") {
        hadUser = true;
        // Clear any stale workspace-choice from a previous user in this tab
        // so the chooser screen re-appears after every fresh login (e.g. when
        // a cashier signs out and another employee signs in on the same
        // browser tab).
        try {
          for (const key of Object.keys(sessionStorage)) {
            if (key.startsWith("workspace-choice:")) sessionStorage.removeItem(key);
          }
        } catch {}
        setTimeout(() => logEvent("login_success", session), 0);
      } else if (event === "PASSWORD_RECOVERY") {
        setTimeout(() => logEvent("password_recovery", session), 0);
      } else if (event === "USER_UPDATED") {
        setTimeout(() => logEvent("user_updated", session), 0);
      } else if (event === "SIGNED_OUT") {
        // Plain sign-out. Do not infer session-expiry from this event —
        // the dedicated probes (visibilitychange/focus, accessContext, RPC
        // 401 handlers) decide that. Just clear local tracking.
        hadUser = false;
      } else if (event === "TOKEN_REFRESHED") {
        hadUser = !!session?.user;
      } else if (event === "INITIAL_SESSION") {
        hadUser = !!session?.user;
      }
    });

    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        normalizeAuthSessionExpiry(session);
        setSession(session);
        setUser((prev) => {
          const next = session?.user ?? null;
          if (prev?.id === next?.id) return prev;
          return next;
        });
        hadUser = !!session?.user;
      })
      .catch((err) => {
        // Network error / Supabase cold start — never leave the whole app
        // stuck on AuthCheckSpinner. Treat as "no session" and let the
        // normal redirect logic send the user to /auth.
        console.warn("[auth] getSession failed:", err);
      })
      .finally(() => {
        setLoading(false);
      });

    // When the tab becomes visible again after being backgrounded, verify
    // the Supabase session is still alive on the server. If it isn't, our
    // local React `user` is stale and any RPC will return null/401 — which
    // is exactly what lands employees on the red "غير مرتبط بشركة" screen.
    // We redirect them straight to /auth with a friendly banner instead.
    const handleVisibility = async () => {
      if (typeof document === "undefined" || document.visibilityState !== "visible") return;
      if (!hadUser) return;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error || !data?.session) {
          // Server says the session is gone. Don't trust local state.
          redirectToSessionExpired();
          return;
        }
        // If the access token has already expired, force a refresh attempt.
        const expiresAt = data.session.expires_at; // seconds since epoch
        const nowSec = Math.floor(Date.now() / 1000);
        if (expiresAt && expiresAt <= nowSec) {
          const { error: refErr } = await supabase.auth.refreshSession();
          if (refErr) {
            redirectToSessionExpired();
          }
        }
      } catch {
        // Network errors do NOT count as session expiry. Stay put.
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", handleVisibility);

    return () => {
      subscription.unsubscribe();
      stopRefreshCoordinator();
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", handleVisibility);
    };
  }, []);

  const signOut = async () => {
    const currentUser = user;
    if (currentUser) {
      try {
        await supabase.functions.invoke("log-security-event", {
          body: {
            user_id: currentUser.id,
            user_email: currentUser.email,
            user_name: currentUser.user_metadata?.full_name,
            event_type: "logout",
          },
        });
      } catch {
        // Non-blocking audit log; logout must continue even if logging fails.
      }
    }
    try {
      const prefix = `amwali_draft_${currentUser?.id || ""}`;
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(prefix)) localStorage.removeItem(key);
      }
      if (currentUser?.id) sessionStorage.removeItem(`workspace-choice:${currentUser.id}`);
    } catch {
      // Storage cleanup is best-effort only.
    }
    releaseAuthRefreshLeadership();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
