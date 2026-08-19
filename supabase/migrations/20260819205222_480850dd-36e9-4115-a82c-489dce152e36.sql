CREATE TABLE public.portal_owner_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  portal_user_id uuid NOT NULL REFERENCES public.malaki_portal_users(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (portal_user_id, contact_id)
);

GRANT SELECT ON public.portal_owner_contacts TO authenticated;
GRANT ALL ON public.portal_owner_contacts TO service_role;

ALTER TABLE public.portal_owner_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners read own mapping"
ON public.portal_owner_contacts FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.malaki_portal_users pu
    WHERE pu.id = portal_owner_contacts.portal_user_id
      AND (pu.auth_user_id = auth.uid() OR pu.user_id = auth.uid())
  )
);

CREATE POLICY "Tenant owner manages mapping"
ON public.portal_owner_contacts FOR ALL TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.malaki_portal_users pu WHERE pu.id = portal_owner_contacts.portal_user_id AND pu.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.malaki_portal_users pu WHERE pu.id = portal_owner_contacts.portal_user_id AND pu.user_id = auth.uid())
);

CREATE TRIGGER trg_portal_owner_contacts_updated_at
BEFORE UPDATE ON public.portal_owner_contacts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.portal_owner_contacts (portal_user_id, contact_id, display_name)
VALUES
  ('74627447-7df8-4570-abea-6b21d7cd2bbf', '41debe1f-a8b9-4840-a962-d13ca200cfdd', 'كمال قتلوني (الحساب الموحّد)'),
  ('52fc73e4-10dd-4ecf-9865-de81b7a907ca', 'a73a21f7-05c6-4a76-aef2-68bb3da7a7ec', 'مصعب قتلوني (الحساب الموحّد)')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.portal_get_my_drawings(p_from date DEFAULT NULL, p_to date DEFAULT NULL)
RETURNS TABLE(
  contact_name text,
  account_code text,
  is_liability boolean,
  transaction_id uuid,
  transaction_date date,
  description text,
  reference text,
  transaction_type text,
  debit numeric,
  credit numeric,
  running_balance numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contact_id uuid;
  v_owner uuid;
  v_code text;
  v_name text;
  v_liab boolean;
  v_from date := COALESCE(p_from, date_trunc('year', CURRENT_DATE)::date);
  v_to   date := COALESCE(p_to, CURRENT_DATE);
BEGIN
  SELECT poc.contact_id, pu.user_id, COALESCE(poc.display_name, c.contact_name), c.linked_account_code
    INTO v_contact_id, v_owner, v_name, v_code
  FROM public.portal_owner_contacts poc
  JOIN public.malaki_portal_users pu ON pu.id = poc.portal_user_id
  JOIN public.contacts c ON c.id = poc.contact_id
  WHERE pu.auth_user_id = auth.uid() AND pu.is_active = true
  LIMIT 1;

  IF v_contact_id IS NULL THEN
    RETURN;
  END IF;

  v_liab := COALESCE(v_code, '') LIKE '2%';

  RETURN QUERY
  WITH lines AS (
    SELECT t.id, t.transaction_date, t.description, t.reference, t.transaction_type, t.created_at,
           CASE WHEN v_code IS NOT NULL AND t.debit_account_code = v_code THEN t.amount
                WHEN v_code IS NULL AND t.debit_account_code LIKE CASE WHEN v_liab THEN '2%' ELSE '113%' END THEN t.amount
                ELSE 0 END AS debit,
           CASE WHEN v_code IS NOT NULL AND t.credit_account_code = v_code THEN t.amount
                WHEN v_code IS NULL AND t.credit_account_code LIKE CASE WHEN v_liab THEN '2%' ELSE '113%' END THEN t.amount
                ELSE 0 END AS credit
    FROM public.transactions t
    WHERE t.contact_id = v_contact_id
      AND t.user_id = v_owner
      AND t.is_deleted = false
      AND t.transaction_date BETWEEN v_from AND v_to
  )
  SELECT v_name, v_code, v_liab, l.id, l.transaction_date, l.description, l.reference, l.transaction_type,
         l.debit, l.credit,
         SUM(CASE WHEN v_liab THEN l.credit - l.debit ELSE l.debit - l.credit END)
           OVER (ORDER BY l.transaction_date, l.created_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)::numeric
  FROM lines l
  WHERE l.debit <> 0 OR l.credit <> 0
  ORDER BY l.transaction_date, l.created_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_get_my_drawings(date, date) TO authenticated;