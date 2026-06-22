
ALTER TABLE public.branches
  ADD COLUMN IF NOT EXISTS gl_cash_usd_account_code text,
  ADD COLUMN IF NOT EXISTS gl_cash_jod_account_code text,
  ADD COLUMN IF NOT EXISTS gl_cash_eur_account_code text;

CREATE OR REPLACE FUNCTION public.provision_branch_fx_boxes(p_user_id uuid)
RETURNS TABLE(out_branch_id uuid, out_currency text, out_account_code text, out_created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_branch RECORD;
  v_cfg RECORD;
  v_seq int;
  v_code text;
  v_existing text;
  v_created boolean;
BEGIN
  FOR v_branch IN
    SELECT id, name FROM public.branches
    WHERE user_id = p_user_id AND is_active = true
    ORDER BY created_at NULLS LAST, name
  LOOP
    FOR v_cfg IN
      SELECT * FROM (VALUES
        ('USD','دولار','1111','cash_usd','صندوق الدولار'),
        ('JOD','دينار','1112','cash_jod','صندوق الدينار'),
        ('EUR','يورو','1113','cash_eur','صندوق اليورو')
      ) AS t(ccy_short, ccy_ar, parent_code, sys_role, parent_name)
    LOOP
      EXECUTE format('SELECT gl_cash_%s_account_code FROM public.branches WHERE id = $1',
                     lower(v_cfg.ccy_short))
        INTO v_existing USING v_branch.id;

      IF v_existing IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.accounts
        WHERE user_id = p_user_id AND account_code = v_existing
      ) THEN
        out_branch_id := v_branch.id;
        out_currency := v_cfg.ccy_short;
        out_account_code := v_existing;
        out_created := false;
        RETURN NEXT;
        CONTINUE;
      END IF;

      v_seq := 1;
      LOOP
        v_code := v_cfg.parent_code || lpad(v_seq::text, 2, '0');
        IF NOT EXISTS (
          SELECT 1 FROM public.accounts
          WHERE user_id = p_user_id AND account_code = v_code
        ) THEN
          EXIT;
        END IF;
        v_seq := v_seq + 1;
        IF v_seq > 99 THEN
          RAISE EXCEPTION 'لا يمكن توفير حساب فرعي تحت %', v_cfg.parent_code;
        END IF;
      END LOOP;

      INSERT INTO public.accounts(
        user_id, account_code, account_name, account_type, parent_code,
        is_system, is_active, currency, system_role, nature,
        description_ar, sub_group_label
      ) VALUES (
        p_user_id, v_code,
        v_cfg.parent_name || ' - ' || v_branch.name,
        'asset', v_cfg.parent_code,
        false, true, v_cfg.ccy_ar,
        v_cfg.sys_role || '_branch',
        'debit',
        'صندوق ' || v_cfg.ccy_short || ' - فرع ' || v_branch.name,
        'النقدية'
      );
      v_created := true;

      EXECUTE format('UPDATE public.branches SET gl_cash_%s_account_code = $1 WHERE id = $2',
                     lower(v_cfg.ccy_short))
        USING v_code, v_branch.id;

      out_branch_id := v_branch.id;
      out_currency := v_cfg.ccy_short;
      out_account_code := v_code;
      out_created := v_created;
      RETURN NEXT;
    END LOOP;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.provision_branch_fx_boxes(uuid) TO authenticated, service_role;
