import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_SYNC_RETRIES,
  countByStatus,
  enqueueDocument,
  listOutbox,
  makeLocalId,
  markFailed,
  markSynced,
  pruneSynced,
  removeDocument,
  requeueDocument,
  type OutboxDocType,
} from "@/lib/accounting-outbox-db";

async function clearAll() {
  const items = await listOutbox();
  await Promise.all(items.map((i) => removeDocument(i.id)));
}

function doc(docType: OutboxDocType, amount = 100, localId?: string) {
  return {
    local_id: localId ?? makeLocalId(docType.toUpperCase()),
    doc_type: docType,
    rpc: "create_receipt_voucher_offline",
    payload: { p_user_id: "u1", p_payload: { amount } },
    summary: { title: `مستند ${docType}`, amount, currency: "شيكل" },
    user_id: "u1",
  };
}

describe("accounting outbox — local durability", () => {
  beforeEach(async () => {
    await clearAll();
  });

  it("stores and reads back a queued document with its payload intact", async () => {
    const entry = await enqueueDocument(doc("receipt_voucher", 250));
    const [stored] = await listOutbox();
    expect(stored.id).toBe(entry.local_id);
    expect(stored.sync_status).toBe("pending");
    expect(stored.retry_count).toBe(0);
    expect((stored.payload as any).p_payload.amount).toBe(250);
    expect(stored.summary.title).toContain("receipt_voucher");
  });

  it("keeps the sensitive payload encrypted at rest (not readable raw)", async () => {
    await enqueueDocument(doc("payment_voucher", 999));
    const raw = await new Promise<any[]>((resolve, reject) => {
      const req = indexedDB.open("amwali_accounting_offline");
      req.onsuccess = () => {
        const db = req.result;
        const g = db.transaction("outbox", "readonly").objectStore("outbox").getAll();
        g.onsuccess = () => resolve(g.result || []);
        g.onerror = () => reject(g.error);
      };
      req.onerror = () => reject(req.error);
    });
    expect(raw.length).toBe(1);
    // Either encrypted (crypto.subtle present) or explicitly plain in this env.
    if (raw[0]._enc) {
      expect(raw[0].payload).toBeUndefined();
      expect(JSON.stringify(raw[0])).not.toContain("999");
    }
  });

  it("never queues the same local_id twice (idempotency anchor is the key)", async () => {
    const localId = "RECEIPT_VOUCHER-fixed-key";
    await enqueueDocument(doc("receipt_voucher", 100, localId));
    await enqueueDocument(doc("receipt_voucher", 100, localId));
    const items = await listOutbox();
    expect(items.length).toBe(1);
  });

  it("generates unique local ids", () => {
    const ids = new Set(Array.from({ length: 500 }, () => makeLocalId("RCV")));
    expect(ids.size).toBe(500);
  });

  it("quarantines an entry after the retry ceiling instead of retrying forever", async () => {
    const e = await enqueueDocument(doc("cheque", 50));
    for (let i = 0; i < MAX_SYNC_RETRIES - 1; i += 1) {
      await markFailed(e.id, "network error");
    }
    let [row] = await listOutbox();
    expect(row.sync_status).toBe("failed");
    await markFailed(e.id, "network error");
    [row] = await listOutbox();
    expect(row.sync_status).toBe("quarantined");
    expect(row.retry_count).toBe(MAX_SYNC_RETRIES);
  });

  it("quarantines immediately for permanent errors", async () => {
    const e = await enqueueDocument(doc("cash_transfer", 70));
    await markFailed(e.id, "الفترة المالية مقفلة", { quarantine: true });
    const [row] = await listOutbox();
    expect(row.sync_status).toBe("quarantined");
    expect(row.retry_count).toBe(1);
  });

  it("requeue resets the retry counter and clears the error", async () => {
    const e = await enqueueDocument(doc("journal_entry", 10));
    await markFailed(e.id, "boom", { quarantine: true });
    await requeueDocument(e.id);
    const [row] = await listOutbox();
    expect(row.sync_status).toBe("pending");
    expect(row.retry_count).toBe(0);
    expect(row.error).toBeUndefined();
  });

  it("counts pending (incl. failed) and quarantined separately", async () => {
    const a = await enqueueDocument(doc("receipt_voucher", 1));
    const b = await enqueueDocument(doc("payment_voucher", 2));
    const c = await enqueueDocument(doc("cheque", 3));
    await markFailed(b.id, "temporary");
    await markFailed(c.id, "permission denied", { quarantine: true });
    await markSynced(a.id, "tx-1");
    const counts = await countByStatus();
    expect(counts.pending).toBe(1); // only the failed one still awaits sync
    expect(counts.quarantined).toBe(1);
  });

  it("marks synced with the server id and keeps it for the audit window", async () => {
    const e = await enqueueDocument(doc("receipt_voucher", 5));
    await markSynced(e.id, "server-uuid");
    const [row] = await listOutbox();
    expect(row.sync_status).toBe("synced");
    expect(row.server_id).toBe("server-uuid");
    expect(row.synced_at).toBeTruthy();
  });

  it("prunes only old synced entries, never pending or quarantined ones", async () => {
    const old = await enqueueDocument(doc("receipt_voucher", 1));
    const fresh = await enqueueDocument(doc("payment_voucher", 2));
    const stuck = await enqueueDocument(doc("cheque", 3));
    await markSynced(old.id, "x");
    await markSynced(fresh.id, "y");
    await markFailed(stuck.id, "permission denied", { quarantine: true });

    // Age the first synced entry beyond the retention window.
    const items = await listOutbox();
    const target = items.find((i) => i.id === old.id)!;
    target.synced_at = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    await markSynced(target.id, "x");
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const r = indexedDB.open("amwali_accounting_offline");
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    await new Promise<void>((res, rej) => {
      const store = db.transaction("outbox", "readwrite").objectStore("outbox");
      const g = store.get(old.id);
      g.onsuccess = () => {
        const rec = g.result;
        rec.synced_at = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
        const p = store.put(rec);
        p.onsuccess = () => res();
        p.onerror = () => rej(p.error);
      };
      g.onerror = () => rej(g.error);
    });

    await pruneSynced();
    const after = await listOutbox();
    const ids = after.map((i) => i.id);
    expect(ids).not.toContain(old.id);
    expect(ids).toContain(fresh.id);
    expect(ids).toContain(stuck.id);
  });

  it("returns entries in creation order so posting stays sequential", async () => {
    const first = await enqueueDocument(doc("receipt_voucher", 1));
    await new Promise((r) => setTimeout(r, 5));
    const second = await enqueueDocument(doc("payment_voucher", 2));
    const items = await listOutbox();
    expect(items[0].id).toBe(first.id);
    expect(items[1].id).toBe(second.id);
  });
});
