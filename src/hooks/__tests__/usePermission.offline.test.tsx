import "fake-indexeddb/auto";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearPermissionSnapshot,
  savePermissionSnapshot,
} from "@/lib/offline-permissions";

const USER = "user-offline-1";

/** Every backend read fails — this is the "no internet" case. */
const netError = { message: "TypeError: Failed to fetch" };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: null, error: netError }),
        then: (res: any) => res({ data: null, error: netError }),
      }),
    }),
    rpc: () => Promise.resolve({ data: null, error: netError }),
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: () => {},
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: USER }, loading: false }),
}));

import { usePermission, clearPermissionCache } from "@/hooks/usePermission";

describe("usePermission — offline behaviour", () => {
  beforeEach(async () => {
    await clearPermissionSnapshot();
  });

  it("denies everything when offline with no snapshot (fail closed)", async () => {
    const { result } = renderHook(() => usePermission("finance"));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.can("receipts", "create")).toBe(false);
    expect(result.current.isAppAllowed).toBe(false);
    expect(result.current.isSuperAdmin).toBe(false);
  });

  it("replays the snapshot offline without widening access", async () => {
    await savePermissionSnapshot({
      user_id: USER,
      saved_at: new Date().toISOString(),
      roles: ["accountant_sales"],
      role_defaults: [
        ["accountant_sales|finance|receipts|create", true],
        ["accountant_sales|finance|journal|create", false],
      ],
      overrides: [],
      app_allow: [],
      app_deny: ["hr"],
    });

    const { result } = renderHook(() => usePermission("finance"));
    await waitFor(() => expect(result.current.isOfflineSnapshot).toBe(true));
    expect(result.current.can("receipts", "create")).toBe(true);
    // Not granted by the server → still denied offline
    expect(result.current.can("journal", "create")).toBe(false);
    expect(result.current.can("payments", "delete")).toBe(false);
    expect(result.current.isSuperAdmin).toBe(false);
  });

  it("keeps an app-level deny in force while offline", async () => {
    await savePermissionSnapshot({
      user_id: USER,
      saved_at: new Date().toISOString(),
      roles: ["accountant_sales"],
      role_defaults: [["accountant_sales|hr|employees|read", true]],
      overrides: [],
      app_allow: [],
      app_deny: ["hr"],
    });
    const { result } = renderHook(() => usePermission("hr"));
    await waitFor(() => expect(result.current.isOfflineSnapshot).toBe(true));
    expect(result.current.isAppAllowed).toBe(false);
    expect(result.current.can("employees", "read")).toBe(false);
  });

  it("honours a feature-level deny override while offline", async () => {
    clearPermissionCache();
    await savePermissionSnapshot({
      user_id: USER,
      saved_at: new Date().toISOString(),
      roles: ["accountant_sales"],
      role_defaults: [["accountant_sales|finance|payments|create", true]],
      overrides: [["finance.payments.create", "deny"]],
      app_allow: [],
      app_deny: [],
    });
    const { result } = renderHook(() => usePermission("finance"));
    await waitFor(() => expect(result.current.isOfflineSnapshot).toBe(true));
    expect(result.current.can("payments", "create")).toBe(false);
  });
});
