-- Add CASCADE to pos_orders -> pos_sessions FK
ALTER TABLE public.pos_orders DROP CONSTRAINT pos_orders_session_id_fkey;
ALTER TABLE public.pos_orders ADD CONSTRAINT pos_orders_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.pos_sessions(id) ON DELETE CASCADE;

-- Add CASCADE to customer_surveys -> pos_orders FK
ALTER TABLE public.customer_surveys DROP CONSTRAINT customer_surveys_order_id_fkey;
ALTER TABLE public.customer_surveys ADD CONSTRAINT customer_surveys_order_id_fkey FOREIGN KEY (order_id) REFERENCES public.pos_orders(id) ON DELETE CASCADE;

-- Add CASCADE to pos_orders self-ref (returns)
ALTER TABLE public.pos_orders DROP CONSTRAINT pos_orders_return_of_order_id_fkey;
ALTER TABLE public.pos_orders ADD CONSTRAINT pos_orders_return_of_order_id_fkey FOREIGN KEY (return_of_order_id) REFERENCES public.pos_orders(id) ON DELETE SET NULL;