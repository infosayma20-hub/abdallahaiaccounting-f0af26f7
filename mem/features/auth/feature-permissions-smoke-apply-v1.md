---
name: Feature Permissions Smoke Apply v1
description: Phase 1 wiring of user_feature_permissions on sensitive UI + handlers + routes (sales/purchases/finance/POS/settings)
type: feature
---
# Phase 1 Smoke Apply (in-app feature permissions)

## Infrastructure
- `FeatureGuard` (`src/components/permissions/FeatureGuard.tsx`) — route wrapper that shows LockedModulePage when `usePermission(app).can(feature, perm)` is false. Renders children during loading to avoid flicker; server asserts still enforce.
- `assertPermission(app, feature, perm)` (`src/lib/permissions/assertPermission.ts`) — async server-trusted check via `has_feature_permission` RPC; toasts + throws on deny. Use INSIDE handlers.
- `<Can>` already supports `disableInsteadOfHide` (tooltip variant).

## Wiring map (what is enforced now)
| App | Feature.perm | UI hide | Route guard | Handler assert |
|---|---|---|---|---|
| sales.invoices.create | InvoicesPage top buttons | /invoices/new | handleCreate() |
| sales.invoices.export | InvoicesPage export (disabled) | — | — |
| purchases.purchase_invoices.create | InvoicesPage (when filterType=purchase) | /procurement/invoices/new | handleCreate() |
| finance.receipts.create | FinanceVoucherPage new | /finance/receipt/new + /:id/edit (update) | — |
| finance.payments.create | FinanceVoucherPage new | /finance/payment/new + /:id/edit (update) | — |
| finance.receipts.print / payments.print | FV print + export (disabled) | — | — |
| finance.journal.create | JournalEntriesPage new | /finance/journal/new | — |
| finance.journal.view | JE export (disabled) | — | — |
| pos.sell.discount | — (composed in updateCartItem) | — | sync check + toast |
| pos.sell.change_price | — (composed in updateCartItem) | — | sync check + toast |
| pos.sell.open_drawer | — | — | composed with posPerms.open_cash_drawer at auto-open |
| pos.sell.close_shift | — | — | assertPermission in handleCloseShift |
| settings.users.manage | SettingsPage hides user tab + LockedModulePage if direct | /pos-users (FeatureGuard) | assertPermission in handleAddUser/ToggleActive/ChangeRole/ResetPassword + manage-team-user edge fn (defense-in-depth, audit log) |
| settings.roles.manage | — | — | assertPermission in handlePermissionChange |

## Out of scope (Phase 1b — pending)
- Per-row Edit/Delete/Cancel/Print buttons inside InvoicesPage list/dialogs (~6 spots)
- Refund button inside ReturnDialog (pos.sell.refund)
- Voucher row edit/delete/print actions inside FinanceVoucherPage rows
- Journal row edit/delete/approve actions
- ProcurementInvoicesPage list buttons
- VoucherFormPage / JournalNewPage save asserts (route guard already blocks unauthorized navigation; add assert before final insert for devtools bypass)
- RLS DELETE policies on invoices/vouchers tied to feature_permissions

## Acceptance test guidance
Tester logs in as momen@qamar.com, opens admin UAAD, toggles each permission, verifies:
1. Hide/show of wrapped UI updates after realtime override flip.
2. Direct URL navigation to wrapped routes shows LockedModulePage.
3. Console-invoked handlers (e.g. `handleCreate`, `handleCloseShift`) reject with "لا تملك صلاحية تنفيذ هذه العملية".
4. super_admin bypasses all checks.
5. `manage-team-user` returns 403 + writes `activity_log` row with action=`denied_manage_team_user` when feature is denied for an admin.