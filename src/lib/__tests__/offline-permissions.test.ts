import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  MAX_SNAPSHOT_AGE_MS,
  clearPermissionSnapshot,
  loadPermissionSnapshot,
  savePermissionSnapshot,
  type PermissionSnapshot,
} from "@/lib/offline-permissions";

const USER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

function snap(over: Partial<PermissionSnapshot> = {}): PermissionSnapshot {
  return {
    user_id: USER,
    saved_at: new Date().toISOString(),
    roles: ["accountant_sales"],
    role_defaults: [["accountant_sales|sales|invoices|create", true]],
    overrides: [["finance.journal.create", "deny"]],
    app_allow: [],
    app_deny: ["hr"],
    ...over,
  };
}

describe("offline permission snapshot", () => {
  beforeEach(async () => {
    await clearPermissionSnapshot();
  });

  it("replays the last successful server answer for the same user", async () => {
    await savePermissionSnapshot(snap());
    const loaded = await loadPermissionSnapshot(USER);
    expect(loaded?.roles).toEqual(["accountant_sales"]);
    expect(loaded?.app_deny).toContain("hr");
    expect(loaded?.overrides).toEqual([["finance.journal.create", "deny"]]);
  });

  it("never leaks a snapshot to a different signed-in user", async () => {
    await savePermissionSnapshot(snap());
    expect(await loadPermissionSnapshot(OTHER)).toBeNull();
  });

  it("expires after the max age so stale access cannot persist", async () => {
    await savePermissionSnapshot(
      snap({ saved_at: new Date(Date.now() - MAX_SNAPSHOT_AGE_MS - 1000).toISOString() }),
    );
    expect(await loadPermissionSnapshot(USER)).toBeNull();
  });

  it("keeps a snapshot that is still inside the freshness window", async () => {
    await savePermissionSnapshot(
      snap({ saved_at: new Date(Date.now() - MAX_SNAPSHOT_AGE_MS + 60_000).toISOString() }),
    );
    expect(await loadPermissionSnapshot(USER)).not.toBeNull();
  });

  it("is wiped on sign-out", async () => {
    await savePermissionSnapshot(snap());
    await clearPermissionSnapshot();
    expect(await loadPermissionSnapshot(USER)).toBeNull();
  });

  it("ignores an empty user id", async () => {
    await savePermissionSnapshot(snap());
    expect(await loadPermissionSnapshot("")).toBeNull();
  });

  it("stores permissions encrypted at rest (no plaintext roles in IndexedDB)", async () => {
    await savePermissionSnapshot(snap());
    const raw = await new Promise<any>((resolve, reject) => {
      const req = indexedDB.open("amwali_perm_cache");
      req.onsuccess = () => {
        const db = req.result;
        const g = db.transaction("snapshot", "readonly").objectStore("snapshot").get("current");
        g.onsuccess = () => resolve(g.result);
        g.onerror = () => reject(g.error);
      };
      req.onerror = () => reject(req.error);
    });
    const serialized = JSON.stringify(raw);
    expect(serialized).not.toContain("accountant_sales");
    expect(serialized).not.toContain("invoices");
    expect(raw?._enc).toBeTruthy();
  });
});
