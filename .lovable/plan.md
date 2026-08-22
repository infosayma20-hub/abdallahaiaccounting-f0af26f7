# Mobile App Orders API — Malaky (تطبيق الزبون → شاشة الكاشير)

## Goal
Give Malaky's app developer a secure HTTP API to push customer orders into Unify ERP. Orders route by branch and appear instantly on the POS cashier screen ("الطلبات المعلقة / الفواتير المحولة") — where the cashier accepts and converts them to invoices, exactly like Kiosk/Call-Center orders today.

## What exists (reuse, no reinvention)
- `call_center_orders` table = staging area. POS `PendingOrdersPanel` already polls `status='pending'` + `target_branch_id`, plays a sound, and cashier acceptance converts items → POS order tab → invoice. `ack_call_center_order` RPC closes the loop on payment.
- `branches.secret_key` column exists (per-branch secret) — but the app is company-wide, so we need a **company-level API key** instead.

## Changes

### 1. Database (migration)
- New table `public.external_api_keys`:
  - `id`, `company_id` (owner scope), `label`, `key_hash` (sha256), `key_prefix` (first 8 chars for display), `is_active`, `last_used_at`, `created_at`
  - GRANTs (authenticated read own, service_role all) + RLS: company members see their own keys only.
- `call_center_orders`: add `client_reference_id text` + **unique partial index** `(user_id, client_reference_id)` for idempotency (safe retries from the app).

### 2. Edge function `mobile-orders-api`
Endpoints (all under one function, CORS-enabled, JWT not required — API key auth):
- `POST /orders` — create order:
  - Auth: `x-api-key` header → sha256 → lookup active key → resolve `company_id`.
  - Zod-validated body: `client_reference_id` (required, idempotency), `branch_code` (resolve → `target_branch_id`, must belong to the key's company), `customer_name`, `customer_phone`, `delivery_type` (delivery|takeaway|dine_in), `payment_method` (cash|card|wallet), `items[]` (product_id, qty, unit_price, notes?, modifiers?) — same items JSON shape the Kiosk writes so POS conversion works unchanged, plus `notes`, `delivery_address`, `scheduled_for?`.
  - Insert with `source_app='MOBILE_APP'`, `status='pending'`. On duplicate `client_reference_id` → return the existing order (200, `deduplicated: true`).
  - Log every request to `webhook_logs` for debugging.
- `GET /orders/:client_reference_id` — status polling for the app (pending / accepted / completed / cancelled + cashier updates).
- Responses in JSON with clear Arabic+English error messages; 401/400/404/409/500 codes.

### 3. Key management UI (Super Admin / Settings)
- In company settings (or super-admin company page): "مفاتيح API" section — generate key (shown **once**), list keys (prefix + label + last used), revoke.
- Key generation via service-role edge function call (`mobile-orders-api` admin action or reuse existing admin function) — raw key never stored, only hash.

### 4. POS display touch-up
- `PendingOrdersPanel`: add a small source badge ("تطبيق" 📱 vs "كشك" vs "كول سنتر") so the cashier knows the origin. No logic change — the existing pending-orders flow works as-is.

### 5. Developer documentation
- Arabic markdown doc (`docs/mobile-app-api.md` + delivered in chat): base URL, auth header, full request/response examples, branch codes list for Malaky, error codes, idempotency rules, and a test/sandbox key flow.

## Verification
- Generate a real key for Malaky, curl `POST /orders` with a test order targeting Plaza Mall branch, confirm it appears in `PendingOrdersPanel` (Playwright), accept it as cashier, confirm `ack` + status endpoint reflects completion.
- Retry same `client_reference_id` → dedup confirmed. Wrong key → 401. Wrong branch → 400.

## Out of scope (phase 2, if wanted)
- Menu/items sync endpoint (`GET /menu`), delivery-zone auto branch resolution by GPS, webhook callbacks to the app on status change.
