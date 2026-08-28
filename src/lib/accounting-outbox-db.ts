/**
 * Accounting Outbox — encrypted IndexedDB queue for accounting documents
 * created while the internet is down.
 *
 * Design mirrors the proven POS offline queue (`pos-offline-db.ts`):
 *  - AES-GCM encryption at rest with a non-extractable key kept in IndexedDB.
 *  - Each entry carries a `local_id` used as the server idempotency key, so a
 *    replayed document can never post twice.
 *  - After MAX_SYNC_RETRIES failures the entry is quarantined for manual review
 *    instead of being retried forever or silently dropped.
 *
 * IMPORTANT: an entry is a *pending* document. It does NOT exist in the ledger
 * until the server accepts it and assigns the official number.
 */

const DB_NAME = "amwali_accounting_offline";
const DB_VERSION = 1;
const STORE = "outbox";
const KEYS_STORE = "crypto_keys";

export const MAX_SYNC_RETRIES = 5;

export type OutboxDocType =
  | "receipt_voucher"
  | "payment_voucher"
  | "sales_invoice"
  | "journal_entry"
  | "contact"
  | "account"
  | "employee"
  | "cash_transfer"
  | "cheque";

export interface OutboxEntry {
  id: string;
  /** Idempotency anchor sent to the server as p_idempotency_key. */
  local_id: string;
  doc_type: OutboxDocType;
  /** RPC name used to post this document atomically on the server. */
  rpc: string;
  /** RPC arguments (without the idempotency key — it is injected at sync). */
  payload: Record<string, unknown>;
  /** Human-readable summary shown in the pending/quarantine list. */
  summary: {
    title: string;
    contact_name?: string;
    amount?: number;
    currency?: string;
    doc_date?: string;
  };
  user_id: string;
  created_at: string;
  sync_status: "pending" | "failed" | "quarantined" | "synced";
  retry_count: number;
  error?: string;
  synced_at?: string;
  server_id?: string;
}

const ENCRYPTED_FIELDS: (keyof OutboxEntry)[] = ["payload", "summary"];

let _cachedKey: CryptoKey | null = null;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("sync_status", "sync_status", { unique: false });
      }
      if (!db.objectStoreNames.contains(KEYS_STORE)) {
        db.createObjectStore(KEYS_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getEncryptionKey(): Promise<CryptoKey | null> {
  if (typeof crypto === "undefined" || !crypto.subtle) return null;
  if (_cachedKey) return _cachedKey;
  try {
    const db = await openDB();
    const existing = await new Promise<any>((resolve, reject) => {
      const req = db.transaction(KEYS_STORE, "readonly").objectStore(KEYS_STORE).get("outbox_key");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (existing?.key) {
      _cachedKey = existing.key as CryptoKey;
      return _cachedKey;
    }
    const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction(KEYS_STORE, "readwrite").objectStore(KEYS_STORE).put({ id: "outbox_key", key });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    _cachedKey = key;
    return key;
  } catch {
    return null;
  }
}

async function encryptEntry(entry: OutboxEntry): Promise<any> {
  const key = await getEncryptionKey();
  if (!key) return entry;
  const plaintext: Record<string, any> = {};
  const out: any = { ...entry };
  for (const f of ENCRYPTED_FIELDS) {
    if (out[f] !== undefined) {
      plaintext[f as string] = out[f];
      delete out[f];
    }
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(plaintext));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, data);
  out._enc = { iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)), v: 1 };
  return out;
}

async function decryptEntry(raw: any): Promise<OutboxEntry> {
  if (!raw?._enc) return raw as OutboxEntry;
  const key = await getEncryptionKey();
  if (!key) return raw as OutboxEntry;
  try {
    const iv = new Uint8Array(raw._enc.iv);
    const ct = new Uint8Array(raw._enc.ct);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    const fields = JSON.parse(new TextDecoder().decode(pt));
    const { _enc, ...rest } = raw;
    return { ...rest, ...fields } as OutboxEntry;
  } catch {
    return raw as OutboxEntry;
  }
}

async function put(entry: OutboxEntry): Promise<void> {
  const db = await openDB();
  const enc = await encryptEntry(entry);
  await new Promise<void>((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).put(enc);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function getRaw(id: string): Promise<OutboxEntry | undefined> {
  const db = await openDB();
  const raw = await new Promise<any>((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return raw ? decryptEntry(raw) : undefined;
}

export async function listOutbox(): Promise<OutboxEntry[]> {
  const db = await openDB();
  const rows = await new Promise<any[]>((resolve, reject) => {
    const req = db.transaction(STORE, "readonly").objectStore(STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  const items = await Promise.all(rows.map(decryptEntry));
  return items.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
}

export function makeLocalId(prefix: string): string {
  const rnd =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${rnd}`;
}

export async function enqueueDocument(
  input: Omit<OutboxEntry, "id" | "created_at" | "sync_status" | "retry_count">,
): Promise<OutboxEntry> {
  const entry: OutboxEntry = {
    ...input,
    id: input.local_id,
    created_at: new Date().toISOString(),
    sync_status: "pending",
    retry_count: 0,
  };
  await put(entry);
  return entry;
}

export async function markSynced(id: string, serverId?: string): Promise<void> {
  const entry = await getRaw(id);
  if (!entry) return;
  entry.sync_status = "synced";
  entry.synced_at = new Date().toISOString();
  entry.server_id = serverId;
  entry.error = undefined;
  await put(entry);
}

export async function markFailed(id: string, error: string, opts?: { quarantine?: boolean }): Promise<void> {
  const entry = await getRaw(id);
  if (!entry) return;
  entry.retry_count = (entry.retry_count || 0) + 1;
  entry.error = error;
  entry.sync_status =
    opts?.quarantine || entry.retry_count >= MAX_SYNC_RETRIES ? "quarantined" : "failed";
  await put(entry);
}

export async function requeueDocument(id: string): Promise<void> {
  const entry = await getRaw(id);
  if (!entry) return;
  entry.sync_status = "pending";
  entry.retry_count = 0;
  entry.error = undefined;
  await put(entry);
}

export async function removeDocument(id: string): Promise<void> {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const req = db.transaction(STORE, "readwrite").objectStore(STORE).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Drop synced entries older than the retention window (audit trail cleanup). */
export async function pruneSynced(olderThanMs = 7 * 24 * 60 * 60 * 1000): Promise<void> {
  const items = await listOutbox();
  const cutoff = Date.now() - olderThanMs;
  await Promise.all(
    items
      .filter((i) => i.sync_status === "synced" && new Date(i.synced_at || i.created_at).getTime() < cutoff)
      .map((i) => removeDocument(i.id)),
  );
}

export async function countByStatus(): Promise<{ pending: number; quarantined: number }> {
  const items = await listOutbox();
  return {
    pending: items.filter((i) => i.sync_status === "pending" || i.sync_status === "failed").length,
    quarantined: items.filter((i) => i.sync_status === "quarantined").length,
  };
}
