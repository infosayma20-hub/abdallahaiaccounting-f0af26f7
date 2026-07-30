DO $$
BEGIN
  UPDATE public.transactions t
  SET debit_account_code = t.debit_account_code,
      credit_account_code = t.credit_account_code
  FROM public.contacts c
  WHERE t.user_id = '6fb346d9-f8a6-44a7-a99c-fd2b440f6060'
    AND c.id = t.contact_id
    AND c.user_id = t.user_id
    AND c.linked_account_code IS NOT NULL
    AND COALESCE(t.is_deleted, false) = false
    AND (t.debit_account_code = '1131' OR t.credit_account_code = '1131');
END;
$$;