create or replace function public.get_my_bootstrap()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_roles jsonb;
  v_profile jsonb;
  v_employee jsonb;
  v_pos_user jsonb;
  v_portal_user jsonb;
  v_owner uuid;
  v_has_accounts boolean;
  v_company jsonb;
  v_settings jsonb;
  v_subscription jsonb;
  v_feature_perms jsonb;
  v_app_overrides jsonb;
begin
  if v_uid is null then
    return null;
  end if;

  select coalesce(jsonb_agg(role), '[]'::jsonb) into v_roles
  from user_roles where user_id = v_uid;

  select to_jsonb(p) into v_profile from (
    select role, invited_by, company_id, company_name, work_field, setup_completed
    from profiles where user_id = v_uid
  ) p;

  select to_jsonb(e) into v_employee from (
    select id, user_id, is_active, is_terminated, is_manager, is_hr_manager,
           can_view_team, can_manage_schedule, can_manage_attendance,
           is_receiver, can_direct_receive, can_stock_count
    from employees where auth_user_id = v_uid limit 1
  ) e;

  select to_jsonb(pu) into v_pos_user from (
    select id, user_id, is_active, is_call_center, hide_employee_workspace
    from pos_users where auth_user_id = v_uid limit 1
  ) pu;

  select to_jsonb(mu) into v_portal_user from (
    select id, user_id, is_active from malaki_portal_users where auth_user_id = v_uid limit 1
  ) mu;

  v_owner := coalesce(public.get_team_owner_id(v_uid), v_uid);

  select exists(select 1 from accounts where user_id = v_owner) into v_has_accounts;

  select to_jsonb(c) into v_company from (
    select id, name, logo_url, address, phone, email, tax_number
    from companies where owner_id = v_uid limit 1
  ) c;

  if v_company is null and (v_profile->>'company_id') is not null then
    select to_jsonb(c) into v_company from (
      select id, name, logo_url, address, phone, email, tax_number
      from companies where id = (v_profile->>'company_id')::uuid limit 1
    ) c;
  end if;

  select to_jsonb(s) into v_settings from (
    select company_name, logo_url, address, phone, email, tax_number
    from company_settings where user_id = v_uid limit 1
  ) s;

  select to_jsonb(sub) into v_subscription from (
    select s.id, s.status, s.billing_cycle, s.current_period_start, s.current_period_end,
           s.trial_ends_at, s.plan_key,
           p.name as plan_name, p.name_ar as plan_name_ar, p.monthly_price,
           p.tier, p.enabled_modules, p.max_users, p.max_invoices_per_month
    from subscriptions s
    join plans p on p.id = s.plan_id
    where s.user_id = v_owner
      and s.status in ('active','trial','trialing','grace','grace_period','past_due','expired')
    order by s.created_at desc
    limit 1
  ) sub;

  select coalesce(jsonb_agg(fp), '[]'::jsonb) into v_feature_perms from (
    select app_key, feature_key, permission_key, access_state
    from user_feature_permissions where target_user_id = v_uid
  ) fp;

  select coalesce(jsonb_agg(ao), '[]'::jsonb) into v_app_overrides from (
    select app_key, access_state
    from user_app_access_overrides where target_user_id = v_uid
  ) ao;

  return jsonb_build_object(
    'roles', v_roles,
    'profile', v_profile,
    'employee', v_employee,
    'pos_user', v_pos_user,
    'portal_user', v_portal_user,
    'owner_id', v_owner,
    'has_accounts', v_has_accounts,
    'company', v_company,
    'company_settings', v_settings,
    'subscription', v_subscription,
    'feature_permissions', v_feature_perms,
    'app_overrides', v_app_overrides
  );
end;
$$;

revoke all on function public.get_my_bootstrap() from public;
grant execute on function public.get_my_bootstrap() to authenticated;