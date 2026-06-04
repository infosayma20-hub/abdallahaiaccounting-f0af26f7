/**
 * Shared helpers for the call-center "edit lock" + branch-acceptance late
 * alert. Used by both:
 *   - the call-center "سجل الفواتير المحوّلة" (DispatchedOrdersLog)
 *   - the cashier "بانتظار قبول الفرع" panel (PendingOrdersPanel)
 *
 * Two completely independent concerns:
 *
 * 1. Branch-acceptance delay
 *    A pending order is "late" once it has been sitting unaccepted for
 *    more than 5 minutes. The fact that someone is editing it does NOT
 *    pause this timer — branch acceptance and call-center editing are
 *    parallel workflows.
 *
 * 2. Edit lock lease
 *    The "is_editing" boolean is only meaningful as long as the editor's
 *    heartbeat is fresh. The DB-side `start_editing_call_center_order`
 *    RPC treats a lock with no heartbeat for more than 3 minutes as
 *    stale and lets another user take it over. The UI must use the same
 *    rule, otherwise orders show "قيد التعديل" forever and stay hidden
 *    from the branch even though the lock has expired.
 */

export const LOCK_LEASE_MS = 3 * 60 * 1000;
export const LATE_THRESHOLD_MS = 5 * 60 * 1000;

interface OrderLike {
  status?: string | null;
  created_at?: string | null;
  cancelled_at?: string | null;
  is_editing?: boolean | null;
  editing_started_at?: string | null;
  editing_heartbeat_at?: string | null;
  editing_locked_by?: string | null;
  editing_by?: string | null;
}

function lastAliveMs(order: OrderLike): number {
  const s = order.editing_heartbeat_at || order.editing_started_at;
  if (!s) return 0;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * True when the order is currently being edited AND the lease is still
 * fresh (heartbeat within `LOCK_LEASE_MS`). This is the only signal that
 * should hide the order from the branch / disable the edit button for
 * other users.
 */
export function isEditLockActive(order: OrderLike, now: number = Date.now()): boolean {
  if (!order.is_editing) return false;
  const alive = lastAliveMs(order);
  if (alive === 0) {
    // The DB row says `is_editing` but we have no heartbeat at all —
    // be conservative: treat as expired so the branch can still see it
    // and another user can take over.
    return false;
  }
  return now - alive <= LOCK_LEASE_MS;
}

/**
 * True when an `is_editing` row's lease has expired. UI should show a
 * "القفل منتهي" badge and offer a "استلام التعديل" takeover button.
 */
export function isEditLockExpired(order: OrderLike, now: number = Date.now()): boolean {
  if (!order.is_editing) return false;
  const alive = lastAliveMs(order);
  if (alive === 0) return true;
  return now - alive > LOCK_LEASE_MS;
}

/**
 * True when the order is still waiting on the branch to accept and has
 * been waiting for more than `LATE_THRESHOLD_MS`. Independent from the
 * edit lock — a late order stays late even if someone is editing it.
 */
export function isBranchAcceptanceDelayed(order: OrderLike, now: number = Date.now()): boolean {
  if (order.status !== "pending") return false;
  if (order.cancelled_at) return false;
  if (!order.created_at) return false;
  const created = new Date(order.created_at).getTime();
  if (!Number.isFinite(created)) return false;
  return now - created >= LATE_THRESHOLD_MS;
}

export function editLockAgeMs(order: OrderLike, now: number = Date.now()): number {
  const alive = lastAliveMs(order);
  if (alive === 0) return 0;
  return Math.max(0, now - alive);
}