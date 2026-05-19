---
name: KDS Pilot v4
description: Phase 4 pilot tooling — issues log table, quick-setup preset, control page enhancements
type: feature
---
- Table `kds_pilot_issues` (tenant-scoped via get_team_owner_id) for capturing field issues: order_number, device_label, internet_ok, was_refreshed, expected/actual, priority, status.
- `/pos/kds-control` shows PilotIssuesPanel + "قالب مطعم سريع" preset that enables KDS/customer display/voice and creates customer_display + heater_screen devices if missing.
- Troubleshooting tips added inline (no separate docs page).
