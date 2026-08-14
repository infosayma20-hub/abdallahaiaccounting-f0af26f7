
CREATE OR REPLACE FUNCTION public.get_portal_loyalty_stats(p_owner uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allowed boolean;
  v_result jsonb;
BEGIN
  SELECT (auth.uid() = p_owner) OR EXISTS (
    SELECT 1 FROM public.malaki_portal_users mpu
    WHERE mpu.auth_user_id = auth.uid() AND mpu.user_id = p_owner AND mpu.is_active
  ) INTO v_allowed;

  IF NOT COALESCE(v_allowed, false) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  WITH progs AS (
    SELECT id, name FROM public.loyalty_programs WHERE user_id = p_owner
  ),
  mem AS (
    SELECT m.* FROM public.loyalty_members m JOIN progs p ON p.id = m.program_id
  ),
  visits AS (
    SELECT o.contact_id, count(*)::int AS visits, COALESCE(sum(o.total),0)::numeric AS spend
    FROM public.orders o
    WHERE o.user_id = p_owner
      AND o.contact_id IS NOT NULL
      AND o.contact_id IN (SELECT contact_id FROM mem WHERE contact_id IS NOT NULL)
      AND COALESCE(o.status,'') <> 'cancelled'
    GROUP BY o.contact_id
  )
  SELECT jsonb_build_object(
    'programs', (SELECT count(*) FROM progs),
    'members_total', (SELECT count(*) FROM mem),
    'members_active', (SELECT count(*) FROM mem WHERE is_active),
    'members_new_30d', (SELECT count(*) FROM mem WHERE joined_at >= now() - interval '30 days'),
    'points_total', (SELECT COALESCE(sum(points_balance),0) FROM mem),
    'visits_total', (SELECT COALESCE(sum(visits),0) FROM visits),
    'spend_total', (SELECT COALESCE(sum(spend),0) FROM visits),
    'visitors_30d', (SELECT count(*) FROM mem WHERE last_visit_at >= now() - interval '30 days'),
    'top_members', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT
          trim(COALESCE(m.first_name,'') || ' ' || COALESCE(m.last_name,'')) AS name,
          m.phone_e164 AS phone,
          m.card_code,
          COALESCE(m.points_balance,0) AS points,
          COALESCE(v.visits,0) AS visits,
          COALESCE(v.spend,0) AS spend,
          m.last_visit_at
        FROM mem m LEFT JOIN visits v ON v.contact_id = m.contact_id
        ORDER BY COALESCE(m.points_balance,0) DESC, COALESCE(v.visits,0) DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_loyalty_stats(uuid) TO authenticated;
