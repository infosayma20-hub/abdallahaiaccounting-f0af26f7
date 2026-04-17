/**
 * Print Diagnostics — In-memory log of recent print operations.
 * 
 * Tracks every call to the print bridge (endpoint, payload size, mode, status).
 * Used by PrintDiagnosticsPanel to surface issues quickly.
 */

export type PrintMode = 'raster' | 'text';
export type PrintStatus = 'pending' | 'sent' | 'failed' | 'bridge_unreachable';

export interface PrintLogEntry {
  id: string;
  timestamp: string;
  endpoint: string;        // e.g. /print-receipt
  receiptType: string;     // cashier | kitchen | shift | test-text | test-logo | test-receipt
  printMode: PrintMode;
  itemsCount?: number;
  estimatedHeight?: number;
  payloadBytes: number;
  status: PrintStatus;
  durationMs?: number;
  responsePayload?: any;
  errorMessage?: string;
}

const MAX_ENTRIES = 50;
const STORAGE_KEY = 'print-diagnostics-log';

type Listener = (entries: PrintLogEntry[]) => void;
const listeners = new Set<Listener>();

function load(): PrintLogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function persist(entries: PrintLogEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(0, MAX_ENTRIES)));
  } catch { /* quota exceeded — ignore */ }
}

function notify(entries: PrintLogEntry[]) {
  listeners.forEach((l) => l(entries));
}

let entries: PrintLogEntry[] = load();

export function getDiagnostics(): PrintLogEntry[] {
  return entries;
}

export function subscribeDiagnostics(listener: Listener): () => void {
  listeners.add(listener);
  listener(entries);
  return () => listeners.delete(listener);
}

export function clearDiagnostics() {
  entries = [];
  persist(entries);
  notify(entries);
}

export function logPrintStart(input: Omit<PrintLogEntry, 'id' | 'timestamp' | 'status'>): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const entry: PrintLogEntry = {
    id,
    timestamp: new Date().toISOString(),
    status: 'pending',
    ...input,
  };
  entries = [entry, ...entries].slice(0, MAX_ENTRIES);
  persist(entries);
  notify(entries);

  console.log(
    `[print] → ${entry.endpoint} | type=${entry.receiptType} | mode=${entry.printMode} | items=${entry.itemsCount ?? '-'} | bytes=${entry.payloadBytes}`
  );
  return id;
}

export function logPrintFinish(
  id: string,
  status: PrintStatus,
  extra: { durationMs?: number; responsePayload?: any; errorMessage?: string } = {}
) {
  entries = entries.map((e) => (e.id === id ? { ...e, status, ...extra } : e));
  persist(entries);
  notify(entries);

  const e = entries.find((x) => x.id === id);
  if (!e) return;
  const tag = status === 'sent' ? '✅' : status === 'failed' ? '❌' : status === 'bridge_unreachable' ? '🔌' : '⏳';
  console.log(
    `[print] ${tag} ${e.endpoint} | type=${e.receiptType} | ${status} | ${extra.durationMs ?? '-'}ms${extra.errorMessage ? ` | ${extra.errorMessage}` : ''}`
  );
}
