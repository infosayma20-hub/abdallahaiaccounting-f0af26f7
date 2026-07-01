CREATE INDEX IF NOT EXISTS idx_employees_auth_user_id
  ON public.employees(auth_user_id)
  WHERE auth_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pos_users_auth_user_id
  ON public.pos_users(auth_user_id)
  WHERE auth_user_id IS NOT NULL;