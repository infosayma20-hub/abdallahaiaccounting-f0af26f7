
DO $$
DECLARE
  r RECORD;
  v_owner_company uuid;
BEGIN
  FOR r IN
    SELECT e.auth_user_id, e.user_id AS owner_id, e.id AS emp_id
    FROM employees e
    WHERE e.auth_user_id IS NOT NULL
      AND e.user_id IS NOT NULL
      AND e.user_id <> e.auth_user_id
      AND (
        EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id=e.auth_user_id AND ur.role::text <> 'employee')
        OR EXISTS (SELECT 1 FROM companies c WHERE c.owner_id=e.auth_user_id)
        OR EXISTS (SELECT 1 FROM subscriptions s WHERE s.user_id=e.auth_user_id)
      )
  LOOP
    SELECT company_id INTO v_owner_company FROM profiles WHERE user_id=r.owner_id;

    -- Strip wrong roles, ensure employee role
    DELETE FROM user_roles WHERE user_id=r.auth_user_id AND role::text <> 'employee';
    INSERT INTO user_roles(user_id, role) VALUES (r.auth_user_id, 'employee')
      ON CONFLICT (user_id, role) DO NOTHING;

    -- Fix profile
    UPDATE profiles
       SET role='employee',
           invited_by=COALESCE(invited_by, r.owner_id),
           company_id=COALESCE(v_owner_company, company_id)
     WHERE user_id=r.auth_user_id;

    -- Drop bogus subscription
    DELETE FROM subscriptions WHERE user_id=r.auth_user_id;

    -- Drop bogus empty companies owned by this employee auth account
    DELETE FROM companies
     WHERE owner_id=r.auth_user_id
       AND NOT EXISTS (SELECT 1 FROM invoices    WHERE user_id=r.auth_user_id)
       AND NOT EXISTS (SELECT 1 FROM transactions WHERE user_id=r.auth_user_id)
       AND NOT EXISTS (SELECT 1 FROM accounts    WHERE user_id=r.auth_user_id)
       AND NOT EXISTS (SELECT 1 FROM contacts    WHERE user_id=r.auth_user_id)
       AND NOT EXISTS (SELECT 1 FROM products    WHERE user_id=r.auth_user_id);
  END LOOP;
END $$;
