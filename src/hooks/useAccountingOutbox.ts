import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import {
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
  type OutboxEntry,
} from "@/lib/accounting-outbox-db";

/**
 * Queue + replay for accounting documents captured while offline.
 *
 * Every document is posted through a single atomic server function that takes
 * `p_idempotency_key`, so replaying the same entry can never double-post.
 * Errors that will never resolve by retrying (closed fiscal period, posting to
 * a parent account, permission) quarantine the entry for manual review.
 */

const PERMANENT_ERROR_PATTERNS = [
  "الفترة المالية",
  "fiscal period",
  "حساب رئيسي",
  "parent account",
  "not allowed",
  "permission denied",
  "invalid params",
  "violates row-level security",
];

function isPermanentError(msg: string): boolean {
  const lower = (msg || "").toLowerCase();
  return PERMANENT_ERROR_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

export interface QueueDocumentInput {
  docType: OutboxDocType;
  rpc: string;
  payload: Record<string, unknown>;
  summary: OutboxEntry["summary"];
  userId: string;
}

export function useAccountingOutbox() {
  const { isOnline } = useNetworkStatus();
  const [entries, setEntries] = useState<OutboxEntry[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [quarantinedCount, setQuarantinedCount] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refresh = useCallback(async () => {
    const [items, counts] = await Promise.all([listOutbox(), countByStatus()]);
    setEntries(items);
    setPendingCount(counts.pending);
    setQuarantinedCount(counts.quarantined);
  }, []);

  useEffect(() => {
    void refresh();
    void pruneSynced();
  }, [refresh]);

  const queueDocument = useCallback(
    async (input: QueueDocumentInput) => {
      const local_id = makeLocalId(input.docType.toUpperCase());
      const entry = await enqueueDocument({
        local_id,
        doc_type: input.docType,
        rpc: input.rpc,
        payload: input.payload,
        summary: input.summary,
        user_id: input.userId,
      });
      await refresh();
      return entry;
    },
    [refresh],
  );

  const syncOne = useCallback(async (entry: OutboxEntry): Promise<boolean> => {
    try {
      const { data, error } = await supabase.rpc(entry.rpc as any, {
        ...entry.payload,
        p_idempotency_key: entry.local_id,
      } as any);

      if (error) {
        const permanent = isPermanentError(error.message);
        await markFailed(entry.id, error.message, { quarantine: permanent });
        return false;
      }

      const result = data as any;
      if (result && result.success === false) {
        const msg = String(result.error || "فشل غير معروف");
        await markFailed(entry.id, msg, { quarantine: isPermanentError(msg) });
        return false;
      }

      await markSynced(entry.id, result?.transaction_id || result?.invoice_id);
      return true;
    } catch (e: any) {
      const msg = e?.message || String(e);
      await markFailed(entry.id, msg, { quarantine: isPermanentError(msg) });
      return false;
    }
  }, []);

  const syncNow = useCallback(async () => {
    if (syncingRef.current) return;
    const items = await listOutbox();
    const queue = items.filter((i) => i.sync_status === "pending" || i.sync_status === "failed");
    if (queue.length === 0) {
      await refresh();
      return;
    }

    syncingRef.current = true;
    setIsSyncing(true);
    let ok = 0;
    let fail = 0;
    for (const entry of queue) {
      // Sequential on purpose: accounting posts must not race each other.
      // eslint-disable-next-line no-await-in-loop
      const success = await syncOne(entry);
      if (success) ok += 1;
      else fail += 1;
    }
    syncingRef.current = false;
    setIsSyncing(false);
    await refresh();

    if (ok > 0) toast.success(`تم ترحيل ${ok} مستند بعد عودة الاتصال`);
    if (fail > 0) toast.error(`${fail} مستند لم يُرحَّل — راجع «مستندات بانتظار الترحيل»`);
  }, [refresh, syncOne]);

  // Auto-sync when the connection is confirmed back.
  useEffect(() => {
    if (!isOnline) return;
    void syncNow();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  const requeue = useCallback(
    async (id: string) => {
      await requeueDocument(id);
      await refresh();
      void syncNow();
    },
    [refresh, syncNow],
  );

  const discard = useCallback(
    async (id: string) => {
      await removeDocument(id);
      await refresh();
    },
    [refresh],
  );

  return {
    entries,
    pendingCount,
    quarantinedCount,
    isSyncing,
    isOnline,
    queueDocument,
    syncNow,
    requeue,
    discard,
    refresh,
  };
}

export default useAccountingOutbox;
