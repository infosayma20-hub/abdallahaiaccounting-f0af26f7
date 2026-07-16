
DO $$
DECLARE
  v_user uuid := '0b08eba6-c81a-4f6c-b371-e6e324016e73';
  v_contact_id uuid;
  v_sub_code text;
BEGIN
  -- 1) Create contact (idempotent by name)
  SELECT id INTO v_contact_id
    FROM public.contacts
   WHERE user_id = v_user AND contact_name = 'شركة كهرباء الشمال'
   LIMIT 1;

  IF v_contact_id IS NULL THEN
    INSERT INTO public.contacts (user_id, contact_name, contact_type, phone, is_active)
    VALUES (v_user, 'شركة كهرباء الشمال', 'عميل', '1700300200', true)
    RETURNING id INTO v_contact_id;
  END IF;

  -- 2) Allocate dedicated AR sub-account under 1130 and link to contact
  v_sub_code := public.resolve_postable_account(v_user, '1130', v_contact_id, 'شركة كهرباء الشمال', 'عميل');

  -- 3) Reassign POS credit-sale AR legs (debit 11300000) for these two orders
  UPDATE public.transactions
     SET debit_account_code = v_sub_code,
         contact_id = v_contact_id
   WHERE user_id = v_user
     AND reference IN ('POS-20260716-0542', 'POS-20260716-0535')
     AND debit_account_code = '11300000';

  -- Reversal for the cancelled order (credit 11300000)
  UPDATE public.transactions
     SET credit_account_code = v_sub_code,
         contact_id = v_contact_id
   WHERE user_id = v_user
     AND reference = 'REV-POS-20260716-0535'
     AND credit_account_code = '11300000';

  -- 4) Link the POS orders to the contact
  UPDATE public.pos_orders
     SET customer_id = v_contact_id
   WHERE user_id = v_user
     AND order_number IN ('POS-20260716-0542', 'POS-20260716-0535');
END $$;
