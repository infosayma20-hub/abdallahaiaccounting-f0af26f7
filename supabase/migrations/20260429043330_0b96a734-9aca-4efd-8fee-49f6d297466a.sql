-- B3.7 hardening: drop the orphan auto_journal_payroll function.
-- The trigger trg_auto_journal_payroll was already removed in B3.7.
-- Payment posting is now exclusively handled by:
--   * payroll_pay_employee(...)
--   * payroll_pay_batch(...)
-- and protected by trg_guard_employee_payroll_payment which blocks any
-- direct UPDATE to is_paid / status='paid' outside those RPCs.
--
-- Archived copy: mem/archive/auto_journal_payroll_deprecated.sql

DROP FUNCTION IF EXISTS public.auto_journal_payroll() CASCADE;