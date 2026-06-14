/**
 * Centralised idle-timeout sign-out.
 *
 * Used by `useIdleLogout` (the SPA inactivity watcher) and by any tab that
 * receives a `session_force_logout` broadcast from a peer tab. Performs:
 *   1. Best-effort audit log (event_type = "session_timeout") so admins can
 *      distinguish auto-logout from manual logout in user_security_audit.
 *   2. Supabase signOut (revokes local session + clears refresh token).
 *   3. Local storage cleanup (sb-* tokens, drafts, activity ts, workspace).
 *   4. Cross-tab broadcast so every other open tab logs out in lock-step
 *      and the user does not get a stale UI in a background tab.
 *   5. Hard navigation to /auth?reason=session_timeout — replace() so React
 *      state is fully torn down and protected routes cannot re-render.
 *
 * Single-fire guard prevents duplicate work if the watcher and the
 * broadcast handler race.
 */
import { supabase } from "@/integrations/supabase/client";

let firing = false;

const ACTIVITY_KEY_PREFIX = "amwali_last_activity:";
const DRAFT_KEY_PREFIX = "amwali_draft_";
const WORKSPACE_KEY_PREFIX = "workspace-choice:";

function clearAuthStorage(userId?: string | null) {
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith("sb-") ||
        k.startsWith("supabase.") ||
        k.startsWith(ACTIVITY_KEY_PREFIX) ||
        (userId && k.startsWith(`${DRAFT_KEY_PREFIX}${userId}`))
      ) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
    if (userId) sessionStorage.removeItem(`${WORKSPACE_KEY_PREFIX}${userId}`);
  } catch {
    /* best-effort */
  }
}

async function logTimeoutEvent(user: {
  id: string;
  email?: string | null;
  full_name?: string | null;
}) {
  try {
    await supabase.functions.invoke("log-security-event", {
      body: {
        user_id: user.id,
        user_email: user.email ?? undefined,
        user_name: user.full_name ?? undefined,
        event_type: "session_timeout",
        metadata: { source: "idle_watcher" },
      },
    });
  } catch {
    /* non-blocking */
  }
}

function broadcastForceLogout(userId: string) {
  try {
    const bc = new BroadcastChannel("malaky-sync");
    bc.postMessage({
      type: "session_force_logout",
      userId,
      reason: "timeout",
      ts: Date.now(),
    });
    // Close on next tick so the message has time to flush.
    setTimeout(() => {
      try { bc.close(); } catch { /* noop */ }
    }, 0);
  } catch {
    /* BroadcastChannel unsupported — single-tab fallback */
  }
}

export interface SessionTimeoutOptions {
  /** Skip the audit log and the broadcast — used by peer tabs reacting to
   *  a broadcast we already emitted. Prevents N-tab broadcast storms and
   *  duplicate audit rows for one logical event. */
  silent?: boolean;
}

export async function performSessionTimeout(
  user: { id: string; email?: string | null; full_name?: string | null } | null,
  opts: SessionTimeoutOptions = {},
): Promise<void> {
  if (firing) return;
  firing = true;

  // Avoid redirect loop if we're already on /auth.
  const path = typeof window !== "undefined" ? window.location.pathname : "";
  const onAuth = path === "/auth" || path.startsWith("/auth/");

  // 1) Audit (originating tab only).
  if (!opts.silent && user) {
    await logTimeoutEvent(user);
  }

  // 2) Sign out locally.
  try {
    await supabase.auth.signOut();
  } catch {
    /* token already missing or network error — continue cleanup */
  }

  // 3) Wipe storage.
  clearAuthStorage(user?.id);

  // 4) Tell peer tabs (originating tab only).
  if (!opts.silent && user) {
    broadcastForceLogout(user.id);
  }

  // 5) Navigate. Replace so back-button cannot restore a protected view.
  if (typeof window !== "undefined" && !onAuth) {
    window.location.replace("/auth?reason=session_timeout");
  } else {
    // We were already on /auth; just release the guard so a fresh sign-in
    // can later trigger a new auto-logout cycle if needed.
    firing = false;
  }
}
