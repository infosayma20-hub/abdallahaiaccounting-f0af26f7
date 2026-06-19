/**
 * POS Offline Database — IndexedDB wrapper for offline mode
 */

const DB_NAME = 'finix_pos_offline';
const DB_VERSION = 1;

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
  const items = await getAll<PendingSale>('pending_sales');
  // quarantined sales are excluded — they need manual review
  return items.filter(i => i.sync_status === 'pending' || i.sync_status === 'failed').length;
}

export async function countQuarantined(): Promise<number> {
  const items = await getAll<PendingSale>('pending_sales');
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
  await putOne('pending_sales', sale);
}

export async function getPendingSales(): Promise<PendingSale[]> {
  return getAll<PendingSale>('pending_sales');
}

export async function removePendingSale(id: string): Promise<void> {
  await deleteOne('pending_sales', id);
}

export const MAX_SYNC_RETRIES = 5;

export async function markSaleFailed(id: string, error: string): Promise<void> {
  const sale = await getOne<PendingSale>('pending_sales', id);
  if (sale) {
    sale.retry_count = (sale.retry_count || 0) + 1;
    sale.error = error;
    // After MAX_SYNC_RETRIES failures, quarantine — stops auto-retry, needs manual review
    sale.sync_status = sale.retry_count >= MAX_SYNC_RETRIES ? 'quarantined' : 'failed';
    await putOne('pending_sales', sale);
  }
}

export async function getQuarantinedSales(): Promise<PendingSale[]> {
  const items = await getAll<PendingSale>('pending_sales');
  return items.filter(i => i.sync_status === 'quarantined');
}

/** Manually requeue a quarantined sale (admin action). */
export async function requeueSale(id: string): Promise<void> {
  const sale = await getOne<PendingSale>('pending_sales', id);
  if (sale) {
    sale.sync_status = 'pending';
    sale.retry_count = 0;
    sale.error = undefined;
    await putOne('pending_sales', sale);
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
