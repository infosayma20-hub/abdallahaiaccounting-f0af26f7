
-- Merge duplicate employees for قلوبنا (owner 0b08eba6-c81a-4f6c-b371-e6e324016e73)
-- Target (keep): a3af7e8e-7d24-4701-8c1b-54a265a02ab0  "احمد فرح" (has attendance + auth + fingerprints)
-- Source 1 (merge): 378f5471-bd1f-4672-8b91-dad7d7624696 "احمد نعيرات" (has 9 meal deductions)
-- Source 2 (merge): a2b5884c-0676-4c4b-9cbc-8b19484a5fcb "أحمد فرح" (duplicate, empty)

-- 1) Move meal deductions / financial movements to the kept employee
UPDATE public.employee_financial_movements
SET employee_id = 'a3af7e8e-7d24-4701-8c1b-54a265a02ab0'
WHERE employee_id IN (
  '378f5471-bd1f-4672-8b91-dad7d7624696',
  'a2b5884c-0676-4c4b-9cbc-8b19484a5fcb'
);

-- 2) Move allowed-branch rows (dedupe against target)
DELETE FROM public.employee_allowed_branches
WHERE employee_id IN (
  '378f5471-bd1f-4672-8b91-dad7d7624696',
  'a2b5884c-0676-4c4b-9cbc-8b19484a5fcb'
)
AND branch_id IN (
  SELECT branch_id FROM public.employee_allowed_branches
  WHERE employee_id = 'a3af7e8e-7d24-4701-8c1b-54a265a02ab0'
);

UPDATE public.employee_allowed_branches
SET employee_id = 'a3af7e8e-7d24-4701-8c1b-54a265a02ab0'
WHERE employee_id IN (
  '378f5471-bd1f-4672-8b91-dad7d7624696',
  'a2b5884c-0676-4c4b-9cbc-8b19484a5fcb'
);

-- 3) Deactivate and terminate the two duplicate records (soft-remove; keep audit trail)
UPDATE public.employees
SET is_active = false,
    is_terminated = true,
    terminated_at = COALESCE(terminated_at, now()),
    termination_reason = COALESCE(termination_reason, 'دمج مع حساب أحمد فرح (a3af7e8e) — نقل الوجبات والحركات المالية'),
    notes = COALESCE(notes || E'\n', '') || '[MERGED] حساب مكرر تم دمجه مع أحمد فرح a3af7e8e-7d24-4701-8c1b-54a265a02ab0 بتاريخ ' || now()::text
WHERE id IN (
  '378f5471-bd1f-4672-8b91-dad7d7624696',
  'a2b5884c-0676-4c4b-9cbc-8b19484a5fcb'
);

-- 4) Make sure the kept employee is active
UPDATE public.employees
SET is_active = true,
    is_terminated = false,
    terminated_at = NULL
WHERE id = 'a3af7e8e-7d24-4701-8c1b-54a265a02ab0';
