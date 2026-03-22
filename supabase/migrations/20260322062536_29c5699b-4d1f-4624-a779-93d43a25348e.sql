
-- Add 'portal' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'portal';

-- Add auth_user_id column to malaki_portal_users for Supabase Auth linking
ALTER TABLE public.malaki_portal_users ADD COLUMN IF NOT EXISTS auth_user_id uuid UNIQUE;
