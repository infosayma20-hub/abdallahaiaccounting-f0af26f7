
-- 1) holdings
CREATE TABLE IF NOT EXISTS public.holdings (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                text NOT NULL UNIQUE,
  name_ar             text NOT NULL,
  name_en             text,
  logo_url            text,
  login_background_url text,
  primary_color       text NOT NULL DEFAULT '#0D1B2E',
  secondary_color     text NOT NULL DEFAULT '#FFFFFF',
  presentation_currency text NOT NULL DEFAULT 'ILS',
  created_by          uuid NOT NULL DEFAULT auth.uid(),
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.holdings IS 'الكيان القابض: يجمع عدة دفاتر (owner_ids) تحت هوية ودخول واحد، مع عملة عرض موحّدة.';

-- 2) holding_companies
CREATE TABLE IF NOT EXISTS public.holding_companies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id      uuid NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  owner_id        uuid NOT NULL,
  company_id      uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  display_name_ar text NOT NULL,
  sector          text,
  sort_order      integer NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holding_id, owner_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_holding_companies_owner
  ON public.holding_companies (owner_id);
COMMENT ON TABLE public.holding_companies IS 'يربط القابضة بدفاتر الشركات الفرعية عبر owner_id (مدار العزل الحقيقي).';

-- 3) holding_members
CREATE TABLE IF NOT EXISTS public.holding_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id    uuid NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  auth_user_id  uuid NOT NULL,
  role          text NOT NULL DEFAULT 'holding_admin'
                CHECK (role IN ('holding_admin','holding_viewer')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (holding_id, auth_user_id)
);
COMMENT ON TABLE public.holding_members IS 'صلاحية الوصول لطبقة القابضة.';

-- 4) active_owner_context
CREATE TABLE IF NOT EXISTS public.active_owner_context (
  auth_user_id  uuid PRIMARY KEY,
  holding_id    uuid NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  owner_id      uuid NOT NULL,
  set_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.active_owner_context IS 'الشركة الفرعية المختارة حالياً.';

-- GRANTS
GRANT SELECT, INSERT, UPDATE          ON public.holdings             TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.holding_companies    TO authenticated;
GRANT SELECT                          ON public.holding_members      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.active_owner_context TO authenticated;
GRANT ALL ON public.holdings, public.holding_companies,
             public.holding_members, public.active_owner_context TO service_role;

-- 5) is_holding_member
CREATE OR REPLACE FUNCTION public.is_holding_member(_holding_id uuid, _uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.holding_members hm
    WHERE hm.holding_id = _holding_id AND hm.auth_user_id = _uid
  );
$$;

-- Trigger: creator becomes holding_admin
CREATE OR REPLACE FUNCTION public.tg_holdings_add_creator_member()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.holding_members (holding_id, auth_user_id, role)
  VALUES (NEW.id, NEW.created_by, 'holding_admin')
  ON CONFLICT (holding_id, auth_user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_holdings_add_creator ON public.holdings;
CREATE TRIGGER trg_holdings_add_creator
  AFTER INSERT ON public.holdings
  FOR EACH ROW EXECUTE FUNCTION public.tg_holdings_add_creator_member();

-- 6) RLS
ALTER TABLE public.holdings             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holding_companies    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holding_members      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.active_owner_context ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS holdings_member_rw ON public.holdings;
CREATE POLICY holdings_member_rw ON public.holdings
  USING (public.is_holding_member(id))
  WITH CHECK (public.is_holding_member(id) OR created_by = auth.uid());

DROP POLICY IF EXISTS holding_companies_member_rw ON public.holding_companies;
CREATE POLICY holding_companies_member_rw ON public.holding_companies
  USING (public.is_holding_member(holding_id))
  WITH CHECK (public.is_holding_member(holding_id));

DROP POLICY IF EXISTS holding_members_read ON public.holding_members;
CREATE POLICY holding_members_read ON public.holding_members
  USING (public.is_holding_member(holding_id));

DROP POLICY IF EXISTS aoc_self ON public.active_owner_context;
CREATE POLICY aoc_self ON public.active_owner_context
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- get_holding_branding_by_slug
CREATE OR REPLACE FUNCTION public.get_holding_branding_by_slug(p_slug text)
RETURNS TABLE (
  id uuid, slug text, name_ar text, name_en text,
  logo_url text, login_background_url text,
  primary_color text, secondary_color text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT h.id, h.slug, h.name_ar, h.name_en,
         h.logo_url, h.login_background_url,
         h.primary_color, h.secondary_color
  FROM public.holdings h
  WHERE h.slug = p_slug AND h.is_active = true
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.get_holding_branding_by_slug(text) TO anon, authenticated;

-- add_holding_member
CREATE OR REPLACE FUNCTION public.add_holding_member(
  p_holding_id     uuid,
  p_target_user_id uuid,
  p_role           text DEFAULT 'holding_viewer'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF p_role NOT IN ('holding_admin','holding_viewer') THEN
    RAISE EXCEPTION 'INVALID_ROLE: %', p_role USING ERRCODE = '22023';
  END IF;
  IF NOT (
    EXISTS (
      SELECT 1 FROM public.holding_members hm
      WHERE hm.holding_id = p_holding_id
        AND hm.auth_user_id = auth.uid()
        AND hm.role = 'holding_admin'
    )
    OR public.has_role(auth.uid(), 'super_admin'::app_role)
  ) THEN
    RAISE EXCEPTION 'ACCESS_DENIED: only a holding_admin or super_admin may add members'
      USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.holding_members (holding_id, auth_user_id, role)
  VALUES (p_holding_id, p_target_user_id, p_role)
  ON CONFLICT (holding_id, auth_user_id) DO UPDATE SET role = EXCLUDED.role;
END;
$$;
GRANT EXECUTE ON FUNCTION public.add_holding_member(uuid, uuid, text) TO authenticated;

-- 7) Consolidated trial balance
CREATE OR REPLACE FUNCTION public.holding_consolidated_trial_balance(
  p_holding_id uuid, p_from date, p_to date
)
RETURNS TABLE (
  account_code text, account_name text,
  total_debit numeric, total_credit numeric, balance numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_holding_member(p_holding_id, auth.uid()) THEN
    RAISE EXCEPTION 'ACCESS_DENIED: not a member of holding %', p_holding_id
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH owners AS (
    SELECT hc.owner_id FROM public.holding_companies hc
    WHERE hc.holding_id = p_holding_id AND hc.is_active
  ),
  legs AS (
    SELECT t.debit_account_code AS code, t.amount AS dr, 0::numeric AS cr
    FROM public.transactions t JOIN owners o ON o.owner_id = t.user_id
    WHERE COALESCE(t.is_deleted,false)=false
      AND t.transaction_date BETWEEN p_from AND p_to
      AND t.debit_account_code IS NOT NULL
    UNION ALL
    SELECT t.credit_account_code, 0::numeric, t.amount
    FROM public.transactions t JOIN owners o ON o.owner_id = t.user_id
    WHERE COALESCE(t.is_deleted,false)=false
      AND t.transaction_date BETWEEN p_from AND p_to
      AND t.credit_account_code IS NOT NULL
  ),
  agg AS (SELECT code, SUM(dr) AS total_debit, SUM(cr) AS total_credit
          FROM legs GROUP BY code),
  names AS (
    SELECT DISTINCT ON (a.account_code) a.account_code, a.account_name
    FROM public.accounts a JOIN owners o ON o.owner_id = a.user_id
    ORDER BY a.account_code, a.account_name
  )
  SELECT agg.code, COALESCE(n.account_name, agg.code),
         agg.total_debit, agg.total_credit,
         (agg.total_debit - agg.total_credit)
  FROM agg LEFT JOIN names n ON n.account_code = agg.code
  ORDER BY agg.code;
END;
$$;
GRANT EXECUTE ON FUNCTION public.holding_consolidated_trial_balance(uuid,date,date) TO authenticated;

-- 8) Subsidiary drill-down trial balance
CREATE OR REPLACE FUNCTION public.holding_subsidiary_trial_balance(
  p_holding_id uuid, p_owner_id uuid, p_from date, p_to date
)
RETURNS TABLE (
  account_code text, account_name text,
  total_debit numeric, total_credit numeric, balance numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_holding_member(p_holding_id, auth.uid()) THEN
    RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.holding_companies hc
    WHERE hc.holding_id = p_holding_id AND hc.owner_id = p_owner_id AND hc.is_active
  ) THEN
    RAISE EXCEPTION 'OWNER_NOT_IN_HOLDING' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH legs AS (
    SELECT t.debit_account_code AS code, t.amount AS dr, 0::numeric AS cr
    FROM public.transactions t
    WHERE t.user_id = p_owner_id AND COALESCE(t.is_deleted,false)=false
      AND t.transaction_date BETWEEN p_from AND p_to AND t.debit_account_code IS NOT NULL
    UNION ALL
    SELECT t.credit_account_code, 0::numeric, t.amount
    FROM public.transactions t
    WHERE t.user_id = p_owner_id AND COALESCE(t.is_deleted,false)=false
      AND t.transaction_date BETWEEN p_from AND p_to AND t.credit_account_code IS NOT NULL
  ),
  agg AS (SELECT code, SUM(dr) td, SUM(cr) tc FROM legs GROUP BY code)
  SELECT agg.code, COALESCE(a.account_name, agg.code), agg.td, agg.tc, (agg.td - agg.tc)
  FROM agg
  LEFT JOIN public.accounts a ON a.account_code = agg.code AND a.user_id = p_owner_id
  ORDER BY agg.code;
END;
$$;
GRANT EXECUTE ON FUNCTION public.holding_subsidiary_trial_balance(uuid,uuid,date,date) TO authenticated;
