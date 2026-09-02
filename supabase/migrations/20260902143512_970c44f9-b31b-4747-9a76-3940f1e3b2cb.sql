UPDATE public.cash_boxes
SET type = 'pos',
    branch_id = 'd355ab2b-a2d7-439b-872f-f8c0df4e4df2',
    updated_at = now()
WHERE id IN ('6aedfda2-4e3f-4aeb-bda9-052f6b7f36a3','6c21e9d5-d9e6-42c3-9f05-ff444236fdfd');