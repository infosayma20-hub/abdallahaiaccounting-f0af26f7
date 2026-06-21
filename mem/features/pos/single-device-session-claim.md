---
name: POS Single-Device Session Claim
description: prevents two devices using the same open pos_session; atomic increment fixes Lost Updates on total_sales/total_orders
type: feature
---

# POS Single-Device Session Claim (Phase 1 + 2)

Goal: it must be impossible for two devices logged into the same `pos_users`
account to mutate the same open `pos_sessions` row at the same time.

## DB layer
- `pos_sessions` adds: `active_device_id uuid`, `active_device_fingerprint text`,
  `last_heartbeat_at timestamptz`, `device_claim_count int`.
- `claim_pos_session(session_id, device_id, fingerprint, force=false)` —
  `FOR UPDATE` row lock; rejects if another fingerprint heart-beated in the
  last 60s unless `force=true`. Force-claims audit to `pos_sensitive_actions_log`.
- `heartbeat_pos_session(session_id, fingerprint)` — returns
  `{revoked:true, reason:'device_replaced'|'session_closed'|'session_not_found'}`
  the instant a different fingerprint owns the row.
- `increment_pos_session_totals(session_id, sales_delta, orders_delta)` —
  atomic UPDATE. **Replaces every read-modify-write on `total_sales`/`total_orders`
  in client code** to kill Lost Updates.
- `reconcile_pos_session_totals(session_id)` — repair RPC that recomputes
  totals from `pos_orders` (use for historical sessions and Super Admin
  "fix variance" button).

## Frontend
- `src/lib/pos-session-claim.ts` — wraps the three RPCs + `getOrCreateDeviceId()`
  (UUID persisted in localStorage) + cached SHA-256 fingerprint from
  `getDeviceFingerprint()`.
- `src/hooks/usePOSSessionClaim.ts` — soft-claims on session mount, heart-beats
  every 15s, tolerates 3 transient failures before treating it as a real
  problem. Exposes `state: idle|claiming|owned|conflict|revoked` plus
  `forceClaim()` / `retryClaim()`.
- `src/components/pos/SessionTakeoverDialog.tsx` — shown on `conflict`:
  "نقل العهدة لهذا الجهاز" (force) or "عودة" (back to /employee or /apps).
- `POSPage.tsx`:
  - Wires the hook and rolls `revoked` into the existing
    `ShiftClosedElsewhereDialog` flow (cart auto-saved via `saveBlockedCart`).
  - `enforceDeviceGuard` blocks every sensitive action when status is
    `conflict` or `revoked`.
  - Order completion now calls `incrementSessionTotals(...)` instead of
    `UPDATE pos_sessions SET total_sales=...` — single Lost-Update site
    rewritten; full recalc inside Close-Shift still recomputes from orders.

## Out of scope (next phases)
- `pos_user_device_access` DB trigger enforcement (Phase 1.4).
- `cash_boxes` device lock + `current_session_id` (Phase 1.5).
- `sync_offline_pos_sale` guard against syncing into a closed session (Phase 2.5).
- Super Admin "conflicting sessions" report (Phase 3).