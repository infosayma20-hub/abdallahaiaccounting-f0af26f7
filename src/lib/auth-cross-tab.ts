import { supabase } from "@/integrations/supabase/client";

type AuthLock = <R>(name: string, acquireTimeout: number, fn: () => Promise<R>) => Promise<R>;

const TAB_ID_KEY = "amwali:auth-tab-id";
const LOCK_PREFIX = "amwali:auth-lock:";
const LEADER_KEY = "amwali:auth-refresh-leader";
const LOCK_LEASE_MS = 15_000;
const LOCK_HEARTBEAT_MS = 4_000;
const LOCK_POLL_MS = 80;
const REFRESH_LEASE_MS = 12_000;
const REFRESH_HEARTBEAT_MS = 4_000;

interface LockRecord {
  owner: string;
  expiresAt: number;
}

interface LeaderRecord {
  tabId: string;
  expiresAt: number;
  updatedAt: number;
}

const createId = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};

const getTabId = () => {
  try {
    const existing = sessionStorage.getItem(TAB_ID_KEY);
    if (existing) return existing;
    const next = createId();
    sessionStorage.setItem(TAB_ID_KEY, next);
    return next;
  } catch {
    return createId();
  }
};

const TAB_ID = getTabId();

const readJson = <T,>(key: string): T | null => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

const writeJson = (key: string, value: unknown) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createTimeoutError = (name: string, acquireTimeout: number) => {
  const error = new Error(`Auth lock "${name}" timed out after ${acquireTimeout}ms`);
  error.name = "LockAcquireTimeoutError";
  (error as Error & { isAcquireTimeout?: boolean }).isAcquireTimeout = true;
  return error;
};

const tryAcquireLocalLock = (key: string, owner: string) => {
  const now = Date.now();
  const current = readJson<LockRecord>(key);
  if (current && current.owner !== owner && current.expiresAt > now) return false;

  writeJson(key, { owner, expiresAt: now + LOCK_LEASE_MS });
  return readJson<LockRecord>(key)?.owner === owner;
};

const localStorageAuthLock: AuthLock = async (name, acquireTimeout, fn) => {
  if (typeof window === "undefined") return fn();

  const key = `${LOCK_PREFIX}${name}`;
  const owner = `${TAB_ID}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  const deadline = acquireTimeout < 0 ? Number.POSITIVE_INFINITY : Date.now() + acquireTimeout;

  while (true) {
    if (tryAcquireLocalLock(key, owner)) {
      const heartbeat = window.setInterval(() => {
        const current = readJson<LockRecord>(key);
        if (current?.owner === owner) {
          writeJson(key, { owner, expiresAt: Date.now() + LOCK_LEASE_MS });
        }
      }, LOCK_HEARTBEAT_MS);

      try {
        return await fn();
      } finally {
        window.clearInterval(heartbeat);
        if (readJson<LockRecord>(key)?.owner === owner) localStorage.removeItem(key);
      }
    }

    if (acquireTimeout === 0 || Date.now() >= deadline) {
      throw createTimeoutError(name, acquireTimeout);
    }

    const remaining = deadline - Date.now();
    const delay = acquireTimeout < 0 ? LOCK_POLL_MS : Math.min(LOCK_POLL_MS, Math.max(0, remaining));
    await wait(delay + Math.floor(Math.random() * 40));
  }
};

export const installAuthCrossTabLock = () => {
  const auth = supabase.auth as unknown as {
    lock?: AuthLock;
    lockAcquireTimeout?: number;
    __amwaliCrossTabLockInstalled?: boolean;
  };

  if (auth.__amwaliCrossTabLockInstalled) return;
  auth.lock = localStorageAuthLock;
  auth.lockAcquireTimeout = Math.max(auth.lockAcquireTimeout ?? 0, LOCK_LEASE_MS);
  auth.__amwaliCrossTabLockInstalled = true;
};

const readLeader = () => readJson<LeaderRecord>(LEADER_KEY);

const ownsLeader = () => readLeader()?.tabId === TAB_ID;

const removeLeaderIfOwned = () => {
  if (ownsLeader()) localStorage.removeItem(LEADER_KEY);
};

export const releaseAuthRefreshLeadership = () => {
  try {
    removeLeaderIfOwned();
  } catch {
    // Best effort: private browsing or storage restrictions must not block logout.
  }
};

let coordinatorCleanup: (() => void) | null = null;

export const startAuthRefreshCoordinator = () => {
  installAuthCrossTabLock();
  if (coordinatorCleanup) return coordinatorCleanup;

  const auth = supabase.auth as unknown as {
    startAutoRefresh?: () => Promise<void>;
    stopAutoRefresh?: () => Promise<void>;
  };

  let stopped = false;
  let isLeader = false;
  let applyingRole = false;
  const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("amwali-auth-refresh") : null;

  const setLeaderMode = async (nextIsLeader: boolean) => {
    if (stopped || applyingRole || isLeader === nextIsLeader) return;
    applyingRole = true;
    isLeader = nextIsLeader;
    try {
      if (nextIsLeader) await auth.startAutoRefresh?.();
      else await auth.stopAutoRefresh?.();
    } catch (error) {
      console.warn("[AuthCrossTab] Failed to update refresh role:", error);
    } finally {
      applyingRole = false;
    }
  };

  const evaluate = () => {
    if (stopped) return;

    if (typeof document !== "undefined" && document.visibilityState !== "visible") {
      removeLeaderIfOwned();
      void setLeaderMode(false);
      return;
    }

    const now = Date.now();
    const current = readLeader();
    if (!current || current.tabId === TAB_ID || current.expiresAt <= now) {
      writeJson(LEADER_KEY, { tabId: TAB_ID, updatedAt: now, expiresAt: now + REFRESH_LEASE_MS });
      const claimed = ownsLeader();
      void setLeaderMode(claimed);
      channel?.postMessage({ type: "leader", tabId: TAB_ID });
      return;
    }

    void setLeaderMode(false);
  };

  const heartbeat = window.setInterval(evaluate, REFRESH_HEARTBEAT_MS);
  const onVisibilityChange = () => evaluate();
  const onStorage = (event: StorageEvent) => {
    if (event.key === LEADER_KEY) evaluate();
  };
  const onPageHide = () => removeLeaderIfOwned();

  channel?.addEventListener("message", evaluate);
  window.addEventListener("storage", onStorage);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibilityChange);

  void auth.stopAutoRefresh?.().finally(evaluate);

  coordinatorCleanup = () => {
    stopped = true;
    window.clearInterval(heartbeat);
    removeLeaderIfOwned();
    channel?.removeEventListener("message", evaluate);
    channel?.close();
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    coordinatorCleanup = null;
  };

  return coordinatorCleanup;
};