---
name: HR Attendance Day Lock (B2.2.1)
description: DB-backed daily attendance lock via hr_attendance_locks + BEFORE triggers blocking edits to attendance_days/correction_requests/attendance_events on locked dates
type: feature
---
# B2.2.1 — Attendance Day Lock (DB-level)

## Table: `hr_attendance_locks`
- Tenant key: `auth_user_id` (matches project pattern; no `company_id` column).
- Unique on `(auth_user_id, attendance_date, branch_id)`.
- Fields: `status` ('locked'|'unlocked'), `locked_by`, `locked_at`, `reason`, `unlocked_by`, `unlocked_at`, `unlock_reason`.
- Same row is reused on re-lock (UPDATE flips status back to 'locked' and clears unlock fields).

## RLS
- READ: tenant owner OR `is_team_member()`.
- INSERT/UPDATE/DELETE: tenant scope **AND** `has_role(admin)` OR `has_role(hr_manager)`. Other roles get a UI toast and no DB call.

## Helper
`is_attendance_day_locked(_owner uuid, _date date, _branch uuid DEFAULT NULL)` — SECURITY DEFINER, used by all guard triggers. Branch arg is optional; a `branch_id IS NULL` lock applies to all branches for that day.

## Guard triggers (BEFORE INSERT/UPDATE/DELETE)
- `guard_attendance_days_lock` on `attendance_days`
- `guard_correction_requests_lock` on `correction_requests`
- `guard_attendance_events_lock` on `attendance_events` — uses `(event_time AT TIME ZONE 'Asia/Hebron')::date`
- All raise Arabic error: "اليوم YYYY-MM-DD مغلق ولا يمكن ..."
- UPDATE checks BOTH old date and new date, so you cannot bypass by changing `attendance_date`.

## UI (`HRAttendancePage.tsx`)
- Replaced previous `localStorage` lock entirely.
- Realtime channel on `hr_attendance_locks` → cross-device live sync of lock state.
- Lock/Unlock button disabled for non admin/hr_manager.
- Lock dialog: optional reason. Unlock dialog: **mandatory** reason (button disabled until filled).
- Red banner shown when locked, with reason + locked_at and a one-click "فتح اليوم" for managers.

## Coverage with EmployeeApp / zkteco
- `attendance_events` trigger is universal — bsamat from EmployeeApp or zkteco-bridge for a locked date will be rejected with the same Arabic error. This is intentional: lock means the day is sealed.

## Premature lock guard (UI) + Employee-friendly error
- Trigger on `attendance_events` raises Arabic message: "تم إغلاق يوم YYYY-MM-DD من قبل الإدارة. لا يمكن تسجيل البصمة. الرجاء التواصل مع المدير لفتح اليوم."
- Edge function `attendance` propagates trigger's `err.message` verbatim to the response, so EmployeeApp toast is human-readable.
- When manager tries to lock today or a future date, dialog shows a yellow AlertTriangle warning explaining: employees can't check in, ZKTeco blocked, no correction requests.
- Mandatory acknowledgement checkbox for today/future: "أُقرّ بأنني فهمت أن الموظفين لن يتمكنوا من البصمة، وأن الدوام انتهى فعلاً". Lock button stays disabled until checked.
- Past dates: clean flow without the warning.
