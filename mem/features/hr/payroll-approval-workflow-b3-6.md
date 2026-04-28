---
name: Payroll Approval Workflow B3.6
description: 3-stage payroll lifecycle (submitted → approved → paid) with DB-enforced locks, batch + individual approval, no accounting entries
type: feature
---
# B3.6 — Payroll Approval Workflow

**3 مراحل**: `preview` (لا صف DB) → `submitted` (soft lock) → `approved` (hard lock) → `paid` (B3.7 لاحقاً).

## DB layer
- `employee_payroll`: أُضيف `status` (enum payroll_status), `submitted_by/at`, `approved_by/at`, `rejection_reason`, `batch_id`.
- جدول جديد `payroll_batches` لتسجيل الاعتماد الجماعي الشهري (UNIQUE per user_id+year+month).
- **Trigger `guard_employee_payroll_locked`**: يمنع تعديل قيم الراتب (base_salary, total_allowances, total_deductions, total_overtime, net_salary, attendance_salary) إذا الحالة `approved` أو `paid`.
- **Trigger `guard_employee_payroll_delete`**: يمنع حذف صف معتمد أو مدفوع.
- **منع** الرجوع من `paid` لأي حالة سابقة عدا `cancelled`.

## RPC functions (SECURITY DEFINER, search_path=public)
- `payroll_submit_employee(_payload jsonb, _submitter uuid)` — upsert صف بحالة `submitted`. يرفض إذا الموجود `approved/paid`.
- `payroll_approve_employee(_payroll_id, _approver)` — submitted → approved.
- `payroll_reject_employee(_payroll_id, _approver, _reason)` — approved → submitted (re-open) أو submitted → cancelled.
- `payroll_approve_batch(_user_id, _month, _year, _approver)` — يعتمد كل submitted ويُنشئ/يحدّث صف في `payroll_batches`.

## UI layer
- `usePayrollApproval.ts`: hooks (useEmployeePayrollRow, useSubmitPayroll, useApprovePayroll, useRejectPayroll, usePayrollMonth, useApprovePayrollBatch).
- `PayrollApprovalBar.tsx`: شريط داخل `PayrollPreviewTab` بحالة + أزرار سياقية (تقديم/تحديث/اعتماد/إرجاع/إعادة فتح).
- `PayrollApprovalCenter.tsx` (route `/payroll/approval`): جدول شهري لكل الموظفين مع KPIs + اعتماد فردي + اعتماد جماعي مع تأكيد.

## القواعد المهمة
- **لا قيود محاسبية، لا سندات صرف** في B3.6 — الترحيل المحاسبي مؤجل لـ B3.7.
- بعد الاعتماد، تعديل الحركات في sub-ledger ممكن نظرياً لكن لا يؤثر على القيم المعتمدة (snapshot).
- الـ batch يكون UNIQUE لكل (شركة، شهر، سنة) — اعتماد ثاني يُحدّث نفس الصف.
- جميع RPCs تتحقق من ownership عبر `get_team_owner_id`.
