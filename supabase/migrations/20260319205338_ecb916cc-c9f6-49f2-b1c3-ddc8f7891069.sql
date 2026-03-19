ALTER TABLE public.pos_orders 
ADD COLUMN IF NOT EXISTS transferred_from_session_id uuid REFERENCES public.pos_sessions(id) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS transferred_to_name text DEFAULT NULL;