-- 1) Add link fields to marketing_campaigns
ALTER TABLE public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS pos_category_id uuid,
  ADD COLUMN IF NOT EXISTS is_live boolean NOT NULL DEFAULT false;

-- 2) Insert Tawjihi 2026 live campaign (idempotent)
INSERT INTO public.marketing_campaigns (slug, name, year, season, start_date, end_date, status, is_live, pos_category_id)
VALUES (
  'tawjihi-2026-live',
  'توجيهي 2026',
  2026,
  'tawjihi',
  '2026-07-23',
  NULL,
  'active',
  true,
  '48ceb4e5-ee5f-43e7-befe-bce0d8fc247f'
)
ON CONFLICT (slug) DO UPDATE
  SET pos_category_id = EXCLUDED.pos_category_id,
      is_live = true,
      name = EXCLUDED.name,
      season = EXCLUDED.season,
      year = EXCLUDED.year,
      start_date = EXCLUDED.start_date,
      status = EXCLUDED.status;

-- 3) RPC: daily live campaign sales, branch-normalized
CREATE OR REPLACE FUNCTION public.get_live_campaign_daily(_pos_category_id uuid)
RETURNS TABLE(
  sale_date date,
  branch_name text,
  orders_count integer,
  qty numeric,
  total numeric
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    o.business_date AS sale_date,
    CASE
      WHEN b.name ILIKE '%طيرة%' OR b.name ILIKE '%رام الله%' THEN 'فرع رام الله الطيرة'
      WHEN b.name ILIKE '%فيصل%'  THEN 'شارع فيصل'
      WHEN b.name ILIKE '%سفيان%' THEN 'شارع سفيان'
      ELSE COALESCE(b.name, '—')
    END AS branch_name,
    COUNT(DISTINCT o.id)::int AS orders_count,
    COALESCE(SUM(ol.qty), 0)::numeric AS qty,
    COALESCE(SUM(ol.total), 0)::numeric AS total
  FROM public.pos_orders o
  JOIN public.pos_order_lines ol ON ol.order_id = o.id
  JOIN public.products p ON p.id = ol.product_id
  LEFT JOIN public.branches b ON b.id = o.branch_id
  WHERE p.pos_category_id = _pos_category_id
    AND o.state NOT IN ('cancelled','voided','deleted','draft')
    AND o.business_date IS NOT NULL
  GROUP BY 1, 2
  ORDER BY 1, 2;
$$;

GRANT EXECUTE ON FUNCTION public.get_live_campaign_daily(uuid) TO authenticated;