
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.malaki_portal_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT DEFAULT 'viewer',
  can_see_sales BOOLEAN DEFAULT true,
  can_see_liquidity BOOLEAN DEFAULT true,
  can_see_all_branches BOOLEAN DEFAULT true,
  allowed_branch_ids UUID[],
  last_login TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE public.malaki_portal_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  linked_user_id UUID,
  company_name TEXT DEFAULT 'الدجاج الملكي',
  logo_url TEXT,
  exchange_rate_jod NUMERIC DEFAULT 3.55,
  exchange_rate_usd NUMERIC DEFAULT 3.65,
  rates_updated_at TIMESTAMPTZ DEFAULT NOW(),
  rates_updated_by TEXT,
  branch_daily_targets JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.malaki_portal_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.malaki_portal_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.validate_malaki_user_role()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.role NOT IN ('viewer', 'manager', 'owner') THEN
    RAISE EXCEPTION 'Invalid role: %', NEW.role;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_malaki_role
BEFORE INSERT OR UPDATE ON public.malaki_portal_users
FOR EACH ROW EXECUTE FUNCTION public.validate_malaki_user_role();

CREATE OR REPLACE FUNCTION public.verify_malaki_login(p_username TEXT, p_password TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_user RECORD;
BEGIN
  SELECT * INTO v_user FROM public.malaki_portal_users
  WHERE username = lower(trim(p_username)) AND is_active = true;
  IF v_user IS NULL OR v_user.password_hash != crypt(p_password, v_user.password_hash) THEN
    RETURN jsonb_build_object('success', false, 'error', 'اسم المستخدم أو كلمة المرور غير صحيحة');
  END IF;
  UPDATE public.malaki_portal_users SET last_login = NOW() WHERE id = v_user.id;
  RETURN jsonb_build_object('success', true, 'user', jsonb_build_object(
    'id', v_user.id, 'username', v_user.username, 'full_name', v_user.full_name,
    'role', v_user.role, 'can_see_sales', v_user.can_see_sales,
    'can_see_liquidity', v_user.can_see_liquidity,
    'can_see_all_branches', v_user.can_see_all_branches,
    'allowed_branch_ids', v_user.allowed_branch_ids
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.malaki_create_user(
  p_username TEXT, p_password TEXT, p_full_name TEXT,
  p_role TEXT DEFAULT 'viewer',
  p_can_see_sales BOOLEAN DEFAULT true,
  p_can_see_liquidity BOOLEAN DEFAULT true,
  p_can_see_all_branches BOOLEAN DEFAULT true
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.malaki_portal_users (username, password_hash, full_name, role, can_see_sales, can_see_liquidity, can_see_all_branches)
  VALUES (lower(trim(p_username)), crypt(p_password, gen_salt('bf')), p_full_name, p_role, p_can_see_sales, p_can_see_liquidity, p_can_see_all_branches)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('success', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('success', false, 'error', 'اسم المستخدم موجود مسبقاً');
END;
$$;

CREATE OR REPLACE FUNCTION public.malaki_set_password(p_user_id UUID, p_new_password TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.malaki_portal_users SET password_hash = crypt(p_new_password, gen_salt('bf')) WHERE id = p_user_id;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_cash_box_balance(p_box_id UUID)
RETURNS NUMERIC LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(cb.opening_balance, 0)
    + COALESCE((SELECT SUM(ct.amount) FROM public.cash_transfers ct WHERE ct.to_box_id = p_box_id), 0)
    - COALESCE((SELECT SUM(ct.amount) FROM public.cash_transfers ct WHERE ct.from_box_id = p_box_id), 0)
  FROM public.cash_boxes cb WHERE cb.id = p_box_id;
$$;

INSERT INTO public.malaki_portal_users (username, password_hash, full_name, role)
VALUES ('admin', crypt('Malaki2024!', gen_salt('bf')), 'مالك النظام', 'owner');

INSERT INTO public.malaki_portal_settings (linked_user_id) VALUES (NULL);
