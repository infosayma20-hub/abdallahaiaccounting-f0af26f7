
-- Phase 1: Drop dead tables (0 rows, no code references)

-- 1. stock_valuation_layers
DROP TABLE IF EXISTS public.stock_valuation_layers CASCADE;

-- 2. salary_slips
DROP TABLE IF EXISTS public.salary_slips CASCADE;

-- 3. invoice_payments
DROP TABLE IF EXISTS public.invoice_payments CASCADE;

-- 4. invoice_receipt_matching
DROP TABLE IF EXISTS public.invoice_receipt_matching CASCADE;

-- 5. employee_attendance
DROP TABLE IF EXISTS public.employee_attendance CASCADE;
