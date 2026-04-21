---
name: AI Accountant Confirm All Atomicity
description: Confirm All in MultiTransactionCards must process each detected transaction atomically with try/catch, preventing one failure from breaking the loop
type: feature
---

# AI Accountant — Confirm All Atomicity

## The Bug (Pre-Fix)
`handleConfirmAll` in `MultiTransactionCards.tsx` looped over pending detected transactions and called the parent's `onConfirm`. Parent's `onConfirm` called `executeTransaction` which contained `if (error) throw error`. A single throw bubbled up, **killed the for-loop**, and left items 2..N unprocessed — UI showed only item 1 confirmed even though user clicked "تأكيد الكل".

## The Fix
1. **`MultiTransactionCards.handleConfirmAll`**: wrap each `await onConfirm(...)` in its own try/catch — exception → `{ success: false, message }` instead of rethrow. Loop continues.
2. **Parent `onConfirm` callbacks** (CleanSmartAccountant, MobileChatArea, HaseebChatPanel): wrap `executeTransaction` / `supabase.functions.invoke` in try/catch too — defense in depth.
3. **Local accumulator** (`localResults`, `confirmedTxs`) instead of reading `txList` after loop — avoids stale-state filter.
4. **Idempotency**: early return `if (bulkProcessing) return` blocks double-clicks.
5. **`handleConfirm` (single)**: same try/catch guard for consistency.

## Critical Don'ts
- ❌ Don't `throw` from `onConfirm` — always return `{ success, message }`.
- ❌ Don't read `txList.filter(...)` after a loop that mutates it via `setTxList` — closures see stale snapshot.
- ❌ Don't rely on UI status badges as accounting truth — every "confirmed" must have a real `process-transaction` POST result.

## Files
- `src/components/haseeb/MultiTransactionCards.tsx` — main loop
- `src/components/haseeb/CleanSmartAccountant.tsx` — parent onConfirm wrap
- `src/components/haseeb/MobileChatArea.tsx` — parent onConfirm wrap
- `src/components/haseeb/HaseebChatPanel.tsx` — parent onConfirm wrap
