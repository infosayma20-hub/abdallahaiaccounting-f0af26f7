ALTER TABLE public.qamar_orders 
ADD COLUMN IF NOT EXISTS cost_breakdown jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.qamar_orders 
ADD COLUMN IF NOT EXISTS production_cost numeric DEFAULT 0;

ALTER TABLE public.qamar_orders 
ADD COLUMN IF NOT EXISTS gross_profit numeric DEFAULT 0;