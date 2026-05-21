## Phase 1 Smoke Apply — Feature Permissions

Goal: enforce `user_feature_permissions` on real sensitive UI + handlers, with minimum file surface area. Build infrastructure first, then wrap.

---

### A. Infrastructure (3 new files)

1. **`src/components/permissions/FeatureGuard.tsx`**
   Route wrapper. Props: `app`, `feature`, `perm`. Shows `LockedModulePage` (reuse existing) if denied. Uses `usePermission`. Loading-aware (no flicker). super_admin bypass via hook.

2. **`src/lib/permissions/assertPermission.ts`**
   `await assertPermission(app, feature, perm, { silent? })` — calls `checkFeaturePermission`. On deny: toast `"لا تملك صلاحية تنفيذ هذه العملية"` + throws. Used inside handlers.

3. **Extend `src/components/permissions/Can.tsx`** (already exists)
   Add `mode="disable"` variant with tooltip `"لا تملك صلاحية"` (default stays hidden).

---

### B. Wiring — Buttons + Route Guards

For each page below: import `usePermission` + `<Can>`, wrap actions; add `assertPermission` in the handler.

| Page | Wrapped buttons | Handler asserts |
|---|---|---|
| `src/pages/InvoicesPage.tsx` | New / Edit row / Delete / Cancel / Print / Export | delete, cancel, export |
| `src/pages/InvoiceCreatePage.tsx` | Save | save (create or update) |
| `src/pages/PurchasePointPage.tsx` (purchase invoices list) | New / Edit / Delete / Print / Export | delete, export |
| `src/pages/POSPage.tsx` + `src/components/pos/ReturnDialog.tsx` + relevant POS toolbar/cash-drawer/close-shift code | discount field, change-price, refund, open-drawer, close-shift, print-receipt | discount apply, refund submit, openDrawer, closeShift |
| `src/pages/FinanceVoucherPage.tsx` / `VoucherFormPage.tsx` | New / Edit / Delete / Print (receipts + payments) | delete, save |
| `src/pages/JournalEntriesPage.tsx` / `JournalNewPage.tsx` | New / Edit / Delete / Approve | delete, approve, save |
| `src/pages/SettingsPage.tsx` | Hide `user` tab if `settings.users.manage` deny; hide `company` save if `company.update` deny; hide POS settings save; hide app-permissions button |
| `src/components/settings/UsersSettingsSection.tsx` | "Manage Apps" + "Add user" + "Edit role" | gate `manage-team-user` invoke + UserAppAccessDialog open |

---

### C. Route Guards (`src/App.tsx`)

Wrap route elements:
- `/invoices/new` and `/invoices/:id/edit` → `<FeatureGuard app="sales" feature="invoices" perm="create"|"update">`
- `/procurement/invoices/new` → purchases.purchase_invoices.create
- `/finance/vouchers/new`, `/finance/journal/new` → respective create
- `/pos-users` → `pos.kds.manage` (closest match) — actually use `settings.users.manage` per spec
- `/settings` already protected at app level; sub-tabs gated inside SettingsPage

---

### D. Edge function hardening

`supabase/functions/manage-team-user/index.ts`: at top after auth, call `has_feature_permission(actor, 'settings', 'users', 'manage')`. If false (and not super_admin) → 403 + audit log.

`supabase/functions/manage-user-app-access/index.ts`: same with `settings.app_permissions.manage`.

---

### E. UX rules
- Destructive/hidden by default: create, delete, cancel, approve, refund, open_drawer, close_shift, manage users, manage app permissions, discount.
- Disabled+tooltip: print, export, edit (so user sees the row but can't act).

---

### F. Acceptance test pass (manual checklist documented in plan.md)

10 cases listed in user message, plus super_admin bypass + Realtime allow-flip.

---

### Files touched (estimate)
**New (3):** FeatureGuard.tsx, assertPermission.ts, (extend Can.tsx)
**Edited (~12):** InvoicesPage, InvoiceCreatePage, PurchasePointPage, POSPage, ReturnDialog, FinanceVoucherPage, VoucherFormPage, JournalEntriesPage, JournalNewPage, SettingsPage, UsersSettingsSection, App.tsx, manage-team-user/index.ts, manage-user-app-access/index.ts

### Out-of-scope (Phase 2)
- Per-row RLS for invoices/vouchers DELETE (server-side enforcement)
- Cheques, HR, inventory adjust, recurring invoices
- POS PIN-mode override workflows
- Migration of role defaults beyond admin/accountant_senior/cashier