DO $mig$
DECLARE
  malaki uuid := '0b08eba6-c81a-4f6c-b371-e6e324016e73';
  moved_tx int;
  moved_pos int;
BEGIN
  -- Safety: ensure both accounts exist
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE user_id=malaki AND account_code='11101') THEN
    RAISE EXCEPTION 'Target account 11101 missing for Malaki';
  END IF;

  -- 1) Migrate posted transactions: 1110 -> 11101 (debit side)
  UPDATE public.transactions
     SET debit_account_code='11101',
         updated_at=now()
   WHERE user_id=malaki
     AND debit_account_code='1110';
  GET DIAGNOSTICS moved_tx = ROW_COUNT;
  RAISE NOTICE 'Moved debit rows: %', moved_tx;

  -- 2) Migrate posted transactions: 1110 -> 11101 (credit side)
  UPDATE public.transactions
     SET credit_account_code='11101',
         updated_at=now()
   WHERE user_id=malaki
     AND credit_account_code='1110';
  GET DIAGNOSTICS moved_tx = ROW_COUNT;
  RAISE NOTICE 'Moved credit rows: %', moved_tx;

  -- 3) Update POS terminals to post cash to 11101
  UPDATE public.pos_terminals
     SET cash_account_code='11101',
         updated_at=now()
   WHERE user_id=malaki
     AND cash_account_code='1110';
  GET DIAGNOSTICS moved_pos = ROW_COUNT;
  RAISE NOTICE 'Updated POS terminals: %', moved_pos;

  -- 4) Update company default cash account
  UPDATE public.company_settings
     SET default_cash_account='11101',
         updated_at=now()
   WHERE user_id=malaki
     AND default_cash_account='1110';

  -- 5) Move the 'cash' system role from parent 1110 -> leaf 11101
  UPDATE public.accounts
     SET system_role=NULL,
         is_system_protected=false,
         updated_at=now()
   WHERE user_id=malaki AND account_code='1110';

  UPDATE public.accounts
     SET system_role='cash',
         is_system_protected=true,
         updated_at=now()
   WHERE user_id=malaki AND account_code='11101';

  -- 6) Sanity: no leftover postings on 1110
  IF EXISTS (
    SELECT 1 FROM public.transactions
     WHERE user_id=malaki
       AND (debit_account_code='1110' OR credit_account_code='1110')
       AND COALESCE(is_deleted,false)=false
  ) THEN
    RAISE EXCEPTION 'Leftover postings still reference 1110';
  END IF;
END
$mig$;