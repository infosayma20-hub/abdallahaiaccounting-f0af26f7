---
name: POS KDS + Customer Display v1
description: Generic restaurant order display + voice call system; opt-in per company via pos_kds_enabled / pos_customer_display_enabled
type: feature
---

# KDS + Customer Display (v1)

Generic, multi-tenant restaurant feature. NOT Malaky-specific; gated on `company_settings.pos_kds_enabled` / `pos_customer_display_enabled`.

## Schema
- `company_settings`: pos_kds_enabled, pos_customer_display_enabled, pos_voice_call_enabled, pos_voice_language (default ar-PS), pos_voice_template ("طلب رقم {n}، تفضل للاستلام"), pos_ready_auto_hide_seconds (300), pos_call_repeat_seconds (0), pos_call_number_strategy (order_number|daily_short), pos_kds_auto_preparing (true).
- `kitchen_tickets` extended: display_number, ready_at, delivered_at, last_called_at, call_count, company_id, branch_id. Trigger `kitchen_tickets_status_stamp_trg` auto-stamps ready_at/delivered_at.
- `kds_call_events` (ticket_id, company_id, branch_id, display_number, event_type=call|recall|delivered) — RLS by `get_team_owner_id(auth.uid())`.
- `pos_display_devices` (company_id, branch_id, name, device_role, token UNIQUE, is_active, last_seen_at) — owners-only RLS.
- RPC `kds_get_active_tickets(_token)` SECURITY DEFINER: returns today's active tickets for the device's company+branch via token; granted to anon+authenticated. Updates last_seen_at.
- Realtime publication includes `kitchen_tickets` and `kds_call_events`.

## Routes
- `/pos/kitchen` (existing) — kitchen staff Kanban. Now logs `kds_call_events` (call) on ready transition and supports a Megaphone recall button on ready tickets.
- `/pos/order-display?token=<device-token>` (new, public) — two-column board: right=قيد التحضير (pending+preparing), left=جاهز للاستلام (ready). Spotlights last ready in large font + voice call.

## Voice
- `src/lib/kds-voice.ts` uses Web Speech API (free, offline). Picks best available Arabic voice; speaks template twice; preceded by chime via AudioContext.
- Browser audio gesture-lock: customer display shows full-screen tap-to-start before going live.

## Settings UI
- `src/components/settings/KdsDisplaySection.tsx` embedded in POSSettingsSection. Toggles, template + test button, language, hide timers, devices CRUD with copy-link.

## Open / Phase 2
- Auto-create kitchen_tickets on POS order paid (trigger) — not yet wired; today tickets are created via existing "send to kitchen" flow.
- daily_short numbering strategy: schema supports it but generator not built yet.
- Optional ElevenLabs MP3 stitching for fully consistent voice (currently Web Speech).
- Multiple kitchen stations on the same customer display (current display ignores station_id).
