-- Temporary disable of payroll lock guard to apply Excel-corrected
-- deduction_fixed_component values for 9 employees, period 05/2026.
-- Re-enables guard at the end.

ALTER TABLE public.employee_payroll DISABLE TRIGGER trg_guard_employee_payroll_locked;

WITH upd(id, new_fixed) AS (
  VALUES
    ('3e1cba8c-1135-452c-9011-19879fd5d0b6'::uuid, 0::numeric),
    ('71974056-88cb-4023-ba26-f36188297322'::uuid, 251.6129032258065::numeric),
    ('1c78735f-6275-445a-a96c-10a3a7169162'::uuid, 0::numeric),
    ('dcbb935f-b070-4be5-96dc-749c627df758'::uuid, 0::numeric),
    ('8c325ecf-c5b3-457b-8ce9-42e2859b1e6e'::uuid, 167.741935483871::numeric),
    ('cc72bf0f-68d8-4bf9-bab3-e32014246a8a'::uuid, 83.87096774193549::numeric),
    ('5ac1f21b-b513-4c28-91b5-c7b7a3096849'::uuid, 32.25806451612903::numeric),
    ('467d9844-7ddb-43a2-a133-a17f35544c39'::uuid, 0::numeric),
    ('4e2a8972-7d27-4c1f-b6ee-2739b5dee9f9'::uuid, 116.1290322580645::numeric)
)
UPDATE public.employee_payroll ep
SET
  deduction_fixed_component = upd.new_fixed,
  total_deductions = ep.total_deductions + (upd.new_fixed - ep.deduction_fixed_component),
  net_salary = ep.net_salary - (upd.new_fixed - ep.deduction_fixed_component)
FROM upd
WHERE ep.id = upd.id
  AND ep.period_year = 2026
  AND ep.period_month = 5;

ALTER TABLE public.employee_payroll ENABLE TRIGGER trg_guard_employee_payroll_locked;