ALTER TABLE public.loyalty_members
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_loyalty_members_contact ON public.loyalty_members(contact_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_members_card_code ON public.loyalty_members(upper(card_code));

-- بطاقة عامة للزبون (تُقرأ بدون تسجيل دخول عبر رقم البطاقة فقط)
CREATE OR REPLACE FUNCTION public.loyalty_card_public(_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_m public.loyalty_members%ROWTYPE;
  v_p public.loyalty_programs%ROWTYPE;
  v_balance numeric := 0;
  v_currency text := 'ILS';
BEGIN
  IF _code IS NULL OR length(trim(_code)) < 4 THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_m FROM public.loyalty_members
   WHERE upper(card_code) = upper(trim(_code)) AND is_active = true
   LIMIT 1;
  IF v_m.id IS NULL THEN RETURN NULL; END IF;

  SELECT * INTO v_p FROM public.loyalty_programs WHERE id = v_m.program_id;

  IF v_m.contact_id IS NOT NULL THEN
    SELECT w.balance, w.currency INTO v_balance, v_currency
      FROM public.customer_wallets w WHERE w.contact_id = v_m.contact_id LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'card_code', v_m.card_code,
    'first_name', v_m.first_name,
    'last_name', v_m.last_name,
    'points', COALESCE(v_m.points_balance, 0),
    'joined_at', v_m.joined_at,
    'wallet_balance', COALESCE(v_balance, 0),
    'currency', COALESCE(v_currency, 'ILS'),
    'program', jsonb_build_object(
      'name', v_p.name,
      'slug', v_p.slug,
      'tagline', v_p.tagline,
      'logo_url', v_p.logo_url,
      'cover_url', v_p.cover_url,
      'brand_color', v_p.brand_color,
      'accent_color', v_p.accent_color,
      'currency_code', v_p.currency_code
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.loyalty_card_public(text) FROM public;
GRANT EXECUTE ON FUNCTION public.loyalty_card_public(text) TO anon, authenticated;

-- استحضار الزبون على الكاش عند مسح البطاقة
CREATE OR REPLACE FUNCTION public.pos_scan_customer_card(_code text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner uuid;
  v_contact_id uuid;
  v_member public.loyalty_members%ROWTYPE;
  v_name text; v_phone text;
  v_wallet public.customer_wallets%ROWTYPE;
  v_q text;
BEGIN
  v_owner := public.get_team_owner_id(auth.uid());
  IF v_owner IS NULL THEN RETURN NULL; END IF;
  v_q := upper(trim(COALESCE(_code, '')));
  IF length(v_q) < 4 THEN RETURN NULL; END IF;

  -- 1) بطاقة محفظة
  SELECT * INTO v_wallet FROM public.customer_wallets
   WHERE user_id = v_owner AND upper(card_code) = v_q LIMIT 1;
  IF v_wallet.id IS NOT NULL THEN
    v_contact_id := v_wallet.contact_id;
  END IF;

  -- 2) بطاقة ولاء
  IF v_contact_id IS NULL THEN
    SELECT * INTO v_member FROM public.loyalty_members
     WHERE user_id = v_owner AND upper(card_code) = v_q AND is_active = true LIMIT 1;
    IF v_member.id IS NOT NULL THEN
      v_contact_id := v_member.contact_id;
    END IF;
  END IF;

  -- 3) رقم جوال
  IF v_contact_id IS NULL AND v_q ~ '^[0-9+]{6,}$' THEN
    SELECT id INTO v_contact_id FROM public.contacts
     WHERE user_id = v_owner AND replace(COALESCE(phone,''), ' ', '') LIKE '%' || regexp_replace(v_q, '^\+?0*', '') || '%'
     LIMIT 1;
  END IF;

  IF v_contact_id IS NULL AND v_member.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_contact_id IS NOT NULL THEN
    SELECT contact_name, phone INTO v_name, v_phone FROM public.contacts WHERE id = v_contact_id;
    IF v_wallet.id IS NULL THEN
      SELECT * INTO v_wallet FROM public.customer_wallets
       WHERE user_id = v_owner AND contact_id = v_contact_id LIMIT 1;
    END IF;
    IF v_member.id IS NULL THEN
      SELECT * INTO v_member FROM public.loyalty_members
       WHERE user_id = v_owner AND contact_id = v_contact_id AND is_active = true LIMIT 1;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'contact_id', v_contact_id,
    'contact_name', COALESCE(v_name, trim(COALESCE(v_member.first_name,'') || ' ' || COALESCE(v_member.last_name,''))),
    'phone', COALESCE(v_phone, v_member.phone_e164),
    'wallet_id', v_wallet.id,
    'wallet_card_code', v_wallet.card_code,
    'wallet_balance', COALESCE(v_wallet.balance, 0),
    'wallet_frozen', COALESCE(v_wallet.is_frozen, false),
    'loyalty_card_code', v_member.card_code,
    'loyalty_points', COALESCE(v_member.points_balance, 0)
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.pos_scan_customer_card(text) FROM public;
GRANT EXECUTE ON FUNCTION public.pos_scan_customer_card(text) TO authenticated;