
CREATE OR REPLACE FUNCTION public.get_campaigns_daily(_campaign_ids uuid[], _branch text DEFAULT NULL)
RETURNS TABLE(campaign_id uuid, sale_date date, branch_name text, total_amount numeric, qty_total numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.campaign_id, s.sale_date, s.branch_name,
         SUM(s.total_amount)::numeric,
         SUM(COALESCE(s.qty_take_out,0)+COALESCE(s.qty_dine_in,0))::numeric
  FROM marketing_campaign_sales s
  WHERE s.campaign_id = ANY(_campaign_ids)
    AND (_branch IS NULL OR s.branch_name = _branch)
    AND public.can_view_marketing_campaigns()
  GROUP BY s.campaign_id, s.sale_date, s.branch_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_campaigns_daily(uuid[], text) TO authenticated;
