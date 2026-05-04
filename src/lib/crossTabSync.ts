/**
 * Cross-tab synchronization using BroadcastChannel API.
 * When a voucher/invoice is saved in one tab, other tabs
 * automatically invalidate their caches and refresh data.
 *
 * Phase A — Generalization Hard Stop:
 * The channel was renamed from "malaky-sync" to "pos-sync".
 * For backward compatibility we WRITE on the new channel and
 * LISTEN on both, so tabs that are still on the old build keep
 * receiving events until they refresh.
 */

const CHANNEL_NAME = "pos-sync";
const LEGACY_CHANNEL_NAME = "malaky-sync";

export type SyncEvent = {
  type: "data-changed";
  entity: string; // e.g. "receipt_voucher", "payment_voucher", "invoice", "journal_entry", "contact", "transaction"
  id?: string;
  action: "created" | "updated" | "deleted";
  timestamp: number;
};

let channel: BroadcastChannel | null = null;
let legacyChannel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
}

function getLegacyChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!legacyChannel) {
    legacyChannel = new BroadcastChannel(LEGACY_CHANNEL_NAME);
  }
  return legacyChannel;
}

/** Broadcast that data changed (call after save/update/delete) */
export function broadcastChange(entity: string, action: SyncEvent["action"], id?: string) {
  const ch = getChannel();
  if (!ch) return;
  const event: SyncEvent = {
    type: "data-changed",
    entity,
    id,
    action,
    timestamp: Date.now(),
  };
  ch.postMessage(event);
  // Mirror to legacy channel so older tabs still receive the event.
  try { getLegacyChannel()?.postMessage(event); } catch { /* ignore */ }
}

/** Listen for changes from other tabs. Returns cleanup function. */
export function onCrossTabChange(callback: (event: SyncEvent) => void): () => void {
  const ch = getChannel();
  const legacy = getLegacyChannel();
  if (!ch && !legacy) return () => {};
  const handler = (e: MessageEvent<SyncEvent>) => {
    if (e.data?.type === "data-changed") {
      callback(e.data);
    }
  };
  ch?.addEventListener("message", handler);
  legacy?.addEventListener("message", handler);
  return () => {
    ch?.removeEventListener("message", handler);
    legacy?.removeEventListener("message", handler);
  };
}
