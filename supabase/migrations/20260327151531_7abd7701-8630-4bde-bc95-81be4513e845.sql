UPDATE public.pos_categories
SET restricted_cash_box_ids = ARRAY['6b1fa2a3-02a7-4db3-bc8e-ddcd8f2c97a2', 'f91ca604-137a-4970-8c1e-9aadf4ec0ee4']
WHERE user_id = '0b08eba6-c81a-4f6c-b371-e6e324016e73'
  AND id IN (
    'c6c92ec1-32d7-4660-b883-e1af2658410c',
    'e4e744c2-f377-40e8-a3fe-f0bc217edec7',
    'c4e72651-c286-4c10-a863-5d13eda0e2e9',
    'd05c9a8e-f868-4e9d-963c-7a9525b8e1ab',
    'ae77f247-f569-4434-b576-f0a8980f2092',
    'e0998ad4-0299-488c-9f1c-72a71aba51b0',
    '66d5e14a-6e08-4136-b2b0-19f1c947d8ba',
    'b2297392-a167-4875-8c51-72854e2de47b',
    'fd9e1562-f503-4aeb-a4ff-854efa3a5b6b',
    '4cc0d0ae-442d-4b46-b0dc-acf7752486c9'
  );