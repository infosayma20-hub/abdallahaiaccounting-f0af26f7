# Stage 3C — Manual Journal Command + Posting V1

Status: **CERTIFIED READY FOR INTERNAL PILOT** (manual journals only, allocations and cheque journals excluded).
All feature flags are OFF for all 18 tenants. Production behaviour is unchanged.

## 1. Manual vs system-generated journals

| Journal source | Path | In Stage 3C scope |
|---|---|---|
| Journal page / quick journal popup (`useSaveJournalVoucher`) | `vouchers` + `voucher_lines` + `transactions` (direct insert, or `create_journal_entry_multi_party_atomic` when `vouchers_use_rpc` is on) | YES (command wraps the same writer) |
| Invoices, POS, payroll, inventory, assets, manufacturing, receipts, payments, cheques | their own certified writers/triggers | NO — untouched |

## 2. Current live manual journal behaviour (discovery)

- Balance and validation: at least two valid lines, no line with debit *and* credit, same account + same contact on both sides is rejected, debit total must equal credit total when posting.
- Pairing: the client pairs debit lines against credit lines greedily; a same-account/different-contact transfer routes through clearing account `1199`.
- Numbering: `vouchers.ref_number` is allocated by the `trg_generate_voucher_ref` trigger under an advisory lock; journal books allocate `CODE-YYYY-####` through `allocate_journal_book_number`.
- Fiscal locks: checked client-side before saving and enforced by the ledger trigger.
- Currency: header currency + exchange rate; the certified RPC stores `foreign_amount = ROUND(amount / rate, 6)`.
- Ledger: one `transactions` row per debit/credit pair; `transaction_type = 'manual_journal'` on the RPC path.
- Idempotency: `<idempotency_key>-L<n>` per line.
- Edit: delete and recreate lines + transactions (never mutate posted rows); reversal via `create_reverse_entry`.

Known pre-existing inconsistency (reported, **not** changed in this stage): the direct-insert path writes `transaction_type` from the voucher subtype while the RPC path always writes `manual_journal`.

## 3. What Stage 3C adds (all additive)

Database:
- `posting_intent_lines_v1` — multi-line detail of a posting intent (tenant read-only RLS, service-role writes).
- `pair_journal_lines_v1(entries)` — authoritative server-side debit/credit pairing.
- `build_manual_journal_posting_intent_v1(...)` — validates balance, account existence in the tenant chart, leaf-only posting, fiscal locks, currency/rate; rejects allocations and cheque payloads. No writes.
- `post_manual_journal_v1(intent, payload)` — writes N balanced ledger rows plus one immutable intent (+ lines) in a single transaction. GL semantics are identical to the legacy writer.
- `shadow_compare_manual_journal_v1(...)` — order-insensitive comparison of legacy rows with the intent.
- `create_manual_journal_command_v1(envelope)` — the command: permission check (`accountant_perm('can_create_journal')`), server-resolved context, `business_commands` audit, idempotent replay, legacy or engine posting, optional shadow record, optional domain event.

Client (not wired to any screen yet):
- `src/lib/commands/manual-journal-command-v1.ts` + unit tests.

Flags (all default OFF): `commands.manual_journal_v1`, `posting.manual_journal_v1`, `posting.manual_journal_v1_shadow`, `events.manual_journal_v1`.

Event: `finance.manual_journal.posted.v1` via the existing outbox — no external delivery.

## 4. Certification results (internal test company only)

| Test | Result |
|---|---|
| Shadow mode, 3-line journal (legacy writer) | match, no differences |
| Posting Engine V1, same journal | posted, 2 balanced ledger rows |
| Parity legacy vs engine (accounts, amounts, type, date) | identical |
| Replay with the same idempotency key | `replayed: true`, no extra rows |
| Unbalanced journal | rejected, 0 rows |
| Parent account (`1110`) | rejected, 0 rows |
| Account outside the tenant chart | rejected, 0 rows |
| Foreign currency (USD @ 3.7) | rate 3.7, foreign amount 100.000000 — legacy formula |
| Closed fiscal period | rejected, 0 rows |
| Unauthenticated call | rejected (`42501`) |
| Branch of another tenant | rejected (`42501`) |
| Engine/intent/shadow functions callable by signed-in users | no (service-role only) |
| Command callable by `anon` | no |

Cleanup: 5 test ledger rows reversed with `create_reverse_entry` (net effect zero), test fiscal period removed, all Stage 3C flags OFF for all 18 tenants.

## 5. Exclusions and next steps

- Invoice allocations: LEGACY, uncertified.
- Cheque journals: LEGACY, out of scope.
- System-generated journals: untouched.
- No UI is wired to the command; enabling requires an explicit tenant flag.
- Rollback: set the flags to false (instant) — the legacy writer stays in place; the new objects are additive and inert when unused.

Stage 3D (Invoice V1) has **not** been started and requires explicit approval.
