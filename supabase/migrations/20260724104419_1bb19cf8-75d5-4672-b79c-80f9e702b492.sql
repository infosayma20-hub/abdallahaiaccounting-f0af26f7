
-- 1) Merge Tawjihi Broast 2025 + Crispy 2025 into a single Tawjihi 2025 campaign
UPDATE public.marketing_campaign_sales
SET campaign_id = '1daba0e2-e4ce-4236-99fc-d8c546b67486'
WHERE campaign_id = '367847d9-6bdc-4f58-9b01-2d27b45085e1';

UPDATE public.marketing_campaigns
SET name = 'توجيهي 2025',
    slug = 'tawjihi-2025',
    end_date = GREATEST(end_date, '2025-09-11'::date),
    updated_at = now()
WHERE id = '1daba0e2-e4ce-4236-99fc-d8c546b67486';

DELETE FROM public.marketing_campaigns
WHERE id = '367847d9-6bdc-4f58-9b01-2d27b45085e1';

-- 2) Unified sales view (historical CSV rows + live POS rows for is_live campaigns)
CREATE OR REPLACE VIEW public.v_campaign_sales_unified
WITH (security_invoker=on) AS
SELECT
  s.campaign_id,
  s.sale_date,
  s.branch_name,
  s.item_name,
  s.total_amount,
  (COALESCE(s.qty_take_out,0) + COALESCE(s.qty_dine_in,0))::numeric AS qty
FROM public.marketing_campaign_sales s
JOIN public.marketing_campaigns c
  ON c.id = s.campaign_id AND COALESCE(c.is_live,false) = false
UNION ALL
SELECT
  c.id AS campaign_id,
  o.business_date AS sale_date,
  CASE
    WHEN b.name ILIKE '%طيرة%' OR b.name ILIKE '%رام الله%' THEN 'فرع رام الله الطيرة'
    WHEN b.name ILIKE '%فيصل%' THEN 'شارع فيصل'
    WHEN b.name ILIKE '%سفيان%' THEN 'شارع سفيان'
    ELSE COALESCE(b.name,'—')
  END AS branch_name,
  p.name AS item_name,
  ol.total::numeric AS total_amount,
  ol.qty::numeric   AS qty
FROM public.marketing_campaigns c
JOIN public.pos_orders o
  ON o.business_date >= c.start_date
 AND (c.end_date IS NULL OR o.business_date <= c.end_date)
 AND o.state NOT IN ('cancelled','voided','deleted','draft')
 AND o.business_date IS NOT NULL
JOIN public.pos_order_lines ol ON ol.order_id = o.id
JOIN public.products p
  ON p.id = ol.product_id AND p.pos_category_id = c.pos_category_id
LEFT JOIN public.branches b ON b.id = o.branch_id
WHERE COALESCE(c.is_live,false) = true AND c.pos_category_id IS NOT NULL;

GRANT SELECT ON public.v_campaign_sales_unified TO authenticated, service_role;

-- 3) Rewrite overview / daily / details RPCs to use the unified view
CREATE OR REPLACE FUNCTION public.get_campaigns_overview(_branch text DEFAULT NULL::text, _year integer DEFAULT NULL::integer)
RETURNS TABLE(id uuid, slug text, name text, year integer, season text, start_date date, end_date date, status text, is_live boolean, pos_category_id uuid, total_amount numeric, qty_total numeric, days_count integer, branches_count integer, top_branch text, top_branch_total numeric, top_item text, top_item_qty numeric, top_item_total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH base AS (
    SELECT s.*
    FROM public.v_campaign_sales_unified s
    WHERE (_branch IS NULL OR s.branch_name = _branch)
  ),
  totals AS (
    SELECT campaign_id,
           SUM(total_amount)::numeric AS total_amount,
           SUM(qty)::numeric AS qty_total,
           COUNT(DISTINCT sale_date)::int AS days_count,
           COUNT(DISTINCT branch_name)::int AS branches_count
    FROM base GROUP BY campaign_id
  ),
  branch_rank AS (
    SELECT DISTINCT ON (campaign_id) campaign_id, branch_name AS top_branch, SUM(total_amount) AS top_branch_total
    FROM base WHERE branch_name IS NOT NULL
    GROUP BY campaign_id, branch_name
    ORDER BY campaign_id, SUM(total_amount) DESC
  ),
  item_rank AS (
    SELECT DISTINCT ON (campaign_id) campaign_id, item_name AS top_item,
           SUM(qty) AS top_item_qty,
           SUM(total_amount) AS top_item_total
    FROM base
    GROUP BY campaign_id, item_name
    ORDER BY campaign_id, SUM(total_amount) DESC
  )
  SELECT c.id, c.slug, c.name, c.year, c.season, c.start_date, c.end_date, c.status,
         c.is_live, c.pos_category_id,
         COALESCE(t.total_amount,0), COALESCE(t.qty_total,0),
         COALESCE(t.days_count,0), COALESCE(t.branches_count,0),
         br.top_branch, COALESCE(br.top_branch_total,0),
         ir.top_item, COALESCE(ir.top_item_qty,0), COALESCE(ir.top_item_total,0)
  FROM public.marketing_campaigns c
  LEFT JOIN totals t ON t.campaign_id = c.id
  LEFT JOIN branch_rank br ON br.campaign_id = c.id
  LEFT JOIN item_rank ir ON ir.campaign_id = c.id
  WHERE (_year IS NULL OR c.year = _year)
    AND public.can_view_marketing_campaigns()
  ORDER BY c.start_date NULLS LAST;
$$;

CREATE OR REPLACE FUNCTION public.get_campaigns_daily(_campaign_ids uuid[], _branch text DEFAULT NULL::text)
RETURNS TABLE(campaign_id uuid, sale_date date, branch_name text, total_amount numeric, qty_total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT s.campaign_id, s.sale_date, s.branch_name,
         SUM(s.total_amount)::numeric,
         SUM(s.qty)::numeric
  FROM public.v_campaign_sales_unified s
  WHERE s.campaign_id = ANY(_campaign_ids)
    AND (_branch IS NULL OR s.branch_name = _branch)
    AND public.can_view_marketing_campaigns()
  GROUP BY s.campaign_id, s.sale_date, s.branch_name;
$$;

CREATE OR REPLACE FUNCTION public.get_campaign_details(_campaign_id uuid, _branch text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.can_view_marketing_campaigns() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH base AS (
    SELECT * FROM public.v_campaign_sales_unified
    WHERE campaign_id = _campaign_id
      AND (_branch IS NULL OR branch_name = _branch)
  ),
  by_date AS (
    SELECT sale_date::text AS sale_date,
           SUM(total_amount)::numeric AS total,
           SUM(qty)::numeric AS qty
    FROM base GROUP BY sale_date ORDER BY sale_date
  ),
  by_branch AS (
    SELECT COALESCE(branch_name,'—') AS branch_name,
           SUM(total_amount)::numeric AS total,
           SUM(qty)::numeric AS qty
    FROM base GROUP BY branch_name ORDER BY SUM(total_amount) DESC
  ),
  by_item AS (
    SELECT item_name,
           SUM(total_amount)::numeric AS total,
           SUM(qty)::numeric AS qty
    FROM base GROUP BY item_name ORDER BY SUM(total_amount) DESC LIMIT 25
  )
  SELECT jsonb_build_object(
    'by_date',   COALESCE((SELECT jsonb_agg(to_jsonb(by_date))   FROM by_date),   '[]'::jsonb),
    'by_branch', COALESCE((SELECT jsonb_agg(to_jsonb(by_branch)) FROM by_branch), '[]'::jsonb),
    'by_item',   COALESCE((SELECT jsonb_agg(to_jsonb(by_item))   FROM by_item),   '[]'::jsonb)
  ) INTO result;

  RETURN result;
END; $$;
