-- =====================================================================
-- Amwali QA Testing System — Batch 1 of 6
-- Purpose: Seed isolated QA tenant (company + 2 branches) ONLY.
-- Safety:
--   * Idempotent (fixed UUIDs + ON CONFLICT DO NOTHING).
--   * No RLS / triggers / RPCs / schema changes.
--   * No backfill, no edits to existing rows.
--   * owner_id is a deterministic placeholder; Batch 2 will create
--     auth user `admin_test@amwali.qa` with the SAME UUID so this row
--     becomes naturally owned by that user (no UPDATE needed).
-- =====================================================================

-- QA tenant root UUID (will become admin_test's auth.users.id in Batch 2)
-- Fixed value: 00000000-aaaa-0000-0000-0000000000ad

INSERT INTO public.companies (
  id,
  name,
  owner_id,
  address,
  phone,
  email,
  tax_number,
  is_active,
  invoice_number_offset
) VALUES (
  '00000000-aaaa-0000-0000-000000000001',  -- QA Company
  'Amwali QA',
  '00000000-aaaa-0000-0000-0000000000ad',  -- placeholder = future admin_test auth.uid
  'QA Sandbox — Not a real address',
  '+970-000-000000',
  'qa@amwali.local',
  'QA-TAX-0000',
  true,
  0
)
ON CONFLICT (id) DO NOTHING;

-- Branch 1: QA Ramallah
INSERT INTO public.branches (
  id,
  user_id,
  name,
  address,
  latitude,
  longitude,
  radius_meters,
  is_active,
  secret_key,
  qr_rotation_minutes,
  qr_mode,
  require_gps
) VALUES (
  '00000000-aaaa-0001-0000-000000000001',
  '00000000-aaaa-0000-0000-0000000000ad',  -- same tenant root
  'QA Ramallah Branch',
  'QA — Ramallah (sandbox)',
  31.9038,
  35.2034,
  100,
  true,
  'qa-ramallah-secret-do-not-use-in-prod',
  60,
  'static',
  false
)
ON CONFLICT (id) DO NOTHING;

-- Branch 2: QA Nablus
INSERT INTO public.branches (
  id,
  user_id,
  name,
  address,
  latitude,
  longitude,
  radius_meters,
  is_active,
  secret_key,
  qr_rotation_minutes,
  qr_mode,
  require_gps
) VALUES (
  '00000000-aaaa-0001-0000-000000000002',
  '00000000-aaaa-0000-0000-0000000000ad',
  'QA Nablus Branch',
  'QA — Nablus (sandbox)',
  32.2211,
  35.2544,
  100,
  true,
  'qa-nablus-secret-do-not-use-in-prod',
  60,
  'static',
  false
)
ON CONFLICT (id) DO NOTHING;