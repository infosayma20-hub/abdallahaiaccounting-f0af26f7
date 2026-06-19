/**
 * POS Offline Database — IndexedDB wrapper for offline mode
 */

const DB_NAME = 'finix_pos_offline';
const DB_VERSION = 2;

// ── AES-GCM encryption for sensitive pending_sales fields ──
// Key is generated once and stored non-extractable in IndexedDB (`crypto_keys` store).
// Sensitive fields are encrypted at rest to mitigate disk/forensic exposure on shared terminals.

const ENCRYPTED_FIELDS: (keyof PendingSale)[] = [
  'order_data', 'items', 'payments', 'customer_name', 'notes',
];

let _cachedKey: CryptoKey | null = null;

async function getEncryptionKey(): Promise<CryptoKey | null> {
  if (typeof crypto === 'undefined' || !crypto.subtle) return null;
  if (_cachedKey) return _cachedKey;
  try {
    const db = await openDB();
    const existing = await new Promise<any>((resolve, reject) => {
      const req = db.transaction('crypto_keys', 'readonly').objectStore('crypto_keys').get('pending_sales_key');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (existing?.key) { _cachedKey = existing.key as CryptoKey; return _cachedKey; }
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    await new Promise<void>((resolve, reject) => {
      const req = db.transaction('crypto_keys', 'readwrite').objectStore('crypto_keys').put({ id: 'pending_sales_key', key });
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
    _cachedKey = key;
    return key;
  } catch {
    return null;
  }
}

async function encryptSale(sale: PendingSale): Promise<any> {
  const key = await getEncryptionKey();
  if (!key) return sale; // graceful degradation on unsupported browsers
  const plaintext = {} as Record<string, any>;
  const out: any = { ...sale };
  for (const f of ENCRYPTED_FIELDS) {
    if (out[f] !== undefined) { plaintext[f as string] = out[f]; delete out[f]; }
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(plaintext));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  out._enc = { iv: Array.from(iv), ct: Array.from(new Uint8Array(ct)), v: 1 };
  return out;
}

async function decryptSale(raw: any): Promise<PendingSale> {
  if (!raw?._enc) return raw as PendingSale;
  const key = await getEncryptionKey();
  if (!key) return raw as PendingSale;
  try {
    const iv = new Uint8Array(raw._enc.iv);
    const ct = new Uint8Array(raw._enc.ct);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    const fields = JSON.parse(new TextDecoder().decode(pt));
    const { _enc, ...rest } = raw;
    return { ...rest, ...fields } as PendingSale;
  } catch {
    return raw as PendingSale;
  }
}

export interface PendingSale {
  id: string;
  local_id: string;
  order_data: any;
  items: any[];
  total: number;
  subtotal?: number;
  tax_amount?: number;
  discount_amount?: number;
  payment_method: string;
  /** Full payments array (multi-currency / split). Preferred over payment_method. */
  payments?: any[];
  notes?: string;
  customer_id: string | null;
  customer_name: string;
  cashier_id: string;
  session_id: string;
  terminal_id: string | null;
  device_id: string;
  created_at: string;
  sync_status: 'pending' | 'failed' | 'quarantined';
  retry_count: number;
  error?: string;
  order_number: string;
}

export interface SyncLogEntry {
  id: string;
  offline_started_at: string;
  online_restored_at: string | null;
  offline_duration_minutes: number;
  transactions_count: number;
  synced_count: number;
  failed_count: number;
  created_at: string;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('products')) {
        db.createObjectStore('products', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('customers')) {
        db.createObjectStore('customers', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('pending_sales')) {
        const store = db.createObjectStore('pending_sales', { keyPath: 'id' });
        store.createIndex('sync_status', 'sync_status', { unique: false });
      }
      if (!db.objectStoreNames.contains('sync_log')) {
        db.createObjectStore('sync_log', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('crypto_keys')) {
        db.createObjectStore('crypto_keys', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function tx(storeName: string, mode: IDBTransactionMode = 'readonly'): Promise<IDBObjectStore> {
  const db = await openDB();
  return db.transaction(storeName, mode).objectStore(storeName);
}

// ── Generic operations ──

export async function putAll(storeName: string, items: any[]): Promise<void> {
  const db = await openDB();
  const transaction = db.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  // Clear old data and replace
  store.clear();
  for (const item of items) {
    store.put(item);
  }
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function putOne(storeName: string, item: any): Promise<void> {
  const store = await tx(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.put(item);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getAll<T = any>(storeName: string): Promise<T[]> {
  const store = await tx(storeName);
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error);
  });
}

export async function getOne<T = any>(storeName: string, key: string): Promise<T | undefined> {
  const store = await tx(storeName);
  return new Promise((resolve, reject) => {
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteOne(storeName: string, key: string): Promise<void> {
  const store = await tx(storeName, 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function countPending(): Promise<number> {
  const items = await getPendingSales();
  // quarantined sales are excluded — they need manual review
  return items.filter(i => i.sync_status === 'pending' || i.sync_status === 'failed').length;
}

export async function countQuarantined(): Promise<number> {
  const items = await getPendingSales();
  return items.filter(i => i.sync_status === 'quarantined').length;
}

// ── Pre-cache helpers ──

export async function cacheProducts(products: any[]): Promise<void> {
  await putAll('products', products);
}

export async function cacheCustomers(customers: any[]): Promise<void> {
  await putAll('customers', customers);
}

export async function getCachedProducts(): Promise<any[]> {
  return getAll('products');
}

export async function getCachedCustomers(): Promise<any[]> {
  return getAll('customers');
}

// ── Pending sales ──

export async function addPendingSale(sale: PendingSale): Promise<void> {
  const enc = await encryptSale(sale);
  await putOne('pending_sales', enc);
}

export async function getPendingSales(): Promise<PendingSale[]> {
  const rows = await getAll<any>('pending_sales');
  return Promise.all(rows.map(decryptSale));
}

async function getPendingSale(id: string): Promise<PendingSale | undefined> {
  const raw = await getOne<any>('pending_sales', id);
  return raw ? decryptSale(raw) : undefined;
}

export async function removePendingSale(id: string): Promise<void> {
  await deleteOne('pending_sales', id);
}

export const MAX_SYNC_RETRIES = 5;

export async function markSaleFailed(id: string, error: string): Promise<void> {
  const sale = await getPendingSale(id);
  if (sale) {
    sale.retry_count = (sale.retry_count || 0) + 1;
    sale.error = error;
    // After MAX_SYNC_RETRIES failures, quarantine — stops auto-retry, needs manual review
    sale.sync_status = sale.retry_count >= MAX_SYNC_RETRIES ? 'quarantined' : 'failed';
    await putOne('pending_sales', await encryptSale(sale));
  }
}

export async function getQuarantinedSales(): Promise<PendingSale[]> {
  const items = await getPendingSales();
  return items.filter(i => i.sync_status === 'quarantined');
}

/** Manually requeue a quarantined sale (admin action). */
export async function requeueSale(id: string): Promise<void> {
  const sale = await getPendingSale(id);
  if (sale) {
    sale.sync_status = 'pending';
    sale.retry_count = 0;
    sale.error = undefined;
    await putOne('pending_sales', await encryptSale(sale));
  }
}

// ── Sync log ──

export async function addSyncLog(entry: SyncLogEntry): Promise<void> {
  await putOne('sync_log', entry);
}

export async function getSyncLogs(): Promise<SyncLogEntry[]> {
  const logs = await getAll<SyncLogEntry>('sync_log');
  return logs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}
