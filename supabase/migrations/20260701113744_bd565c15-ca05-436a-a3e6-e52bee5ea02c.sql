-- Reassign orphan voucher + linked transactions from sub-account (Sarah) to tenant owner (Malaky)
-- Root cause fixed in useSaveJournalVoucher (now uses dataOwnerId). This backfills the single
-- broken entry so it appears on the cash-box statement.

UPDATE public.transactions
SET user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73'
WHERE id = '19181529-d4d7-4b4b-b568-ff7abc281001'
  AND user_id = 'e68319e6-1773-4f25-885e-4523dbe7216b';

UPDATE public.vouchers
SET user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73'
WHERE id = '154f7cec-feb2-4de4-a6ae-98c9a08ebd8c'
  AND user_id = 'e68319e6-1773-4f25-885e-4523dbe7216b';

UPDATE public.voucher_lines vl
SET voucher_id = vl.voucher_id
WHERE voucher_id = '154f7cec-feb2-4de4-a6ae-98c9a08ebd8c';
-- (voucher_lines don't carry user_id; parent voucher fix is enough)