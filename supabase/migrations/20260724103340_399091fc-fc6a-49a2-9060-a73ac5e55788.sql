
-- Fast dashboard RPCs for marketing campaigns
CREATE OR REPLACE FUNCTION public.get_campaigns_overview(_branch text DEFAULT NULL, _year int DEFAULT NULL)
RETURNS TABLE(
  id uuid, slug text, name text, year int, season text,
  start_date date, end_date date, status text, is_live boolean, pos_category_id uuid,
  total_amount numeric, qty_total numeric, days_count int, branches_count int,
  top_branch text, top_branch_total numeric,
  top_item text, top_item_qty numeric, top_item_total numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT s.*
    FROM marketing_campaign_sales s
    WHERE (_branch IS NULL OR s.branch_name = _branch)
  ),
  totals AS (
    SELECT campaign_id,
           SUM(total_amount)::numeric AS total_amount,
           SUM(COALESCE(qty_take_out,0)+COALESCE(qty_dine_in,0))::numeric AS qty_total,
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
           SUM(COALESCE(qty_take_out,0)+COALESCE(qty_dine_in,0)) AS top_item_qty,
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
  FROM marketing_campaigns c
  LEFT JOIN totals t ON t.campaign_id = c.id
  LEFT JOIN branch_rank br ON br.campaign_id = c.id
  LEFT JOIN item_rank ir ON ir.campaign_id = c.id
  WHERE (_year IS NULL OR c.year = _year)
    AND public.can_view_marketing_campaigns()
  ORDER BY c.start_date NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaigns_overview(text,int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_campaign_details(_campaign_id uuid, _branch text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT public.can_view_marketing_campaigns() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  WITH base AS (
    SELECT * FROM marketing_campaign_sales
    WHERE campaign_id = _campaign_id
      AND (_branch IS NULL OR branch_name = _branch)
  ),
  by_date AS (
    SELECT sale_date::text AS sale_date,
           SUM(total_amount)::numeric AS total,
           SUM(COALESCE(qty_take_out,0)+COALESCE(qty_dine_in,0))::numeric AS qty
    FROM base GROUP BY sale_date ORDER BY sale_date
  ),
  by_branch AS (
    SELECT COALESCE(branch_name,'—') AS branch_name,
           SUM(total_amount)::numeric AS total,
           SUM(COALESCE(qty_take_out,0)+COALESCE(qty_dine_in,0))::numeric AS qty
    FROM base GROUP BY branch_name ORDER BY total DESC
  ),
  by_item AS (
    SELECT item_name,
           SUM(total_amount)::numeric AS total,
           SUM(COALESCE(qty_take_out,0)+COALESCE(qty_dine_in,0))::numeric AS qty
    FROM base GROUP BY item_name ORDER BY total DESC LIMIT 25
  )
  SELECT jsonb_build_object(
    'by_date', COALESCE((SELECT jsonb_agg(to_jsonb(by_date)) FROM by_date), '[]'::jsonb),
    'by_branch', COALESCE((SELECT jsonb_agg(to_jsonb(by_branch)) FROM by_branch), '[]'::jsonb),
    'by_item', COALESCE((SELECT jsonb_agg(to_jsonb(by_item)) FROM by_item), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_campaign_details(uuid,text) TO authenticated;

-- Distinct branches list for filter dropdown (fast)
CREATE OR REPLACE FUNCTION public.get_campaign_branches()
RETURNS TABLE(branch_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT branch_name FROM marketing_campaign_sales
  WHERE branch_name IS NOT NULL AND public.can_view_marketing_campaigns()
  ORDER BY branch_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaign_branches() TO authenticated;
