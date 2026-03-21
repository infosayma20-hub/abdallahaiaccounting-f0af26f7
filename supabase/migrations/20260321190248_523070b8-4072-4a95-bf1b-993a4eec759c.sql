-- Fix existing employee_forms: set user_id to the team owner (employees.user_id) instead of employee's auth_user_id
UPDATE public.employee_forms ef
SET user_id = e.user_id
FROM public.employees e
WHERE ef.employee_id = e.id
  AND ef.user_id != e.user_id;