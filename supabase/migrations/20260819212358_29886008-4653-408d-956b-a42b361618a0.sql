
INSERT INTO public.accounts (user_id, account_code, account_name, account_type, parent_code, is_active, nature, currency)
SELECT '0b08eba6-c81a-4f6c-b371-e6e324016e73', '21100071', 'ذمة مصعب قتلوني (موحّد)', a.account_type, a.parent_code, true, a.nature, a.currency
FROM public.accounts a
WHERE a.user_id='0b08eba6-c81a-4f6c-b371-e6e324016e73' AND a.account_code='21100001'
ON CONFLICT DO NOTHING;

UPDATE public.accounts SET account_name='ذمم موردين متنوعة'
WHERE user_id='0b08eba6-c81a-4f6c-b371-e6e324016e73' AND account_code='21100001';
