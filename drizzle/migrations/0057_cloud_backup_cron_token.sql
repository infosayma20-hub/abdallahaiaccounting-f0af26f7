CREATE TABLE public.cloud_backup_config (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  cron_token text NOT NULL DEFAULT encode(extensions.gen_random_bytes(32),'hex')
);
GRANT ALL ON public.cloud_backup_config TO service_role;
ALTER TABLE public.cloud_backup_config ENABLE ROW LEVEL SECURITY;
INSERT INTO public.cloud_backup_config(id) VALUES (1);