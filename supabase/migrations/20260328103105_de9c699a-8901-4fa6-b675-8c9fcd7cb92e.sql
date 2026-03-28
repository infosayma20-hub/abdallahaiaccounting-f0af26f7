
-- Travel-specific accounts (insert only if not existing for the user)
-- We'll add these as template accounts that get created per-user via a function

-- Create a function to ensure travel accounts exist for a user
CREATE OR REPLACE FUNCTION public.ensure_travel_accounts(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Revenue accounts
  INSERT INTO accounts (user_id, account_code, account_name, account_type, parent_code, is_system, system_role)
  VALUES 
    (p_user_id, '4150', 'إيرادات السياحة والسفر', 'إيرادات', '4100', true, 'travel_revenue'),
    (p_user_id, '4151', 'إيرادات الحج والعمرة', 'إيرادات', '4150', true, 'travel_hajj_revenue'),
    (p_user_id, '4152', 'إيرادات تذاكر الطيران', 'إيرادات', '4150', true, 'travel_flight_revenue'),
    (p_user_id, '4153', 'إيرادات الفنادق', 'إيرادات', '4150', true, 'travel_hotel_revenue'),
    (p_user_id, '4154', 'إيرادات التأشيرات', 'إيرادات', '4150', true, 'travel_visa_revenue'),
    (p_user_id, '4155', 'إيرادات الباقات السياحية', 'إيرادات', '4150', true, 'travel_package_revenue')
  ON CONFLICT (user_id, account_code) DO NOTHING;

  -- Cost accounts
  INSERT INTO accounts (user_id, account_code, account_name, account_type, parent_code, is_system, system_role)
  VALUES 
    (p_user_id, '5300', 'تكاليف السياحة والسفر', 'مصاريف', '5100', true, 'travel_cost'),
    (p_user_id, '5310', 'تكاليف الحج والعمرة', 'مصاريف', '5300', true, 'travel_hajj_cost'),
    (p_user_id, '5320', 'تكاليف تذاكر الطيران', 'مصاريف', '5300', true, 'travel_flight_cost'),
    (p_user_id, '5330', 'تكاليف الفنادق', 'مصاريف', '5300', true, 'travel_hotel_cost'),
    (p_user_id, '5340', 'تكاليف التأشيرات', 'مصاريف', '5300', true, 'travel_visa_cost'),
    (p_user_id, '5350', 'تكاليف النقل والمواصلات', 'مصاريف', '5300', true, 'travel_transport_cost')
  ON CONFLICT (user_id, account_code) DO NOTHING;

  -- Receivables/Payables sub-accounts for travel
  INSERT INTO accounts (user_id, account_code, account_name, account_type, parent_code, is_system, system_role)
  VALUES 
    (p_user_id, '1135', 'ذمم عملاء السياحة', 'أصول', '1130', true, 'travel_receivable'),
    (p_user_id, '2115', 'ذمم موردي السياحة', 'خصوم', '2110', true, 'travel_payable')
  ON CONFLICT (user_id, account_code) DO NOTHING;
END;
$$;
