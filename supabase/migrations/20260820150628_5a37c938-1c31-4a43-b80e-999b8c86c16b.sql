CREATE INDEX IF NOT EXISTS idx_contacts_active_name_cov
  ON public.contacts (user_id, contact_name)
  INCLUDE (contact_type, phone)
  WHERE is_active;

ANALYZE public.contacts;