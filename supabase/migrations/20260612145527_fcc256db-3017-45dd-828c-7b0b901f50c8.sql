UPDATE branch_manager_assignments bma
SET company_id = e.company_id
FROM employees e
WHERE e.auth_user_id = bma.user_id
  AND e.company_id IS NOT NULL
  AND bma.company_id IS DISTINCT FROM e.company_id;