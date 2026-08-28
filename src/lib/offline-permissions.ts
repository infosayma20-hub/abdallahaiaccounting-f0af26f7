/**
 * Offline permission snapshot — encrypted, user-scoped, time-boxed.
 *
 * WHY: when the backend is unreachable every permission fetch returns empty.
 * Without a snapshot the app either (a) locks every module — offline
 * accounting becomes unusable — or (b) worse, treats "no deny override found"
 * as "allowed", which would silently widen access while offline.
 *
 * SECURITY RULES (do not relax):
 *  1. The snapshot is written ONLY from a fully successful online read.
 *  2. It is encrypted at rest with a non-extractable AES-GCM key (IndexedDB).
 *  3. It is bound to a single `user_id`; a different signed-in user can never
 *     read it. It is wiped on sign-out / account switch.
 *  4. It expires after MAX_SNAPSHOT_AGE_MS. After that, offline access is
 *     denied, not granted.
 *  5. It can only ever REPLAY the last known server answer. It never grants a
 *     permission the server did not already grant, and it preserves app-level
 *     deny lists so a blocked module stays blocked offline.
 */

const DB_NAME = "amwali_perm_cache";
const DB_VERSION = 1;
const STORE = "snapshot";
const KEYS_STORE = "crypto_keys";
const RECORD_ID = "current";

/** Offline permissions go stale after 3 days — then the user must reconnect. */
export const MAX_SNAPSHOT_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export interface PermissionSnapshot {
  user_id: string;
  saved_at: string;
  /** user_roles rows */
  roles: string[];
  /** role_default_feature_permissions as "role|app|feature|perm" → allowed */
  role_defaults: Array<[string, boolean]>;
  /** user_feature_permissions as "app.feature.perm" → allow|deny */
  overrides: Array<[string, "allow" | "deny"]>;
  /** user_app_access_overrides */
  app_allow: string[];
  app_deny: string[];
}

let _cachedKey: CryptoKey | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(KEYS_STORE)) db.createObjectStore(KEYS_STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getKey(): Promise<CryptoKey | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  if (_cachedKey) return _cachedKey;
  try {
    const db = await openDB();
    const existing = await new Promise<any>((resolve, reject) => {
      const req = db.transaction(KEYS_STORE, "readonly").objectStore(KEYS_STORE).get("perm_key");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (existing?.key) {
      _cachedKey = existing.key as CryptoKey;
      return _cachedKey;
    }
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(KEYS_STORE, "readwrite").objectStore(KEYS_STORE).put({ id: "perm_key", key });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    _cachedKey = key;
    return key;
  } catch {
    return null;
  }
}

/** In-memory mirror so repeated reads during one session stay cheap. */
let _memo: PermissionSnapshot | null = null;

export async function savePermissionSnapshot(snap: PermissionSnapshot): Promise<void> {
  if (!snap.user_id) return;
  _memo = snap;
  try {
    const key = await getKey();
    if (!key) return; // no crypto → refuse to persist permissions in the clear
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(snap)),
    );
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const req = db
        .transaction(STORE, "readwrite")
        .objectStore(STORE)
        .put({ id: RECORD_ID, user_id: snap.user_id, saved_at: snap.saved_at, _enc: { iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)), v: 1 } });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* best effort — a missing snapshot only costs offline availability */
  }
}

/**
 * Returns the snapshot only when it belongs to `userId` and is still fresh.
 * Any mismatch, corruption or expiry returns null → caller must fail closed.
 */
export async function loadPermissionSnapshot(userId: string): Promise<PermissionSnapshot | null> {
  if (!userId) return null;
  const fresh = (s: PermissionSnapshot | null) =>
    s && s.user_id === userId && Date.now() - new Date(s.saved_at).getTime() <= MAX_SNAPSHOT_AGE_MS ? s : null;
  if (_memo && fresh(_memo)) return _memo;
  try {
    const db = await openDB();
    const raw = await new Promise<any>((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(RECORD_ID);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (!raw?._enc || raw.user_id !== userId) return null;
    const key = await getKey();
    if (!key) return null;
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(raw._enc.iv) },
      key,
      new Uint8Array(raw._enc.ct),
    );
    const snap = JSON.parse(new TextDecoder().decode(pt)) as PermissionSnapshot;
    const ok = fresh(snap);
    if (ok) _memo = snap;
    return ok;
  } catch {
    return null;
  }
}

/** Wipe on sign-out or account switch. */
export async function clearPermissionSnapshot(): Promise<void> {
  _memo = null;
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(STORE, "readwrite").objectStore(STORE).delete(RECORD_ID);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    /* ignore */
  }
}
