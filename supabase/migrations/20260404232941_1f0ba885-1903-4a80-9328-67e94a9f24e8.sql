
-- Add new columns to orders table for the accountant workflow
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS production_status text DEFAULT 'pending';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS production_cost numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS cost_breakdown jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoice_id uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoiced_at timestamp with time zone;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS invoiced_by uuid;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS paid_amount numeric DEFAULT 0;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS remaining_amount numeric DEFAULT 0;
