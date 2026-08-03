DO $$
DECLARE u uuid := '1042ca69-b091-4dc4-8722-34b326fdc9cb';
BEGIN
  -- 1) Re-parent + rename currency sub-accounts under بنك القدس (112001)
  UPDATE public.accounts SET parent_code='112001', account_name='جاري شيكل - بنك القدس', updated_at=now()
    WHERE user_id=u AND account_code='1123';
  UPDATE public.accounts SET parent_code='112001', account_name='جاري دولار - بنك القدس', updated_at=now()
    WHERE user_id=u AND account_code='1124';
  UPDATE public.accounts SET parent_code='112001', account_name='جاري دينار - بنك القدس', updated_at=now()
    WHERE user_id=u AND account_code='1125';

  -- 2) Deactivate unused template bank accounts (no transactions for this user)
  UPDATE public.accounts a SET is_active=false, updated_at=now()
    WHERE a.user_id=u AND a.account_code IN ('1121','1122')
      AND NOT EXISTS (SELECT 1 FROM public.transactions t
                      WHERE t.user_id=u AND t.is_deleted=false
                        AND (t.debit_account_code=a.account_code OR t.credit_account_code=a.account_code));

  -- 3) Fix existing bank record name (single ILS record already linked to 1123)
  UPDATE public.bank_accounts SET name='جاري شيكل - بنك القدس', bank_name='بنك القدس', updated_at=now()
    WHERE user_id=u AND gl_account_code='1123';

  -- 4) Add USD / JOD bank records only if absent
  INSERT INTO public.bank_accounts (user_id, name, bank_name, currency, gl_account_code, account_type, is_active, opening_balance)
  SELECT u, 'جاري دولار - بنك القدس', 'بنك القدس', 'USD', '1124', 'current', true, 0
  WHERE NOT EXISTS (SELECT 1 FROM public.bank_accounts b WHERE b.user_id=u AND b.gl_account_code='1124');

  INSERT INTO public.bank_accounts (user_id, name, bank_name, currency, gl_account_code, account_type, is_active, opening_balance)
  SELECT u, 'جاري دينار - بنك القدس', 'بنك القدس', 'JOD', '1125', 'current', true, 0
  WHERE NOT EXISTS (SELECT 1 FROM public.bank_accounts b WHERE b.user_id=u AND b.gl_account_code='1125');
END $$;