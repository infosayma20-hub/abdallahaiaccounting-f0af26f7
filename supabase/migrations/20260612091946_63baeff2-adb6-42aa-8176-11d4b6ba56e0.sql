
CREATE TABLE IF NOT EXISTS public.pos_category_print_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid NULL,
  category_id uuid NOT NULL,
  station_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Uniqueness: avoid duplicates. Use COALESCE to treat NULL branch as a sentinel.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pos_cat_print_rules
  ON public.pos_category_print_rules (
    user_id,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    category_id,
    station_id
  );

CREATE INDEX IF NOT EXISTS idx_pos_cat_print_rules_user
  ON public.pos_category_print_rules (user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_category_print_rules TO authenticated;
GRANT ALL ON public.pos_category_print_rules TO service_role;

ALTER TABLE public.pos_category_print_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own print rules"
  ON public.pos_category_print_rules
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.touch_pos_cat_print_rules()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_touch_pos_cat_print_rules ON public.pos_category_print_rules;
CREATE TRIGGER trg_touch_pos_cat_print_rules
  BEFORE UPDATE ON public.pos_category_print_rules
  FOR EACH ROW EXECUTE FUNCTION public.touch_pos_cat_print_rules();
