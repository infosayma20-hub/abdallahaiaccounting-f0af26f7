CREATE TABLE public.pos_scales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  branch_id uuid,
  name text NOT NULL,
  model text NOT NULL DEFAULT 'RLS1100',
  ip_address text,
  port integer NOT NULL DEFAULT 5001,
  barcode_prefix text NOT NULL DEFAULT '20',
  plu_digits integer NOT NULL DEFAULT 5,
  value_mode text NOT NULL DEFAULT 'weight',
  value_decimals integer NOT NULL DEFAULT 3,
  is_active boolean NOT NULL DEFAULT true,
  last_export_at timestamptz,
  last_status text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.pos_scale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scale_id uuid NOT NULL REFERENCES public.pos_scales(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  plu integer NOT NULL,
  key_no integer,
  shelf_life_days integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (scale_id, plu),
  UNIQUE (scale_id, product_id)
);
CREATE TABLE public.pos_scale_sync_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scale_id uuid NOT NULL REFERENCES public.pos_scales(id) ON DELETE CASCADE,
  action text NOT NULL,
  items_count integer NOT NULL DEFAULT 0,
  status text NOT NULL,
  message text,
  performed_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_scales, public.pos_scale_items TO authenticated;
GRANT SELECT, INSERT ON public.pos_scale_sync_log TO authenticated;
GRANT ALL ON public.pos_scales, public.pos_scale_items, public.pos_scale_sync_log TO service_role;
ALTER TABLE public.pos_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_scale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_scale_sync_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_manage_pos_scales(_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_team_member(auth.uid(), _owner) AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'super_admin') OR public.has_role(auth.uid(),'accountant_senior'))
$$;

CREATE POLICY "team view scales" ON public.pos_scales FOR SELECT TO authenticated USING (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(),'pos'));
CREATE POLICY "managers write scales" ON public.pos_scales FOR ALL TO authenticated USING (public.can_manage_pos_scales(user_id)) WITH CHECK (public.can_manage_pos_scales(user_id));
CREATE POLICY "team view scale items" ON public.pos_scale_items FOR SELECT TO authenticated USING (public.is_team_member(auth.uid(), user_id) AND public.user_can_access(auth.uid(),'pos'));
CREATE POLICY "managers write scale items" ON public.pos_scale_items FOR ALL TO authenticated USING (public.can_manage_pos_scales(user_id)) WITH CHECK (public.can_manage_pos_scales(user_id));
CREATE POLICY "managers view scale log" ON public.pos_scale_sync_log FOR SELECT TO authenticated USING (public.can_manage_pos_scales(user_id));
CREATE POLICY "managers insert scale log" ON public.pos_scale_sync_log FOR INSERT TO authenticated WITH CHECK (public.can_manage_pos_scales(user_id));

CREATE TRIGGER trg_pos_scales_updated BEFORE UPDATE ON public.pos_scales FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_pos_scale_items_updated BEFORE UPDATE ON public.pos_scale_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_pos_scale_items_scale ON public.pos_scale_items(scale_id);