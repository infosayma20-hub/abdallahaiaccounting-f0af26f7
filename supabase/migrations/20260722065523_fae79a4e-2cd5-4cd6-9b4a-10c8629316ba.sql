
-- 1) Create new AR sub-accounts
INSERT INTO public.accounts (user_id, account_code, account_name, parent_code, account_type, nature, currency, is_active, is_system, is_system_protected)
VALUES
  ('0b08eba6-c81a-4f6c-b371-e6e324016e73', '11302296', 'ذمة بيت ابراهيم قادوس', '1130', 'أصول', 'debit', 'شيكل', true, false, false),
  ('0b08eba6-c81a-4f6c-b371-e6e324016e73', '11302297', 'ذمة ريم سنقرط',        '1130', 'أصول', 'debit', 'شيكل', true, false, false),
  ('0b08eba6-c81a-4f6c-b371-e6e324016e73', '11302298', 'ذمة تمارا',            '1130', 'أصول', 'debit', 'شيكل', true, false, false)
ON CONFLICT DO NOTHING;

-- 2) Link contacts to their AR sub-accounts
UPDATE public.contacts SET linked_account_code = '11302296' WHERE id = 'd9c35da5-b922-49e5-9b2d-eac169155b84';
UPDATE public.contacts SET linked_account_code = '11302297' WHERE id = '5d4467dd-f5b9-4083-b61f-700d23e12554';
UPDATE public.contacts SET linked_account_code = '11302298' WHERE id = '63a7d54b-4998-432d-ae7d-aafe87a6d14a';
UPDATE public.contacts SET linked_account_code = '11302095' WHERE id = 'a6b8df85-3908-43c2-9a6b-8098ecb28014';
-- مصعب already has 11302292
UPDATE public.contacts SET linked_account_code = '11302292' WHERE id = '163cd182-448a-4a33-97c9-fe76998c749b' AND (linked_account_code IS NULL OR linked_account_code = '');

-- 3) Reroute the AR postings from parent 11300000 to each customer's sub-account
UPDATE public.transactions SET debit_account_code = '11302296' WHERE id = 'e7080d0c-227f-495b-b82d-17b8bce3416a';
UPDATE public.transactions SET debit_account_code = '11302297' WHERE id = '302f2fb0-e61a-4ca7-9e9d-c8b6e1930b4c';
UPDATE public.transactions SET debit_account_code = '11302095' WHERE id = 'e9cf8e56-0d5c-4784-98af-330d2c5b42d2';
UPDATE public.transactions SET debit_account_code = '11302292' WHERE id = '3cafe9e1-d1a0-432d-8c67-366ab687fd20';
UPDATE public.transactions SET debit_account_code = '2dcc1755-dac3-47e6-96b9-0eb96e4b99e9'::text WHERE 1=0; -- noop guard
UPDATE public.transactions SET debit_account_code = '11302292' WHERE id = '2dcc1755-dac3-47e6-96b9-0eb96e4b99e9';
