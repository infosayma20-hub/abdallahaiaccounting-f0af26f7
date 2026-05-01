---
name: Phase 5J.1 UX Completion & Traceability
description: Focus highlight system, Allocations panel, and unified document top bar across invoices/vouchers/journal
type: feature
---
**Phase 5J.1 + 5J.2 (basics)** — UX rails on top of the financial engine. No financial logic touched.

### Components
- `src/hooks/useFocusHighlight.ts` — reads `?focus=<id>`, scrolls the matching `[data-focus-id]` row into view, applies `ring-2 ring-primary/60 bg-primary/10` for ~2.5s then fades.
- `src/components/accounting/AllocationsPanel.tsx` — read-only panel for one contact:
  - Unallocated payments: receipt_vouchers + vouchers(type=payment) where `amount - allocated_amount > 0`.
  - Recent allocations: payment_invoice_links joined to invoices for the contact, with cross-links to the invoice (`?focus`) and the source voucher (`/finance/{receipt|payment}/:id/edit`).
  - `compact` prop for Customer360 (top 5 each).
- `src/components/VoucherNavToolbar.tsx` — already the single DocumentTopBar, supports `voucherType: receipt|payment|journal|invoice`. Now also exposes optional `onPreview` (eye icon) alongside `onPrint`. Wired in InvoiceCreatePage, VoucherFormPage, JournalNewPage.

### Wiring
- `ContactDetailPage` — new "التخصيصات" tab renders `AllocationsPanel`.
- `InvoicesPage` table rows carry `data-focus-id={inv.id}` and highlight when `?focus=` matches.
- `FinanceJournalPage` rows carry `data-focus-id={v.id}` and highlight similarly.

### Rules
- No RPC, no chart, no POS, no inventory, no cheques logic touched.
- `useFocusHighlight` is purely cosmetic — it never refetches or mutates.
- AllocationsPanel reads only; respects existing RLS.
