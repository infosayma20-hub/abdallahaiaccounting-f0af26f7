CREATE TABLE public.external_app_mappings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'malaky_app',
  entity_type text NOT NULL CHECK (entity_type IN ('product','modifier_option','addon','branch')),
  external_id text NOT NULL,
  internal_id uuid,
  internal_code text,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX external_app_mappings_unique_ext
  ON public.external_app_mappings (user_id, source, entity_type, external_id);
CREATE INDEX external_app_mappings_internal_idx
  ON public.external_app_mappings (user_id, entity_type, internal_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.external_app_mappings TO authenticated;
GRANT ALL ON public.external_app_mappings TO service_role;

ALTER TABLE public.external_app_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their external mappings"
ON public.external_app_mappings
FOR ALL
TO authenticated
USING (user_id = public.get_team_owner_id())
WITH CHECK (user_id = public.get_team_owner_id());

CREATE TRIGGER update_external_app_mappings_updated_at
BEFORE UPDATE ON public.external_app_mappings
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();