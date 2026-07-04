
CREATE INDEX IF NOT EXISTS idx_vouchers_user_type_created
  ON public.vouchers (user_id, type, created_at DESC)
  WHERE status <> 'cancelled';
