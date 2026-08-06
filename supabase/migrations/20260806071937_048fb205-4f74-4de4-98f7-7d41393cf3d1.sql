-- ========= 1) SLA settings =========
CREATE TABLE public.pos_prep_sla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  scope text NOT NULL CHECK (scope IN ('default','category','product')),
  category_id uuid,
  product_id uuid,
  target_minutes integer NOT NULL DEFAULT 8,
  is_instant boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uniq_prep_sla_default  ON public.pos_prep_sla(user_id) WHERE scope='default';
CREATE UNIQUE INDEX uniq_prep_sla_category ON public.pos_prep_sla(user_id, category_id) WHERE scope='category';
CREATE UNIQUE INDEX uniq_prep_sla_product  ON public.pos_prep_sla(user_id, product_id) WHERE scope='product';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_prep_sla TO authenticated;
GRANT ALL ON public.pos_prep_sla TO service_role;
ALTER TABLE public.pos_prep_sla ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team can manage prep sla" ON public.pos_prep_sla
  FOR ALL TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), user_id))
  WITH CHECK (public.is_team_member((SELECT auth.uid()), user_id));

-- ========= 2) Order tracking =========
CREATE TABLE public.pos_order_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  company_id uuid,
  branch_id uuid,
  business_date date,
  order_number text,
  display_number text,
  order_type text,
  printed_at timestamptz NOT NULL,
  delivered_at timestamptz,
  delivered_by_name text,
  delivered_by_user uuid,
  target_minutes integer NOT NULL DEFAULT 8,
  elapsed_seconds integer,
  is_late boolean NOT NULL DEFAULT false,
  is_cancelled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pos_order_tracking_user_date ON public.pos_order_tracking(user_id, business_date DESC);
CREATE INDEX idx_pos_order_tracking_branch_open ON public.pos_order_tracking(branch_id, printed_at DESC) WHERE delivered_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_order_tracking TO authenticated;
GRANT ALL ON public.pos_order_tracking TO service_role;
ALTER TABLE public.pos_order_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team can manage order tracking" ON public.pos_order_tracking
  FOR ALL TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), user_id))
  WITH CHECK (public.is_team_member((SELECT auth.uid()), user_id));

-- ========= 3) Item tracking =========
CREATE TABLE public.pos_order_item_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_line_id uuid NOT NULL UNIQUE REFERENCES public.pos_order_lines(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.pos_orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  company_id uuid,
  branch_id uuid,
  business_date date,
  product_id uuid,
  product_name text NOT NULL,
  qty numeric NOT NULL DEFAULT 1,
  printed_at timestamptz NOT NULL,
  delivered_at timestamptz,
  delivered_by_name text,
  target_minutes integer NOT NULL DEFAULT 8,
  elapsed_seconds integer,
  is_late boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_pos_item_tracking_order ON public.pos_order_item_tracking(order_id);
CREATE INDEX idx_pos_item_tracking_user_date ON public.pos_order_item_tracking(user_id, business_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_order_item_tracking TO authenticated;
GRANT ALL ON public.pos_order_item_tracking TO service_role;
ALTER TABLE public.pos_order_item_tracking ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team can manage item tracking" ON public.pos_order_item_tracking
  FOR ALL TO authenticated
  USING (public.is_team_member((SELECT auth.uid()), user_id))
  WITH CHECK (public.is_team_member((SELECT auth.uid()), user_id));

-- updated_at triggers
CREATE TRIGGER trg_prep_sla_updated BEFORE UPDATE ON public.pos_prep_sla
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_order_tracking_updated BEFORE UPDATE ON public.pos_order_tracking
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_item_tracking_updated BEFORE UPDATE ON public.pos_order_item_tracking
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ========= 4) SLA resolver =========
CREATE OR REPLACE FUNCTION public.pos_resolve_target_minutes(_owner uuid, _product_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_cat uuid;
  v_rec record;
BEGIN
  IF _product_id IS NOT NULL THEN
    SELECT * INTO v_rec FROM pos_prep_sla
      WHERE user_id=_owner AND scope='product' AND product_id=_product_id LIMIT 1;
    IF FOUND THEN
      RETURN CASE WHEN v_rec.is_instant THEN 0 ELSE v_rec.target_minutes END;
    END IF;
    SELECT pos_category_id INTO v_cat FROM products WHERE id=_product_id;
    IF v_cat IS NOT NULL THEN
      SELECT * INTO v_rec FROM pos_prep_sla
        WHERE user_id=_owner AND scope='category' AND category_id=v_cat LIMIT 1;
      IF FOUND THEN
        RETURN CASE WHEN v_rec.is_instant THEN 0 ELSE v_rec.target_minutes END;
      END IF;
    END IF;
  END IF;
  SELECT * INTO v_rec FROM pos_prep_sla WHERE user_id=_owner AND scope='default' LIMIT 1;
  IF FOUND THEN
    RETURN CASE WHEN v_rec.is_instant THEN 0 ELSE v_rec.target_minutes END;
  END IF;
  RETURN 8;
END;
$$;

-- ========= 5) Sync function =========
CREATE OR REPLACE FUNCTION public.pos_sync_order_tracking(_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  o record;
  v_printed timestamptz;
  v_max int;
BEGIN
  SELECT * INTO o FROM pos_orders WHERE id = _order_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF o.state = 'cancelled' OR o.cancelled_at IS NOT NULL THEN
    UPDATE pos_order_tracking
      SET is_cancelled = true,
          delivered_at = COALESCE(delivered_at, now()),
          is_late = false
      WHERE order_id = _order_id AND delivered_at IS NULL;
    RETURN;
  END IF;

  v_printed := COALESCE(o.receipt_last_print_at, o.paid_at, o.created_at);

  INSERT INTO pos_order_tracking (
    order_id, user_id, company_id, branch_id, business_date,
    order_number, display_number, order_type, printed_at, target_minutes
  ) VALUES (
    o.id, o.user_id, o.company_id, o.branch_id, COALESCE(o.business_date, (v_printed AT TIME ZONE 'Asia/Jerusalem')::date),
    o.order_number, COALESCE(o.display_number, o.daily_display_number::text), o.order_type, v_printed, 8
  )
  ON CONFLICT (order_id) DO NOTHING;

  INSERT INTO pos_order_item_tracking (
    order_line_id, order_id, user_id, company_id, branch_id, business_date,
    product_id, product_name, qty, printed_at, target_minutes
  )
  SELECT l.id, o.id, o.user_id, o.company_id, o.branch_id,
         COALESCE(o.business_date, (v_printed AT TIME ZONE 'Asia/Jerusalem')::date),
         l.product_id, l.product_name, l.qty, v_printed,
         pos_resolve_target_minutes(o.user_id, l.product_id)
  FROM pos_order_lines l
  WHERE l.order_id = o.id
  ON CONFLICT (order_line_id) DO NOTHING;

  SELECT COALESCE(MAX(target_minutes), 8) INTO v_max
    FROM pos_order_item_tracking WHERE order_id = o.id;
  UPDATE pos_order_tracking SET target_minutes = v_max WHERE order_id = o.id AND delivered_at IS NULL;
END;
$$;

-- ========= 6) Triggers =========
CREATE OR REPLACE FUNCTION public.trg_pos_orders_tracking_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pos_sync_order_tracking(NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pos_orders_tracking_print
AFTER INSERT OR UPDATE OF receipt_last_print_at, paid_at, state, cancelled_at ON public.pos_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_pos_orders_tracking_sync();

CREATE OR REPLACE FUNCTION public.trg_pos_order_lines_tracking_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pos_order_tracking WHERE order_id = NEW.order_id) THEN
    PERFORM pos_sync_order_tracking(NEW.order_id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pos_order_lines_tracking
AFTER INSERT ON public.pos_order_lines
FOR EACH ROW EXECUTE FUNCTION public.trg_pos_order_lines_tracking_sync();

-- ========= 7) Delivery marking =========
CREATE OR REPLACE FUNCTION public.pos_mark_item_delivered(_line_id uuid, _by_name text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  SELECT * INTO r FROM pos_order_item_tracking WHERE order_line_id=_line_id;
  IF NOT FOUND OR r.delivered_at IS NOT NULL THEN RETURN; END IF;
  UPDATE pos_order_item_tracking
    SET delivered_at = now(),
        delivered_by_name = COALESCE(_by_name, delivered_by_name),
        elapsed_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - printed_at))::int),
        is_late = (EXTRACT(EPOCH FROM (now() - printed_at)) > target_minutes * 60)
    WHERE order_line_id = _line_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_mark_order_delivered(_order_id uuid, _by_name text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  UPDATE pos_order_item_tracking
    SET delivered_at = now(),
        delivered_by_name = COALESCE(_by_name, delivered_by_name),
        elapsed_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - printed_at))::int),
        is_late = (EXTRACT(EPOCH FROM (now() - printed_at)) > target_minutes * 60)
    WHERE order_id = _order_id AND delivered_at IS NULL;

  SELECT * INTO r FROM pos_order_tracking WHERE order_id=_order_id;
  IF NOT FOUND OR r.delivered_at IS NOT NULL THEN RETURN; END IF;
  UPDATE pos_order_tracking
    SET delivered_at = now(),
        delivered_by_name = COALESCE(_by_name, delivered_by_name),
        delivered_by_user = auth.uid(),
        elapsed_seconds = GREATEST(0, EXTRACT(EPOCH FROM (now() - printed_at))::int),
        is_late = (EXTRACT(EPOCH FROM (now() - printed_at)) > target_minutes * 60)
    WHERE order_id = _order_id;
END;
$$;

-- ========= 8) Public branch board =========
CREATE OR REPLACE FUNCTION public.get_branch_tracking_board(_slug text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b record;
  v_logo text;
  v_company text;
  v_orders jsonb;
BEGIN
  SELECT * INTO b FROM branches WHERE public_slug = _slug LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  SELECT logo_url, name INTO v_logo, v_company FROM companies WHERE owner_id = b.user_id LIMIT 1;
  IF v_logo IS NULL THEN
    SELECT logo_url INTO v_logo FROM company_settings WHERE user_id = b.user_id LIMIT 1;
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'printed_at'), '[]'::jsonb) INTO v_orders
  FROM (
    SELECT jsonb_build_object(
      'order_id', t.order_id,
      'order_number', t.order_number,
      'display_number', t.display_number,
      'order_type', t.order_type,
      'printed_at', t.printed_at,
      'delivered_at', t.delivered_at,
      'target_minutes', t.target_minutes,
      'elapsed_seconds', t.elapsed_seconds,
      'is_late', t.is_late,
      'items', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'line_id', i.order_line_id,
          'product_name', i.product_name,
          'qty', i.qty,
          'printed_at', i.printed_at,
          'delivered_at', i.delivered_at,
          'target_minutes', i.target_minutes,
          'elapsed_seconds', i.elapsed_seconds,
          'is_late', i.is_late
        ) ORDER BY i.created_at), '[]'::jsonb)
        FROM pos_order_item_tracking i WHERE i.order_id = t.order_id
      )
    ) AS x
    FROM pos_order_tracking t
    WHERE t.branch_id = b.id
      AND t.is_cancelled = false
      AND t.printed_at > now() - interval '12 hours'
      AND (t.delivered_at IS NULL OR t.delivered_at > now() - interval '30 minutes')
    ORDER BY t.printed_at
    LIMIT 200
  ) s;

  RETURN jsonb_build_object(
    'branch_id', b.id,
    'branch_name', b.name,
    'company_name', v_company,
    'logo_url', v_logo,
    'orders', v_orders
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_branch_tracking_delivered(_slug text, _order_id uuid, _line_id uuid DEFAULT NULL, _by_name text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b record;
BEGIN
  SELECT * INTO b FROM branches WHERE public_slug = _slug LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  IF _line_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM pos_order_item_tracking WHERE order_line_id=_line_id AND branch_id=b.id) THEN
      RETURN jsonb_build_object('error','forbidden');
    END IF;
    PERFORM pos_mark_item_delivered(_line_id, _by_name);
  ELSE
    IF NOT EXISTS (SELECT 1 FROM pos_order_tracking WHERE order_id=_order_id AND branch_id=b.id) THEN
      RETURN jsonb_build_object('error','forbidden');
    END IF;
    PERFORM pos_mark_order_delivered(_order_id, _by_name);
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_branch_tracking_board(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_branch_tracking_delivered(text, uuid, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_mark_item_delivered(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_mark_order_delivered(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pos_resolve_target_minutes(uuid, uuid) TO authenticated;

-- ========= 9) Realtime =========
ALTER TABLE public.pos_order_tracking REPLICA IDENTITY FULL;
ALTER TABLE public.pos_order_item_tracking REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_order_tracking;
ALTER PUBLICATION supabase_realtime ADD TABLE public.pos_order_item_tracking;

-- ========= 10) Backfill slugs =========
UPDATE public.branches SET public_slug = 'br-' || substr(md5(id::text || random()::text), 1, 10)
WHERE public_slug IS NULL OR public_slug = '';