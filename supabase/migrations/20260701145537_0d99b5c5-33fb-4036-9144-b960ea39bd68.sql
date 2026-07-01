
-- Create per-supplier sub-accounts for Malaki (subsidiary ledger)
-- Owner: ccdbcaa5-a585-4d84-a559-a4fc94a6075b

DO $$
DECLARE
  v_owner uuid := 'ccdbcaa5-a585-4d84-a559-a4fc94a6075b';
  r RECORD;
  v_seq INT;
  v_code TEXT;
  v_currency TEXT;
  v_parent TEXT;
BEGIN
  -- Process each parent group (ILS, JOD, USD)
  FOR v_parent, v_currency IN
    SELECT * FROM (VALUES
      ('2110',     'شيكل'),
      ('2110.JOD', 'دينار'),
      ('2110.USD', 'دولار')
    ) AS t(p, c)
  LOOP
    v_seq := 0;

    FOR r IN
      SELECT id, contact_name
      FROM contacts
      WHERE user_id = v_owner
        AND contact_type = 'مورد'
        AND linked_account_code = v_parent
        AND COALESCE(is_archived, false) = false
      ORDER BY created_at, contact_name
    LOOP
      v_seq := v_seq + 1;
      v_code := v_parent || '.' || LPAD(v_seq::TEXT, 4, '0');

      -- Ensure the code isn't already used (safety)
      WHILE EXISTS (
        SELECT 1 FROM accounts WHERE user_id = v_owner AND account_code = v_code
      ) LOOP
        v_seq := v_seq + 1;
        v_code := v_parent || '.' || LPAD(v_seq::TEXT, 4, '0');
      END LOOP;

      INSERT INTO accounts (
        user_id, account_code, account_name, account_type,
        parent_code, currency, is_active, is_system, is_system_protected,
        nature, sub_group_label, notes
      ) VALUES (
        v_owner, v_code, r.contact_name, 'خصوم',
        v_parent, v_currency, true, false, false,
        'credit', 'موردين', 'حساب فرعي للمورد (تم إنشاؤه تلقائياً)'
      );

      UPDATE contacts
      SET linked_account_code = v_code,
          updated_at = now()
      WHERE id = r.id;
    END LOOP;
  END LOOP;
END $$;
