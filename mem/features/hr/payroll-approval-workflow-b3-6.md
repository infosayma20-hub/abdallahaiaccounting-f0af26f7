---
name: Payroll Approval Workflow (B3.6)
description: Multi-stage payroll approval lifecycle (submitted → approved → paid) with returned state for re-review and locking guards
type: feature
---

# Payroll Approval Workflow

## Status lifecycle (payroll_status enum)
- `submitted` — قيد الاعتماد (قابل للتعديل وإعادة التقديم)
- `approved` — معتمد ومقفل (قيم مالية لا تُعدّل)
- `paid` — مدفوع (B3.7 — لاحقاً)
- `returned` — معاد للمراجعة (قابل للتعديل + إعادة التقديم؛ ليس إلغاءً)
- `cancelled` — ملغي نهائياً (لا يُستخدم لـ "إرجاع للمراجعة")

## Key DB functions
- `payroll_submit_employee(_payload jsonb, _submitter uuid)` — upsert؛ يُحدّث الصفوف بحالة submitted/returned/cancelled ويعيدها إلى submitted ويفرّغ rejection_reason. يرفض الكتابة فوق approved/paid.
- `payroll_approve_employee(_payroll_id, _approver)` — submitted → approved
- `payroll_reject_employee(_payroll_id, _approver, _reason)` — submitted/approved → **returned** (ليس cancelled). reason إجباري.
- `payroll_approve_batch(_user_id, _month, _year, _approver)` — اعتماد دفعة شهرية كاملة، ينشئ payroll_batches.

## Locking guards
- `guard_employee_payroll_locked` BEFORE UPDATE — يمنع تعديل القيم المالية على approved/paid، لكن يسمح بانتقال الحالة إلى returned/cancelled/submitted.
- `guard_employee_payroll_delete` BEFORE DELETE — يمنع حذف approved/paid.

## Accounting
لا قيود محاسبية ولا سندات صرف عند submit/approve/reject. الـ trigger `auto_journal_payroll` يطلق فقط على `is_paid=true` (يُفعّل في B3.7).

## UI labels
- زر إرجاع: "إرجاع للمراجعة" (وليس "إلغاء")
- بعد returned: زر "إعادة التقديم"
- بعد approved: زر "إرجاع للمراجعة" (يفك القفل)
