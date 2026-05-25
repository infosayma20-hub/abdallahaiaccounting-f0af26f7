/**
 * pos-blocked-cart-draft — persist the in-memory POS cart when the current
 * shift is forcibly blocked (closed from another device).
 *
 * The cashier didn't lose work: when they open a new shift on the same
 * browser we offer to restore the carts they had on screen.
 *
 * Stored as JSON under a per-(company,cashier) key. Auto-expires after 12h
 * so stale drafts don't haunt later shifts.
 */

const PREFIX = "pos_blocked_cart_v1";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

function keyFor(companyId: string, cashierUserId: string) {
  return `${PREFIX}:${companyId}:${cashierUserId}`;
}

export interface BlockedCartDraft {
  savedAt: number;
  closedSessionId: string | null;
  orders: unknown[];
}

/** Returns true when there is at least one order with items worth saving. */
function hasContent(orders: unknown[]): boolean {
  if (!Array.isArray(orders)) return false;
  return orders.some((o: any) => Array.isArray(o?.cart) && o.cart.length > 0);
}

export function saveBlockedCart(
  companyId: string | null | undefined,
  cashierUserId: string | null | undefined,
  closedSessionId: string | null,
  orders: unknown[],
) {
  if (!companyId || !cashierUserId) return;
  if (!hasContent(orders)) return;
  try {
    const payload: BlockedCartDraft = {
      savedAt: Date.now(),
      closedSessionId,
      orders,
    };
    localStorage.setItem(keyFor(companyId, cashierUserId), JSON.stringify(payload));
  } catch {
    /* quota / private mode — ignore */
  }
}

export function loadBlockedCart(
  companyId: string | null | undefined,
  cashierUserId: string | null | undefined,
): BlockedCartDraft | null {
  if (!companyId || !cashierUserId) return null;
  try {
    const raw = localStorage.getItem(keyFor(companyId, cashierUserId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BlockedCartDraft;
    if (!parsed?.savedAt || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(keyFor(companyId, cashierUserId));
      return null;
    }
    if (!hasContent(parsed.orders)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearBlockedCart(
  companyId: string | null | undefined,
  cashierUserId: string | null | undefined,
) {
  if (!companyId || !cashierUserId) return;
  try {
    localStorage.removeItem(keyFor(companyId, cashierUserId));
  } catch {
    /* ignore */
  }
}