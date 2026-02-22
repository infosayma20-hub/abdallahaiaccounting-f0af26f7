
-- Add setup wizard fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS business_type text,
ADD COLUMN IF NOT EXISTS has_inventory boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS has_receivables boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS has_employees boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS setup_completed boolean DEFAULT false;
