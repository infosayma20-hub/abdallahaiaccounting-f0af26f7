import "fake-indexeddb/auto";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listOutbox, removeDocument } from "@/lib/accounting-outbox-db";

const rpcMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: any[]) => rpcMock(...args) },
}));

vi.mock("@/hooks/useNetworkStatus", () => ({
  useNetworkStatus: () => ({ isOnline: false }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import useAccountingOutbox from "@/hooks/useAccountingOutbox";

async function clearAll() {
  const items = await listOutbox();
  await Promise.all(items.map((i) => removeDocument(i.id)));
}

const receipt = {
  docType: "receipt_voucher" as const,
  rpc: "create_receipt_voucher_offline",
  payload: { p_user_id: "owner-1", p_payload: { amount: 300, contact_id: "c1" } },
  summary: { title: "سند قبض — زبون", amount: 300, currency: "شيكل" },
  userId: "owner-1",
};

describe("useAccountingOutbox — replay contract", () => {
  beforeEach(async () => {
    rpcMock.mockReset();
    await clearAll();
  });

  it("posts the queued document with its local_id as the server idempotency key", async () => {
    rpcMock.mockResolvedValue({ data: { success: true, id: "rv-1" }, error: null });
    const { result } = renderHook(() => useAccountingOutbox());

    let localId = "";
    await act(async () => {
      const e = await result.current.queueDocument(receipt);
      localId = e.local_id;
    });
    await act(async () => {
      await result.current.syncNow();
    });

    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [rpcName, args] = rpcMock.mock.calls[0];
    expect(rpcName).toBe("create_receipt_voucher_offline");
    expect(args.p_idempotency_key).toBe(localId);
    expect(args.p_user_id).toBe("owner-1");
    expect(args.p_payload.amount).toBe(300);

    const [row] = await listOutbox();
    expect(row.sync_status).toBe("synced");
  });

  it("never posts a synced document again on a second sync pass", async () => {
    rpcMock.mockResolvedValue({ data: { success: true, id: "rv-1" }, error: null });
    const { result } = renderHook(() => useAccountingOutbox());
    await act(async () => {
      await result.current.queueDocument(receipt);
    });
    await act(async () => {
      await result.current.syncNow();
    });
    await act(async () => {
      await result.current.syncNow();
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("treats a server 'duplicate' answer as success (no double posting)", async () => {
    rpcMock.mockResolvedValue({
      data: { success: true, duplicate: true, id: "rv-existing" },
      error: null,
    });
    const { result } = renderHook(() => useAccountingOutbox());
    await act(async () => {
      await result.current.queueDocument(receipt);
    });
    await act(async () => {
      await result.current.syncNow();
    });
    const [row] = await listOutbox();
    expect(row.sync_status).toBe("synced");
  });

  it("retries a transient failure and keeps the document safe", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { message: "network timeout" } });
    const { result } = renderHook(() => useAccountingOutbox());
    await act(async () => {
      await result.current.queueDocument(receipt);
    });
    await act(async () => {
      await result.current.syncNow();
    });
    let [row] = await listOutbox();
    expect(row.sync_status).toBe("failed");
    expect(row.retry_count).toBe(1);

    rpcMock.mockResolvedValue({ data: { success: true, id: "rv-2" }, error: null });
    await act(async () => {
      await result.current.syncNow();
    });
    [row] = await listOutbox();
    expect(row.sync_status).toBe("synced");
  });

  it("quarantines permanent accounting rejections instead of looping", async () => {
    rpcMock.mockResolvedValue({
      data: { success: false, error: "الفترة المالية مقفلة لهذا التاريخ" },
      error: null,
    });
    const { result } = renderHook(() => useAccountingOutbox());
    await act(async () => {
      await result.current.queueDocument(receipt);
    });
    await act(async () => {
      await result.current.syncNow();
    });
    const [row] = await listOutbox();
    expect(row.sync_status).toBe("quarantined");
    expect(row.error).toContain("الفترة المالية");

    rpcMock.mockClear();
    await act(async () => {
      await result.current.syncNow();
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("quarantines RLS / permission rejections", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "permission denied for table" } });
    const { result } = renderHook(() => useAccountingOutbox());
    await act(async () => {
      await result.current.queueDocument(receipt);
    });
    await act(async () => {
      await result.current.syncNow();
    });
    const [row] = await listOutbox();
    expect(row.sync_status).toBe("quarantined");
  });

  it("posts a mixed finance queue sequentially and in creation order", async () => {
    const order: string[] = [];
    rpcMock.mockImplementation(async (name: string) => {
      order.push(name);
      return { data: { success: true }, error: null };
    });
    const { result } = renderHook(() => useAccountingOutbox());
    await act(async () => {
      await result.current.queueDocument(receipt);
      await new Promise((r) => setTimeout(r, 3));
      await result.current.queueDocument({
        docType: "payment_voucher",
        rpc: "create_payment_voucher_offline",
        payload: { p_user_id: "owner-1", p_payload: { amount: 80 } },
        summary: { title: "سند صرف" },
        userId: "owner-1",
      });
      await new Promise((r) => setTimeout(r, 3));
      await result.current.queueDocument({
        docType: "cash_transfer",
        rpc: "create_cash_transfer_offline",
        payload: { p_user_id: "owner-1", p_payload: { amount: 500 } },
        summary: { title: "تحويل نقدي" },
        userId: "owner-1",
      });
      await new Promise((r) => setTimeout(r, 3));
      await result.current.queueDocument({
        docType: "cheque",
        rpc: "create_cheque_offline",
        payload: { p_user_id: "owner-1", p_payload: { amount: 1200 } },
        summary: { title: "شيك وارد" },
        userId: "owner-1",
      });
    });
    await act(async () => {
      await result.current.syncNow();
    });

    expect(order).toEqual([
      "create_receipt_voucher_offline",
      "create_payment_voucher_offline",
      "create_cash_transfer_offline",
      "create_cheque_offline",
    ]);
    const items = await listOutbox();
    expect(items.every((i) => i.sync_status === "synced")).toBe(true);
  });

  it("exposes pending and quarantined counters for the status bar", async () => {
    rpcMock.mockResolvedValue({ data: { success: false, error: "not allowed" }, error: null });
    const { result } = renderHook(() => useAccountingOutbox());
    await act(async () => {
      await result.current.queueDocument(receipt);
    });
    await waitFor(() => expect(result.current.pendingCount).toBe(1));
    await act(async () => {
      await result.current.syncNow();
    });
    await waitFor(() => expect(result.current.quarantinedCount).toBe(1));
    expect(result.current.pendingCount).toBe(0);
  });

  it("discard removes a quarantined document from the device", async () => {
    rpcMock.mockResolvedValue({ data: { success: false, error: "permission denied" }, error: null });
    const { result } = renderHook(() => useAccountingOutbox());
    let id = "";
    await act(async () => {
      const e = await result.current.queueDocument(receipt);
      id = e.id;
    });
    await act(async () => {
      await result.current.syncNow();
    });
    await act(async () => {
      await result.current.discard(id);
    });
    expect(await listOutbox()).toHaveLength(0);
  });
});
