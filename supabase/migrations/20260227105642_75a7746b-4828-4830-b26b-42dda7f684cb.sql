-- Add unique constraint for contacts upsert during migration
ALTER TABLE public.contacts ADD CONSTRAINT contacts_user_contact_name_unique UNIQUE (user_id, contact_name);
