import { useEffect, useState, createContext, useContext } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import { releaseAuthRefreshLeadership, startAuthRefreshCoordinator } from "@/lib/auth-cross-tab";

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
        setTimeout(() => logEvent("login_success", session), 0);
      } else if (event === "PASSWORD_RECOVERY") {
        setTimeout(() => logEvent("password_recovery", session), 0);
      } else if (event === "USER_UPDATED") {
        setTimeout(() => logEvent("user_updated", session), 0);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser((prev) => {
        const next = session?.user ?? null;
        if (prev?.id === next?.id) return prev;
        return next;
      });
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
      stopRefreshCoordinator();
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
      } catch {}
    }
    try {
      const prefix = `amwali_draft_${currentUser?.id || ""}`;
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(prefix)) localStorage.removeItem(key);
      }
      if (currentUser?.id) sessionStorage.removeItem(`workspace-choice:${currentUser.id}`);
    } catch {}
    releaseAuthRefreshLeadership();
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};
