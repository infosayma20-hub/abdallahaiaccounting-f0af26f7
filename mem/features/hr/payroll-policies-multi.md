---
name: Payroll Policies Multi (CRUD + Assignment)
description: Multiple payroll policies with per-employee assignment, bulk assignment, default policy enforcement
type: feature
---
# Multi Payroll Policies

**Route:** `/payroll-settings/policies` (HRShell, requires `can_manage_hr_settings`, roles: admin/hr_manager).

**Tables:** `hr_payroll_policies` (already had RLS + DB triggers preventing delete of default or in-use). `employees.payroll_policy_id` FK.

**Files:**
- `src/hooks/hr/usePayrollPolicies.ts` — list/create/update/remove/setDefault/toggleActive/assignToEmployees + employee counts per policy.
- `src/pages/hr/__internal/payroll-settings/PayrollPoliciesPage.tsx` — grid of policy cards + Tabs (Policies / Assign).
- `src/pages/hr/__internal/payroll-settings/PolicyFormDialog.tsx` — create/edit form (salary basis, month days mode, OT, absence, late, deductions).
- `src/pages/hr/__internal/payroll-settings/PolicyAssignmentTable.tsx` — filter by dept/branch/policy, bulk-assign selected employees, per-row Select.

**Default policy:** `setDefault` mutation unsets others first (unique partial index `is_default=true` per company), then sets target. Employees with `payroll_policy_id=null` fall back to default.

**SubNav tab added** in `src/components/hr/PayrollSubNav.tsx`: "السياسات المتعددة"; old `/payroll-settings` tab relabeled "إعدادات الرواتب" with `exact:true`.
