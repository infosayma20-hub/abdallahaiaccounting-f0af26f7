---
name: Invoice print items integrity
description: Printed invoices must never render from unloaded line items; hydrate errors must block printing
type: feature
---
Root cause found 2026-09-13 (INV-2026-1388, 1050 ILS printed as 0.00):
`hydrateInvoiceItems` in `src/pages/InvoicesPage.tsx` selected a non-existent
column `tax_category` on `invoice_items`. PostgREST failed the whole request,
the error was ignored, and the empty array was cached — so every print/PDF for
that session rendered zero rows and 0.00 totals.

Rules:
- `InvoicePrintView` recomputes all totals from `invoice.items`. Empty items =
  a zero-value document. Never print without verified items.
- Item hydration must select only real columns, must throw on error, and must
  never cache an empty result.
- All document paths (print, PDF/preview, duplicate) go through
  `loadInvoiceForDocument`, which aborts with a toast when items are missing.
- `invoice_items` has no `tax_category`; derive it from `tax_rate`.
