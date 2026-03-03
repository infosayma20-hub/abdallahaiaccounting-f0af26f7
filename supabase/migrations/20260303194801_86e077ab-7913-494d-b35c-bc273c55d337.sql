
-- Step 1: Add super_admin to app_role enum only
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
