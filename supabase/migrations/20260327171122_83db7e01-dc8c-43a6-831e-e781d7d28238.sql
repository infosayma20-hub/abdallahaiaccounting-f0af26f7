
-- Step 1: Create parent account 2180 (ذمم موظفين) under التزامات for malaky user
INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, is_system, is_active, is_system_protected)
SELECT '0b08eba6-c81a-4f6c-b371-e6e324016e73', '2180', 'ذمم موظفين', 'التزامات', '2100', true, true, false
WHERE NOT EXISTS (SELECT 1 FROM public.accounts WHERE account_code = '2180' AND user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73');

-- Step 2: Recode all employee sub-accounts from 4-digit (118x) to 5-digit (2180x)
-- We'll use a sequential numbering: 21801, 21802, 21803, ...
DO $$
DECLARE
  v_user_id UUID := '0b08eba6-c81a-4f6c-b371-e6e324016e73';
  v_rec RECORD;
  v_counter INT := 1;
  v_new_code TEXT;
  v_old_code TEXT;
BEGIN
  FOR v_rec IN 
    SELECT id, account_code, account_name 
    FROM public.accounts 
    WHERE parent_code = '1180' AND user_id = v_user_id 
    ORDER BY account_code ASC
  LOOP
    v_old_code := v_rec.account_code;
    v_new_code := '2180' || LPAD(v_counter::TEXT, 1, '0');
    -- For 5-digit codes: 21801, 21802, ..., 21899, then 21900...
    v_new_code := (21800 + v_counter)::TEXT;
    
    -- Update the account code and parent
    UPDATE public.accounts 
    SET account_code = v_new_code, 
        parent_code = '2180', 
        account_type = 'التزامات'
    WHERE id = v_rec.id;
    
    -- Update transactions referencing old code
    UPDATE public.transactions 
    SET debit_account_code = v_new_code 
    WHERE debit_account_code = v_old_code AND user_id = v_user_id;
    
    UPDATE public.transactions 
    SET credit_account_code = v_new_code 
    WHERE credit_account_code = v_old_code AND user_id = v_user_id;
    
    v_counter := v_counter + 1;
  END LOOP;
  
  -- Update transactions referencing parent 1180
  UPDATE public.transactions 
  SET debit_account_code = '2180' 
  WHERE debit_account_code = '1180' AND user_id = v_user_id;
  
  UPDATE public.transactions 
  SET credit_account_code = '2180' 
  WHERE credit_account_code = '1180' AND user_id = v_user_id;
  
  -- Delete old parent account 1180
  DELETE FROM public.accounts 
  WHERE account_code = '1180' AND user_id = v_user_id;
  
  -- Re-resolve account IDs for affected transactions
  UPDATE public.transactions t
  SET account_id_debit = a.id
  FROM public.accounts a
  WHERE a.account_code = t.debit_account_code 
    AND a.user_id = t.user_id
    AND t.user_id = v_user_id
    AND t.debit_account_code LIKE '218%';
    
  UPDATE public.transactions t
  SET account_id_credit = a.id
  FROM public.accounts a
  WHERE a.account_code = t.credit_account_code 
    AND a.user_id = t.user_id
    AND t.user_id = v_user_id
    AND t.credit_account_code LIKE '218%';
END;
$$;
