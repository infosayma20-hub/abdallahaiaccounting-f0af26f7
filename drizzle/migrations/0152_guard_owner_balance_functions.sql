CREATE OR REPLACE FUNCTION public.can_access_owner_data(p_owner uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT auth.uid() IS NULL
      OR public.is_team_member(auth.uid(), p_owner)
      OR public.has_role(auth.uid(), 'super_admin')
      OR EXISTS (SELECT 1 FROM public.holding_members hm
                 JOIN public.holding_companies hc ON hc.holding_id = hm.holding_id
                 WHERE hm.auth_user_id = auth.uid() AND hc.owner_id = p_owner AND hc.is_active);
$$;
REVOKE ALL ON FUNCTION public.can_access_owner_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_owner_data(uuid) TO authenticated, service_role;

ALTER FUNCTION public.get_all_cash_box_balances(uuid) RENAME TO _get_all_cash_box_balances_unguarded;
ALTER FUNCTION public.get_cash_box_native_balances(uuid) RENAME TO _get_cash_box_native_balances_unguarded;
ALTER FUNCTION public.get_cash_boxes_balances_bulk(uuid) RENAME TO _get_cash_boxes_balances_bulk_unguarded;
ALTER FUNCTION public.get_contact_balance_reconciliation(uuid) RENAME TO _get_contact_balance_reconciliation_unguarded;
ALTER FUNCTION public.get_owner_sales_fast(uuid, date, date, boolean) RENAME TO _get_owner_sales_fast_unguarded;
ALTER FUNCTION public.get_rep_customers_with_balances(uuid, uuid) RENAME TO _get_rep_customers_with_balances_unguarded;
ALTER FUNCTION public.get_sub_account_balances(uuid, text[]) RENAME TO _get_sub_account_balances_unguarded;

REVOKE ALL ON FUNCTION public._get_all_cash_box_balances_unguarded(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._get_cash_box_native_balances_unguarded(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._get_cash_boxes_balances_bulk_unguarded(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._get_contact_balance_reconciliation_unguarded(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._get_owner_sales_fast_unguarded(uuid, date, date, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._get_rep_customers_with_balances_unguarded(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._get_sub_account_balances_unguarded(uuid, text[]) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.get_all_cash_box_balances(p_owner uuid)
RETURNS TABLE(account_code text, balance numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM public._get_all_cash_box_balances_unguarded(p_owner) WHERE public.can_access_owner_data(p_owner);
$$;
CREATE FUNCTION public.get_cash_box_native_balances(p_owner uuid)
RETURNS TABLE(account_code text, balance_ils numeric, balance_foreign numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM public._get_cash_box_native_balances_unguarded(p_owner) WHERE public.can_access_owner_data(p_owner);
$$;
CREATE FUNCTION public.get_cash_boxes_balances_bulk(p_user_id uuid)
RETURNS TABLE(box_id uuid, balance numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM public._get_cash_boxes_balances_bulk_unguarded(p_user_id) WHERE public.can_access_owner_data(p_user_id);
$$;
CREATE FUNCTION public.get_contact_balance_reconciliation(p_user_id uuid)
RETURNS TABLE(contact_id uuid, contact_name text, contact_type text, linked_account_code text, is_archived boolean, is_active boolean, stored_balance numeric, ledger_debits numeric, ledger_credits numeric, ledger_balance numeric, variance numeric, tx_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM public._get_contact_balance_reconciliation_unguarded(p_user_id) WHERE public.can_access_owner_data(p_user_id);
$$;
CREATE FUNCTION public.get_owner_sales_fast(p_user_id uuid, p_from date, p_to date, p_with_details boolean DEFAULT true)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN public.can_access_owner_data(p_user_id)
    THEN public._get_owner_sales_fast_unguarded(p_user_id, p_from, p_to, p_with_details) END;
$$;
CREATE FUNCTION public.get_rep_customers_with_balances(p_user_id uuid, p_sales_rep_id uuid)
RETURNS TABLE(contact_id uuid, contact_name text, phone text, linked_account_code text, balance numeric, last_tx_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM public._get_rep_customers_with_balances_unguarded(p_user_id, p_sales_rep_id) WHERE public.can_access_owner_data(p_user_id);
$$;
CREATE FUNCTION public.get_sub_account_balances(p_owner uuid, p_parents text[])
RETURNS TABLE(account_code text, balance numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT * FROM public._get_sub_account_balances_unguarded(p_owner, p_parents) WHERE public.can_access_owner_data(p_owner);
$$;

REVOKE ALL ON FUNCTION public.get_all_cash_box_balances(uuid), public.get_cash_box_native_balances(uuid), public.get_cash_boxes_balances_bulk(uuid), public.get_contact_balance_reconciliation(uuid), public.get_owner_sales_fast(uuid, date, date, boolean), public.get_rep_customers_with_balances(uuid, uuid), public.get_sub_account_balances(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_all_cash_box_balances(uuid), public.get_cash_box_native_balances(uuid), public.get_cash_boxes_balances_bulk(uuid), public.get_contact_balance_reconciliation(uuid), public.get_owner_sales_fast(uuid, date, date, boolean), public.get_rep_customers_with_balances(uuid, uuid), public.get_sub_account_balances(uuid, text[]) TO authenticated, service_role;