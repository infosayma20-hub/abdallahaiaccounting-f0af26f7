DO $$
DECLARE
  r record;
  allow text[] := ARRAY[
    -- public-facing screens
    'kds_resolve_display_code_v2','kds_device_heartbeat','kds_get_active_orders','kds_get_display_settings',
    'kds_recent_call_events','kds_get_kitchen_tickets','kds_recall_order_by_token','kds_update_ticket_status',
    'kds_mark_order_ready_by_number','loyalty_card_public','qr_menu_get_menu','qr_menu_resolve',
    'get_kiosk_bootstrap','create_kiosk_call_center_order','verify_kiosk_exit_pin','log_kiosk_pinpad_tx',
    'get_branch_tracking_board','mark_branch_tracking_delivered','get_holding_branding_by_slug',
    'get_tenant_company_logo','apply_referral_signup','wl_track','wl_self_status',
    -- functions referenced inside RLS policies (must stay executable by the querying role)
    'accountant_perm','can_manage_employee_documents','can_view_complaint_row','can_view_form_template',
    'can_view_historical_sales','can_view_internal_message','can_view_marketing_campaigns',
    'get_employee_id_for_user','get_rep_owner_id','get_rep_warehouse_id','get_team_owner_id',
    'has_feature_permission','has_role','hr_chat_employee_of_user','hr_chat_is_hr_thread','hr_chat_is_my_thread',
    'is_branch_manager_of','is_employee_of_owner','is_holding_member','is_hr_admin','is_managed_branch_employee',
    'is_manager_of_employee','is_my_team_employee','is_own_employee_row','is_sales_rep','is_self_employee',
    'is_sparta_holding_admin','is_sparta_holding_member','is_super_admin','is_team_member','my_org_employee_ids',
    'my_visible_employee_ids','resolve_effective_owner_id','uaao_can_admin_target','uaao_is_actor_admin',
    'user_can_access','user_manages_employee_branch','user_manages_form_branch'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND NOT (p.proname = ANY(allow))
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;