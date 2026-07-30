CREATE TABLE public.historical_sales_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  sale_date date NOT NULL,
  branch_id uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  cash_box_id uuid REFERENCES public.cash_boxes(id) ON DELETE SET NULL,
  outlet_label text,
  total numeric NOT NULL DEFAULT 0,
  cash numeric,
  card numeric,
  credit numeric,
  orders_count integer,
  source text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX historical_sales_daily_unique_key
  ON public.historical_sales_daily (
    user_id,
    sale_date,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(cash_box_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX historical_sales_daily_user_date_idx
  ON public.historical_sales_daily (user_id, sale_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.historical_sales_daily TO authenticated;
GRANT ALL ON public.historical_sales_daily TO service_role;

ALTER TABLE public.historical_sales_daily ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_historical_sales(_owner uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.malaki_portal_users mpu
        WHERE mpu.auth_user_id = auth.uid()
          AND mpu.user_id = _owner
          AND mpu.role = 'owner'
          AND mpu.is_active = true
      );
$$;

CREATE POLICY "historical_sales_select"
  ON public.historical_sales_daily
  FOR SELECT TO authenticated
  USING (public.can_view_historical_sales(user_id));

CREATE POLICY "historical_sales_admin_write"
  ON public.historical_sales_daily
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER historical_sales_daily_set_updated_at
  BEFORE UPDATE ON public.historical_sales_daily
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_historical_sales_range(
  p_user_id uuid,
  p_from date,
  p_to date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total numeric := 0;
  v_count integer := 0;
  v_branches jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.can_view_historical_sales(p_user_id) THEN
    RETURN jsonb_build_object('allowed', false, 'total', 0, 'orderCount', 0, 'byBranch', '[]'::jsonb);
  END IF;

  SELECT COALESCE(SUM(h.total), 0), COALESCE(SUM(COALESCE(h.orders_count, 0)), 0)
    INTO v_total, v_count
  FROM public.historical_sales_daily h
  WHERE h.user_id = p_user_id AND h.sale_date BETWEEN p_from AND p_to;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'name'), '[]'::jsonb) INTO v_branches
  FROM (
    SELECT jsonb_build_object(
             'id', COALESCE(h.branch_id::text, '__no_branch__'),
             'name', COALESCE(NULLIF(h.outlet_label, ''), br.name, 'بدون فرع'),
             'location', '',
             'total', SUM(h.total),
             'orderCount', COALESCE(SUM(h.orders_count), 0)
           ) AS x
    FROM public.historical_sales_daily h
    LEFT JOIN public.branches br ON br.id = h.branch_id
    WHERE h.user_id = p_user_id AND h.sale_date BETWEEN p_from AND p_to
    GROUP BY COALESCE(NULLIF(h.outlet_label, ''), br.name, 'بدون فرع'), h.branch_id
  ) s;

  RETURN jsonb_build_object(
    'allowed', true,
    'total', v_total,
    'posTotal', v_total,
    'invTotal', 0,
    'orderCount', v_count,
    'byBranch', v_branches,
    'byItem', '[]'::jsonb,
    'byCashier', '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_historical_sales_range(uuid, date, date) TO authenticated, service_role;