UPDATE pos_categories
SET restricted_cash_box_ids = ARRAY(SELECT DISTINCT unnest(restricted_cash_box_ids || ARRAY['96a5be6e-74c8-4b4e-8e6e-9242105084dd']))
WHERE id IN (
  'c4e72651-c286-4c10-a863-5d13eda0e2e9',
  'ae77f247-f569-4434-b576-f0a8980f2092',
  '66d5e14a-6e08-4136-b2b0-19f1c947d8ba',
  'b2297392-a167-4875-8c51-72854e2de47b',
  'fd9e1562-f503-4aeb-a4ff-854efa3a5b6b',
  '4cc0d0ae-442d-4b46-b0dc-acf7752486c9',
  'e4e744c2-f377-40e8-a3fe-f0bc217edec7',
  'd05c9a8e-f868-4e9d-963c-7a9525b8e1ab',
  'e0998ad4-0299-488c-9f1c-72a71aba51b0'
);