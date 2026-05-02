---
name: Cheque–Voucher Atomic Save
description: Voucher cheque path uses insertChequesForVoucher with .select() count verification. Endorsement trigger blocks invalid status transitions.
type: feature
---
**Voucher → Cheque saving is hardened (post-douliakitchens incident):**

- All voucher cheque inserts (RV + PV) go through `insertChequesForVoucher()` in `src/lib/voucher-cheques-sync.ts`. Direct `supabase.from("cheques").insert(...)` is forbidden in `VoucherFormPage.tsx`.
- Helper validates per-row (number, bank, date, amount, currency) via `validateChequeRows()`, then inserts with `.select('id')` and asserts `dbCount === formCount`. Any mismatch throws → outer try/catch surfaces error and stops the save.
- DB trigger `validate_cheque_endorsement` enforces:
  - On UPDATE → `مظهر`: source status must be one of `مسجل`، `آجل`، `مستحق`. Blocks endorsing collected/cancelled/returned/cashed cheques.
  - On INSERT: status must be `مسجل` or `آجل` only.
  - Endorsement requires `endorsed_to_contact_id` or `endorsed_to_name`.
- CHECK constraint `cheques_cheque_date_sane` rejects dates outside 2000–2100.
- Other cheque insert sites (ChequesPage, InvoicesPage, Dashboard, SmartAccountant×2, WorkshopsPage) remain on direct insert — not part of voucher flow but should migrate to the helper if they ever cause similar incidents.

**Why:** Prevents "voucher saved with zero cheques" (REC-2026-0007 incident) and "1 cheque instead of 6" silent partial inserts.
