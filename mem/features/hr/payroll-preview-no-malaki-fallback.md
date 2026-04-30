---
name: Payroll Preview — No Malaki Fallback
description: /payroll/preview-all uses Standard preset ONLY; missing/foreign/non-standard policies → zeroed slip + "بدون سياسة رواتب" status, never Malaki
type: constraint
---
HARD RULE in `src/pages/hr/PayrollPreviewAllPage.tsx`:

- Standard preset runs ONLY when `employee.payroll_policy_id` resolves to a policy that:
  1. belongs to the current `company.id`, AND
  2. has `engine_preset === "standard"`.
- Any other case → zeroed payslip, empty breakdown, status `"no_policy"`, badge "بدون سياسة رواتب".
- `calculateMalakiPayslip` is NEVER invoked from this preview page.

Why: Tenants like "ليمون ونعنع" do not adopt Malaki's auto-derived allowances (annual increment, family, food/transport). Showing them via fallback misled the accountant about the actual policy.

How to apply: When extending this preview, do not add a "default engine" branch. Force the accountant to fix the policy link in the employee profile.
