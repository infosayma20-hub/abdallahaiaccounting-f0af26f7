-- Enable realtime for live monitoring
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.super_admin_audit_logs;