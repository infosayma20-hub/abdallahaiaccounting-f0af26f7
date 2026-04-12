/**
 * Cross-tab synchronization using BroadcastChannel API.
 * When a voucher/invoice is saved in one tab, other tabs
 * automatically invalidate their caches and refresh data.
 */

const CHANNEL_NAME = "malaky-sync";

export type SyncEvent = {
  type: "data-changed";
  entity: string; // e.g. "receipt_voucher", "payment_voucher", "invoice", "journal_entry", "contact", "transaction"
  id?: string;
  action: "created" | "updated" | "deleted";
  timestamp: number;
};

let channel: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel(CHANNEL_NAME);
  }
  return channel;
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
}

/** Listen for changes from other tabs. Returns cleanup function. */
export function onCrossTabChange(callback: (event: SyncEvent) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const handler = (e: MessageEvent<SyncEvent>) => {
    if (e.data?.type === "data-changed") {
      callback(e.data);
    }
  };
  ch.addEventListener("message", handler);
  return () => ch.removeEventListener("message", handler);
}
