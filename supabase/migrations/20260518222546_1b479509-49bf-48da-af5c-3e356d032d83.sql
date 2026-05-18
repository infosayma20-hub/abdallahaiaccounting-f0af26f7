
-- Part 1: Schema changes
ALTER TABLE transactions
ADD COLUMN sales_rep_id uuid REFERENCES sales_representatives(id) ON DELETE SET NULL;

COMMENT ON COLUMN transactions.sales_rep_id IS 
  'Sales rep associated with this transaction (for sales analytics and commission tracking)';

CREATE INDEX idx_transactions_sales_rep_id ON transactions(sales_rep_id);

ALTER TABLE sales_representatives
ADD COLUMN contact_id uuid REFERENCES contacts(id) ON DELETE RESTRICT;

COMMENT ON COLUMN sales_representatives.contact_id IS 
  'Contact record representing this sales rep as an internal account. Auto-linked or auto-created via trigger.';

CREATE INDEX idx_sales_reps_contact_id ON sales_representatives(contact_id);

-- Part 2.1: Account code generator
CREATE OR REPLACE FUNCTION generate_sales_rep_account_code(
  p_user_id uuid
)
RETURNS text AS $$
DECLARE
  v_next_seq int;
BEGIN
  SELECT COALESCE(
    MAX(CAST(SUBSTRING(account_code FROM 10) AS INTEGER)),
    0
  ) + 1 INTO v_next_seq
  FROM accounts
  WHERE user_id = p_user_id
    AND account_code LIKE '1130-REP-%'
    AND SUBSTRING(account_code FROM 10) ~ '^[0-9]+$';

  RETURN '1130-REP-' || LPAD(v_next_seq::text, 3, '0');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Part 2.2: Helper - link or create contact + sub-account for a rep
CREATE OR REPLACE FUNCTION ensure_sales_rep_contact(
  p_user_id uuid,
  p_rep_id uuid,
  p_full_name text,
  p_phone text,
  p_email text,
  p_is_active boolean
)
RETURNS uuid AS $$
DECLARE
  v_contact_id uuid;
  v_account_code text;
  v_existing_code text;
  v_name text := COALESCE(NULLIF(TRIM(p_full_name), ''), 'مندوب');
BEGIN
  -- Try to find an existing contact with the same name for this user
  SELECT id, linked_account_code INTO v_contact_id, v_existing_code
  FROM contacts
  WHERE user_id = p_user_id
    AND contact_name = v_name
  LIMIT 1;

  IF v_contact_id IS NOT NULL THEN
    -- Reuse: ensure it has a linked sub-account under 1130
    IF v_existing_code IS NULL OR v_existing_code = '' OR v_existing_code NOT LIKE '1130-REP-%' THEN
      v_account_code := generate_sales_rep_account_code(p_user_id);
      INSERT INTO accounts (
        id, user_id, account_code, account_name, account_type,
        parent_code, nature, is_active, description_ar
      ) VALUES (
        gen_random_uuid(), p_user_id, v_account_code,
        'ذمم — ' || v_name, 'asset', '1130', 'debit',
        COALESCE(p_is_active, true),
        'تم إنشاء تلقائياً لمندوب: ' || v_name
      );
      UPDATE contacts
      SET linked_account_code = v_account_code,
          contact_type = CASE WHEN contact_type IN ('عميل','زبون','customer') THEN 'مندوب' ELSE contact_type END,
          updated_at = now()
      WHERE id = v_contact_id;
    END IF;
    RETURN v_contact_id;
  END IF;

  -- Create fresh sub-account + contact
  v_account_code := generate_sales_rep_account_code(p_user_id);

  INSERT INTO accounts (
    id, user_id, account_code, account_name, account_type,
    parent_code, nature, is_active, description_ar
  ) VALUES (
    gen_random_uuid(), p_user_id, v_account_code,
    'ذمم — ' || v_name, 'asset', '1130', 'debit',
    COALESCE(p_is_active, true),
    'تم إنشاء تلقائياً لمندوب: ' || v_name || ' (rep ID: ' || p_rep_id::text || ')'
  );

  INSERT INTO contacts (
    id, user_id, contact_name, contact_type, phone, email,
    linked_account_code, is_active, notes
  ) VALUES (
    gen_random_uuid(), p_user_id, v_name, 'مندوب',
    p_phone, p_email, v_account_code,
    COALESCE(p_is_active, true),
    'حساب داخلي | تم إنشاء تلقائياً للمندوب'
  ) RETURNING id INTO v_contact_id;

  RETURN v_contact_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Part 2.3: BEFORE INSERT trigger
CREATE OR REPLACE FUNCTION trg_create_sales_rep_contact()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.contact_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  NEW.contact_id := ensure_sales_rep_contact(
    NEW.user_id, NEW.id, NEW.full_name, NEW.phone, NEW.email, NEW.is_active
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sales_rep_create_contact ON sales_representatives;
CREATE TRIGGER trg_sales_rep_create_contact
BEFORE INSERT ON sales_representatives
FOR EACH ROW
WHEN (NEW.contact_id IS NULL)
EXECUTE FUNCTION trg_create_sales_rep_contact();

-- Part 2.4: AFTER UPDATE trigger - sync contact data
CREATE OR REPLACE FUNCTION sync_sales_rep_contact_data()
RETURNS TRIGGER AS $$
BEGIN
  IF (
    NEW.full_name IS DISTINCT FROM OLD.full_name
    OR NEW.phone IS DISTINCT FROM OLD.phone
    OR NEW.email IS DISTINCT FROM OLD.email
    OR NEW.is_active IS DISTINCT FROM OLD.is_active
  ) THEN
    UPDATE contacts
    SET
      contact_name = COALESCE(NULLIF(TRIM(NEW.full_name), ''), contact_name),
      phone = COALESCE(NEW.phone, phone),
      email = COALESCE(NEW.email, email),
      is_active = NEW.is_active,
      updated_at = now()
    WHERE id = NEW.contact_id
      AND contact_type = 'مندوب';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sales_rep_sync_contact ON sales_representatives;
CREATE TRIGGER trg_sales_rep_sync_contact
AFTER UPDATE ON sales_representatives
FOR EACH ROW
WHEN (NEW.contact_id IS NOT NULL)
EXECUTE FUNCTION sync_sales_rep_contact_data();

-- Part 3: Backfill existing reps
DO $$
DECLARE
  v_rep record;
  v_contact_id uuid;
BEGIN
  FOR v_rep IN
    SELECT id, user_id, full_name, phone, email, is_active
    FROM sales_representatives
    WHERE contact_id IS NULL
    ORDER BY created_at
  LOOP
    v_contact_id := ensure_sales_rep_contact(
      v_rep.user_id, v_rep.id, v_rep.full_name, v_rep.phone, v_rep.email, v_rep.is_active
    );
    UPDATE sales_representatives
    SET contact_id = v_contact_id
    WHERE id = v_rep.id;
  END LOOP;
END $$;
